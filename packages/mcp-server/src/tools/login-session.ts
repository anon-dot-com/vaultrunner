/**
 * Login Session Tools
 * Tools for tracking login sessions and learning patterns
 */

import { z } from "zod";
import { loginHistory, type BrowserStep } from "../history/login-history.js";
import { patternStore } from "../history/pattern-store.js";

// Schema for browser steps
const browserStepSchema = z.object({
  action: z.enum(["fill_field", "click_button", "wait", "navigate"]),
  field: z.string().optional().describe("For fill_field: 'username', 'password', '2fa_code', etc."),
  text: z.string().optional().describe("For click_button: button text like 'Next', 'Sign in'"),
  url: z.string().optional().describe("For navigate: the URL"),
  seconds: z.number().optional().describe("For wait: duration in seconds"),
});

/**
 * Start Login Session Tool
 */
export const startLoginSessionTool = {
  name: "start_login_session",
  description: `Start tracking a login session. Call this BEFORE attempting to log into a site.
Returns any known patterns for this domain to help guide your login flow.
When done, call end_login_session with the browser steps you took.`,
  inputSchema: z.object({
    domain: z.string().describe("The domain being logged into (e.g., 'github.com')"),
    login_url: z.string().optional().describe("The login page URL"),
  }),
  handler: async ({
    domain,
    login_url,
  }: {
    domain: string;
    login_url?: string;
  }) => {
    // Check for existing session
    const existing = loginHistory.getCurrentSession();
    if (existing) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: `A login session is already active for ${existing.domain}. Call end_login_session first.`,
            active_session: {
              id: existing.id,
              domain: existing.domain,
              started_at: existing.startedAt,
            },
          }, null, 2),
        }],
      };
    }

    // Start new session
    const sessionId = loginHistory.startSession(domain, login_url);

    // Check for known pattern
    const patternInfo = patternStore.getPatternInfo(domain);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          session_id: sessionId,
          domain,
          login_url,
          known_pattern: patternInfo.found ? patternInfo.pattern : null,
          hint: patternInfo.hint || "When done, call end_login_session with the browser steps you took via Claude for Chrome.",
        }, null, 2),
      }],
    };
  },
};

/**
 * End Login Session Tool
 */
export const endLoginSessionTool = {
  name: "end_login_session",
  description: `End the current login session. IMPORTANT: Include the browser steps you took via Claude for Chrome so we can learn the login pattern for this domain.

Example steps array:
[
  { "action": "fill_field", "field": "username" },
  { "action": "click_button", "text": "Next" },
  { "action": "fill_field", "field": "password" },
  { "action": "click_button", "text": "Sign in" }
]`,
  inputSchema: z.object({
    success: z.boolean().describe("Whether the login succeeded"),
    steps: z.array(browserStepSchema).optional().describe("Browser steps taken via Claude for Chrome"),
    error: z.string().optional().describe("If failed, what went wrong"),
  }),
  handler: async ({
    success,
    steps,
    error,
  }: {
    success: boolean;
    steps?: BrowserStep[];
    error?: string;
  }) => {
    const session = loginHistory.getCurrentSession();
    if (!session) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "No active login session. Call start_login_session first.",
          }, null, 2),
        }],
      };
    }

    // End the session
    const completed = loginHistory.endSession(success, steps, error);

    if (!completed) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "Failed to end session",
          }, null, 2),
        }],
      };
    }

    // Save pattern if successful with browser steps
    let patternSaved = false;
    if (success && steps && steps.length > 0) {
      patternStore.savePattern(completed);
      patternSaved = true;
    }

    // Calculate duration
    const startTime = new Date(completed.startedAt).getTime();
    const endTime = new Date(completed.completedAt!).getTime();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          session_id: completed.id,
          domain: completed.domain,
          outcome: completed.outcome,
          duration_seconds: durationSeconds,
          steps_count: (steps?.length || 0) + completed.toolSteps.length,
          pattern_saved: patternSaved,
          message: patternSaved
            ? `Login pattern saved for ${completed.domain}`
            : success
              ? "Login successful (no browser steps provided to save pattern)"
              : `Login failed: ${error || "unknown error"}`,
        }, null, 2),
      }],
    };
  },
};

/**
 * Get Login Pattern Tool
 */
export const getLoginPatternTool = {
  name: "get_login_pattern",
  description: `Get the stored login pattern for a domain. Call this before starting a login to see what steps worked before.`,
  inputSchema: z.object({
    domain: z.string().describe("The domain to get the pattern for"),
  }),
  handler: async ({ domain }: { domain: string }) => {
    const patternInfo = patternStore.getPatternInfo(domain);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(patternInfo, null, 2),
      }],
    };
  },
};

/**
 * Get Login Stats Tool
 */
export const getLoginStatsTool = {
  name: "get_login_stats",
  description: `View login statistics and recent history. Optionally filter by domain.`,
  inputSchema: z.object({
    domain: z.string().optional().describe("Optional: filter by domain"),
    limit: z.number().optional().default(10).describe("Number of recent attempts to return"),
  }),
  handler: async ({
    domain,
    limit = 10,
  }: {
    domain?: string;
    limit?: number;
  }) => {
    const stats = loginHistory.getStats(domain);
    const recent = loginHistory.getRecent(limit, domain);

    // Format recent attempts for display
    const recentFormatted = recent.map((a) => ({
      id: a.id,
      domain: a.domain,
      outcome: a.outcome,
      account: a.accountUsed,
      two_factor: a.twoFactorType,
      data_quality: a.dataQuality || "bronze",
      duration: a.completedAt
        ? `${Math.round((new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 1000)}s`
        : "in progress",
      time: a.startedAt,
      browser_steps: a.browserSteps?.length || 0,
      error: a.error,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          stats: {
            total_attempts: stats.totalAttempts,
            success_count: stats.successCount,
            failed_count: stats.failedCount,
            abandoned_count: stats.abandonedCount,
            success_rate: `${Math.round(stats.successRate * 100)}%`,
            by_domain: stats.byDomain,
            two_factor_breakdown: stats.twoFactorBreakdown,
            data_quality_breakdown: stats.dataQualityBreakdown,
          },
          recent: recentFormatted,
        }, null, 2),
      }],
    };
  },
};

/**
 * Report Login Outcome Tool
 *
 * This is the PRIMARY tool Claude should use after completing a login.
 * Sessions auto-start when get_credentials() is called.
 * This tool ends the session and records the outcome.
 */
export const reportLoginOutcomeTool = {
  name: "report_login_outcome",
  description: `Report the outcome of a login attempt. Call this AFTER completing (or failing) a login.

IMPORTANT: Always call this after a login attempt to record the outcome.

Including steps is optional but recommended - it enables pattern learning for faster future logins.

Example with steps (recommended):
{
  "success": true,
  "steps": [
    { "action": "fill_field", "field": "username" },
    { "action": "click_button", "text": "Next" },
    { "action": "fill_field", "field": "password" },
    { "action": "click_button", "text": "Sign in" }
  ]
}

Example without steps (minimum):
{ "success": true }`,
  inputSchema: z.object({
    success: z.boolean().describe("Whether the login succeeded"),
    steps: z.array(browserStepSchema).optional().describe("Browser steps taken (recommended for pattern learning)"),
    error: z.string().optional().describe("Error message if login failed"),
  }),
  handler: async ({
    success,
    steps,
    error,
  }: {
    success: boolean;
    steps?: BrowserStep[];
    error?: string;
  }) => {
    const session = loginHistory.getCurrentSession();

    if (!session) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            warning: "No active login session found. The session may have timed out or already been reported.",
            tip: "Sessions are auto-started when you call get_credentials, so this warning usually means the login was already recorded.",
          }, null, 2),
        }],
      };
    }

    // End the session with the reported outcome
    const completed = loginHistory.endSession(success, steps, error);

    if (!completed) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: "Failed to record login outcome",
          }, null, 2),
        }],
      };
    }

    // Save pattern if successful with browser steps
    let patternSaved = false;
    if (success && steps && steps.length > 0) {
      patternStore.savePattern(completed);
      patternSaved = true;
    }

    // Calculate duration
    const startTime = new Date(completed.startedAt).getTime();
    const endTime = new Date(completed.completedAt!).getTime();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          recorded: {
            domain: completed.domain,
            outcome: completed.outcome,
            data_quality: completed.dataQuality,
            duration_seconds: durationSeconds,
            two_factor_type: completed.twoFactorType,
            pattern_saved: patternSaved,
          },
          message: patternSaved
            ? `✓ Login recorded - pattern saved for ${completed.domain}`
            : `✓ Login recorded for ${completed.domain}`,
        }, null, 2),
      }],
    };
  },
};
