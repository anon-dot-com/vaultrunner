import { z } from "zod";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";
import { loginHistory } from "../learning/login-history.js";

export const clickSubmitTool = {
  name: "click_submit",
  description:
    "Click the submit/login button on the current page. Use this after filling credentials to submit the login form.",
  inputSchema: z.object({
    tab_id: z
      .number()
      .optional()
      .describe("Optional browser tab ID to click submit in"),
  }),
  handler: async ({ tab_id }: { tab_id?: number }) => {
    logger.info("Clicking submit button...");

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

    logger.step("Sending click request to extension...");
    const result = await extensionBridge.clickSubmit(tab_id);

    if (result.success) {
      logger.success(`Clicked: ${result.clicked}`);
    } else {
      logger.error(`Click failed: ${result.error}`);
    }

    // Auto-log to active session if one exists
    const activeSession = loginHistory.getCurrentAttempt();
    if (activeSession) {
      loginHistory.logStep(
        "click_button", // click_submit uses the same step type
        result.success ? "success" : "failed",
        { type: "submit" },
        result.clicked || result.error
      );
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
