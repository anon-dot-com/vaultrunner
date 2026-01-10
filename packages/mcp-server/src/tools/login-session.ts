import { z } from "zod";
import { loginHistory } from "../learning/login-history.js";
import { ruleEngine } from "../learning/rule-engine.js";
import { onePasswordCLI } from "../onepassword/cli.js";
import { logger } from "../utils/logger.js";

/**
 * Tool to start tracking a login session
 * This allows learning from manual login flows (not just smart_login)
 */
export const startLoginSessionTool = {
  name: "start_login_session",
  description: `Start tracking a login session for learning purposes. Call this BEFORE attempting to log into a site.
This enables VaultRunner to learn from the login flow even when using individual tools like fill_credentials, click_button, etc.
After the login completes (success or failure), call end_login_session to save the learning.`,
  inputSchema: z.object({
    domain: z.string().describe("The domain being logged into (e.g., 'webflow.com')"),
    login_url: z.string().describe("The current login page URL"),
    item_id: z.string().optional().describe("Optional: The 1Password item ID being used"),
  }),
  handler: async ({
    domain,
    login_url,
    item_id,
  }: {
    domain: string;
    login_url: string;
    item_id?: string;
  }) => {
    // Check if there's already an active session
    const currentAttempt = loginHistory.getCurrentAttempt();
    if (currentAttempt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `A login session is already active for ${currentAttempt.domain}. Call end_login_session first.`,
              activeSession: {
                id: currentAttempt.id,
                domain: currentAttempt.domain,
                startedAt: currentAttempt.startedAt,
              },
            }, null, 2),
          },
        ],
      };
    }

    // Get username from 1Password if item_id provided
    let username: string | undefined;
    let itemTitle: string | undefined;
    if (item_id) {
      try {
        const itemInfo = await onePasswordCLI.getItemInfo(item_id);
        if (itemInfo) {
          username = itemInfo.username;
          itemTitle = itemInfo.title;
        }
      } catch {
        // Ignore - username is optional
      }
    }

    // Start the session
    const attemptId = loginHistory.startAttempt(domain, login_url, { username, itemTitle });

    logger.info(`Started login session: ${attemptId} for ${domain}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            sessionId: attemptId,
            domain,
            loginUrl: login_url,
            username,
            message: "Login session started. All fill_credentials, click_button, and other tool calls will be tracked. Call end_login_session when done.",
          }, null, 2),
        },
      ],
    };
  },
};

/**
 * Tool to log a step in the current login session
 */
export const logLoginStepTool = {
  name: "log_login_step",
  description: `Log a step in the current login session. Use this to record what happened during a manual login flow.
This is called automatically by VaultRunner tools, but you can also call it manually to log custom steps.`,
  inputSchema: z.object({
    action: z.enum(["fill_credentials", "click_button", "fill_totp", "get_2fa_code", "wait", "other"]).describe("The action that was performed"),
    result: z.enum(["success", "partial", "failed"]).describe("The result of the action"),
    details: z.string().optional().describe("Additional details about what happened"),
    params: z.record(z.unknown()).optional().describe("Parameters used for the action"),
  }),
  handler: async ({
    action,
    result,
    details,
    params,
  }: {
    action: "fill_credentials" | "click_button" | "fill_totp" | "get_2fa_code" | "wait" | "other";
    result: "success" | "partial" | "failed";
    details?: string;
    params?: Record<string, unknown>;
  }) => {
    const currentAttempt = loginHistory.getCurrentAttempt();
    if (!currentAttempt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "No active login session. Call start_login_session first.",
            }, null, 2),
          },
        ],
      };
    }

    // Map "other" to a valid action type for logging
    const logAction = action === "other" ? "wait" : action;
    loginHistory.logStep(logAction, result, params, details);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            logged: { action, result, details },
            sessionId: currentAttempt.id,
            stepCount: currentAttempt.steps.length,
          }, null, 2),
        },
      ],
    };
  },
};

/**
 * Tool to end a login session and trigger learning
 */
export const endLoginSessionTool = {
  name: "end_login_session",
  description: `End the current login session and save the learning. Call this after a login attempt completes.
The outcome determines how the system learns:
- "success": The login worked - the steps will be saved as a working pattern
- "failed": The login failed - the system will analyze what went wrong and adapt
- "pending_2fa": Login is waiting for 2FA - partial success
- "already_logged_in": User was already logged in
- "abandoned": Login was cancelled`,
  inputSchema: z.object({
    outcome: z.enum(["success", "failed", "pending_2fa", "already_logged_in", "abandoned"]).describe("The final outcome of the login attempt"),
    final_state: z.string().optional().describe("Description of the final state (e.g., 'Reached dashboard', 'Stuck on 2FA page')"),
    error_message: z.string().optional().describe("Error message if the login failed"),
  }),
  handler: async ({
    outcome,
    final_state,
    error_message,
  }: {
    outcome: "success" | "failed" | "pending_2fa" | "already_logged_in" | "abandoned";
    final_state?: string;
    error_message?: string;
  }) => {
    const currentAttempt = loginHistory.getCurrentAttempt();
    if (!currentAttempt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "No active login session to end.",
            }, null, 2),
          },
        ],
      };
    }

    // Complete the attempt
    const completedAttempt = loginHistory.completeAttempt(outcome, final_state, error_message);

    if (!completedAttempt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Failed to complete the login session.",
            }, null, 2),
          },
        ],
      };
    }

    // Learn from the attempt
    ruleEngine.learnFromAttempt(completedAttempt);

    logger.success(`Login session ${completedAttempt.id} completed: ${outcome}`);

    // Get the updated rule to show what was learned
    const updatedRule = ruleEngine.getRuleForDomain(completedAttempt.domain);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            sessionId: completedAttempt.id,
            domain: completedAttempt.domain,
            outcome,
            stepsRecorded: completedAttempt.steps.length,
            learning: {
              ruleUpdated: !!updatedRule,
              newConfidence: updatedRule?.confidence,
              adaptationsMade: updatedRule?.adaptations?.length || 0,
              learningNotes: updatedRule?.learningNotes?.slice(-3) || [],
            },
            message: outcome === "success"
              ? "Login succeeded! Pattern saved for future use."
              : outcome === "failed"
              ? "Login failed. The system has analyzed the failure and may adapt the rule."
              : `Login session ended with outcome: ${outcome}`,
          }, null, 2),
        },
      ],
    };
  },
};

/**
 * Tool to get current session status
 */
export const getLoginSessionTool = {
  name: "get_login_session",
  description: "Get the current login session status, if any.",
  inputSchema: z.object({}),
  handler: async () => {
    const currentAttempt = loginHistory.getCurrentAttempt();

    if (!currentAttempt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              active: false,
              message: "No active login session.",
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            active: true,
            session: {
              id: currentAttempt.id,
              domain: currentAttempt.domain,
              loginUrl: currentAttempt.loginUrl,
              startedAt: currentAttempt.startedAt,
              username: currentAttempt.username,
              stepsRecorded: currentAttempt.steps.length,
              steps: currentAttempt.steps.map(s => ({
                action: s.action,
                result: s.result,
                details: s.details,
              })),
            },
          }, null, 2),
        },
      ],
    };
  },
};
