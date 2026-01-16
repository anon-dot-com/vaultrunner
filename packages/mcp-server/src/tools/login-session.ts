/**
 * Login Session Tools
 * Tools for tracking login sessions and learning patterns
 */

import { z } from "zod";
import { loginHistory, type BrowserStep } from "../history/login-history.js";
import { patternStore } from "../history/pattern-store.js";
import { rulesStore } from "../rules/rules-store.js";

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

    // Get applicable rules
    const rules = rulesStore.getRulesForDomain(domain);
    const domainInsights = rulesStore.getDomainInsights(domain);

    // Build hints from rules
    const ruleHints = rules.map(r => `• ${r.trigger}: ${r.action} - ${r.reason}`);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          session_id: sessionId,
          domain,
          login_url: domainInsights?.loginUrl || login_url,
          known_pattern: patternInfo.found ? patternInfo.pattern : null,
          rules: rules.map(r => ({
            trigger: r.trigger,
            action: r.action,
            actionParams: r.actionParams,
            reason: r.reason,
          })),
          insights: domainInsights ? {
            loginUrl: domainInsights.loginUrl,
            notes: domainInsights.notes,
            quirks: domainInsights.quirks,
          } : null,
          hints: [
            ...(patternInfo.hint ? [patternInfo.hint] : []),
            ...ruleHints,
          ],
          reminder: "When done, call report_login_outcome with success status, browser steps, and any learnings.",
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
 *
 * NEW: Now supports retroactive session creation and capturing learnings.
 */
export const reportLoginOutcomeTool = {
  name: "report_login_outcome",
  description: `FINAL STEP: Report the outcome of a login attempt. ALWAYS call this after every login attempt to end the session and record the result.

Sessions auto-start when you call get_credentials(). If no session exists (e.g., it timed out), this tool will create a retroactive record.

**Include learnings** to help improve future logins:
- What worked or didn't work
- Login URL if different from expected
- Any workarounds needed (e.g., "had to dismiss 1Password popup")

Example with steps and learnings (recommended):
{
  "success": true,
  "domain": "venture.angellist.com",
  "steps": [
    { "action": "fill_field", "field": "username" },
    { "action": "click_button", "text": "Continue" },
    { "action": "click_button", "text": "Sign in with password instead" },
    { "action": "fill_field", "field": "password" },
    { "action": "click_button", "text": "Sign in" }
  ],
  "learnings": "Login URL is /v/login not /login. Site offers magic link by default, need to click 'Sign in with password instead'.",
  "login_url": "https://venture.angellist.com/v/login"
}

Example without steps (minimum):
{ "success": true, "domain": "github.com" }`,
  inputSchema: z.object({
    success: z.boolean().describe("Whether the login succeeded"),
    domain: z.string().optional().describe("Domain that was logged into (required if no active session)"),
    steps: z.array(browserStepSchema).optional().describe("Browser steps taken (recommended for pattern learning)"),
    error: z.string().optional().describe("Error message if login failed"),
    learnings: z.string().optional().describe("What you learned during this login that could help future attempts"),
    login_url: z.string().optional().describe("The actual login URL used (if different from expected)"),
    two_factor_type: z.enum(["totp", "sms", "email", "none"]).optional().describe("Type of 2FA used"),
    account_used: z.string().optional().describe("Email/username used (for retroactive logging)"),
  }),
  handler: async ({
    success,
    domain,
    steps,
    error,
    learnings,
    login_url,
    two_factor_type,
    account_used,
  }: {
    success: boolean;
    domain?: string;
    steps?: BrowserStep[];
    error?: string;
    learnings?: string;
    login_url?: string;
    two_factor_type?: "totp" | "sms" | "email" | "none";
    account_used?: string;
  }) => {
    let session = loginHistory.getCurrentSession();
    let completed;
    let wasRetroactive = false;

    if (!session) {
      // No active session - create a retroactive record if domain is provided
      if (!domain) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              warning: "No active login session found and no domain provided.",
              tip: "Provide the 'domain' parameter to create a retroactive login record.",
            }, null, 2),
          }],
        };
      }

      // Create retroactive session
      completed = loginHistory.createRetroactiveSession(domain, success, steps, {
        accountUsed: account_used,
        twoFactorType: two_factor_type,
        loginUrl: login_url,
        error,
      });
      wasRetroactive = true;
    } else {
      // End the active session with the reported outcome
      completed = loginHistory.endSession(success, steps, error);
    }

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

    const domainUsed = completed.domain;

    // Save pattern if successful with browser steps
    let patternSaved = false;
    if (success && steps && steps.length > 0) {
      patternStore.savePattern(completed);
      patternSaved = true;
    }

    // Save learnings as domain insights
    let insightsSaved = false;
    if (learnings) {
      rulesStore.addDomainInsight(domainUsed, learnings, false);
      insightsSaved = true;
    }

    // Save login URL if provided
    if (login_url) {
      rulesStore.setDomainLoginUrl(domainUsed, login_url);
    }

    // Calculate duration (or 0 for retroactive)
    const startTime = new Date(completed.startedAt).getTime();
    const endTime = new Date(completed.completedAt!).getTime();
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    // Get current rules for this domain (to show what was applied)
    const applicableRules = rulesStore.getRulesForDomain(domainUsed);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          recorded: {
            domain: domainUsed,
            outcome: completed.outcome,
            data_quality: completed.dataQuality,
            duration_seconds: durationSeconds,
            two_factor_type: completed.twoFactorType,
            pattern_saved: patternSaved,
            insights_saved: insightsSaved,
            retroactive: wasRetroactive,
          },
          learnings_recorded: learnings || null,
          applicable_rules_count: applicableRules.length,
          message: patternSaved
            ? `✓ Login recorded - pattern saved for ${domainUsed}`
            : insightsSaved
              ? `✓ Login recorded with insights for ${domainUsed}`
              : `✓ Login recorded for ${domainUsed}`,
          tip: !patternSaved && success
            ? "Include 'steps' next time to save the login pattern for faster future logins"
            : null,
        }, null, 2),
      }],
    };
  },
};
