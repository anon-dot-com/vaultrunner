import { z } from "zod";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";
import { loginHistory } from "../learning/login-history.js";

export const clickButtonTool = {
  name: "click_button",
  description:
    "Click a specific button on the page by its text content. Use this when you need to click a specific button like 'Next', 'Continue', 'Sign In', etc. You can also specify text patterns to exclude (e.g., exclude social login buttons).",
  inputSchema: z.object({
    button_text: z
      .string()
      .describe("The text content of the button to click (e.g., 'Next', 'Continue', 'Sign In')"),
    exclude_texts: z
      .array(z.string())
      .optional()
      .describe("Optional array of text patterns to exclude (e.g., ['Google', 'Apple'] to avoid social login buttons)"),
    tab_id: z
      .number()
      .optional()
      .describe("Optional browser tab ID to click the button in"),
  }),
  handler: async ({
    button_text,
    exclude_texts,
    tab_id,
  }: {
    button_text: string;
    exclude_texts?: string[];
    tab_id?: number;
  }) => {
    logger.info(`Clicking button with text "${button_text}"...`);

    if (!extensionBridge.isConnected()) {
      logger.error("Chrome extension not connected");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error:
                  "VaultRunner Chrome extension is not connected. Please ensure the extension is installed and running.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    logger.step(`Sending click request for button "${button_text}"...`);
    const result = await extensionBridge.clickButton(button_text, exclude_texts, tab_id);

    if (result.success) {
      logger.success(`Clicked: ${result.clicked}`);
    } else {
      logger.error(`Click failed: ${result.error}`);
    }

    // Auto-log to active session if one exists
    const activeSession = loginHistory.getCurrentAttempt();
    if (activeSession) {
      loginHistory.logStep(
        "click_button",
        result.success ? "success" : "failed",
        { buttonText: button_text, excludeTexts: exclude_texts },
        result.clicked || result.error
      );

      // Check if this click should complete the session
      // Only complete after 2FA verification to avoid premature completion
      // (2FA might appear after "Log in" button click)
      if (result.success) {
        const steps = activeSession.steps || [];
        const has2FAStep = steps.some(
          (s) => s.action === "fill_totp" || s.action === "get_2fa_code"
        );

        if (has2FAStep) {
          // 2FA was done, this click (likely "Next" or "Verify") completes the login
          loginHistory.completeAttempt("success", "Completed after 2FA verification");
          logger.step("Login session completed (success after 2FA)");
        }
        // For non-2FA logins, the session stays in_progress and will be:
        // 1. Completed when a new login starts for a different domain
        // 2. Or manually ended via end_login_session tool
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: result.success,
              clicked: result.clicked,
              error: result.error,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
