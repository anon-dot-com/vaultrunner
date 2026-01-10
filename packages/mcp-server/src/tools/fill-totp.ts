import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";
import { loginHistory } from "../learning/login-history.js";

export const fillTotpTool = {
  name: "fill_totp",
  description:
    "Fill a TOTP/verification code into the current page. Either provide an item_id to fetch from 1Password, or provide a code directly (e.g., from get_2fa_code).",
  inputSchema: z.object({
    item_id: z
      .string()
      .optional()
      .describe("The 1Password item ID (obtained from list_logins). Required if code is not provided."),
    code: z
      .string()
      .optional()
      .describe("The verification code to fill directly (e.g., from get_2fa_code). If provided, item_id is not needed."),
    tab_id: z
      .number()
      .optional()
      .describe("Optional browser tab ID to fill TOTP in"),
  }),
  handler: async ({ item_id, code, tab_id }: { item_id?: string; code?: string; tab_id?: number }) => {
    logger.info("Filling TOTP code...");

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

    let totp: string | null = null;

    // If code is provided directly, use it
    if (code) {
      logger.step("Using provided verification code");
      totp = code;
    } else if (item_id) {
      // Get TOTP from 1Password
      logger.step("Fetching TOTP from 1Password...");
      totp = await onePasswordCLI.getTOTP(item_id);

      if (!totp) {
        logger.error("Could not retrieve TOTP");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: `Could not retrieve TOTP for item "${item_id}". The item may not have TOTP configured, or the vault may be locked.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      logger.step("TOTP retrieved (not shown)");
    } else {
      logger.error("No code or item_id provided");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: "Either 'code' or 'item_id' must be provided.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Fill TOTP into the page (TOTP goes through extension, not returned to Claude)
    logger.step("Sending to browser extension...");
    const result = await extensionBridge.fillTotp(totp, tab_id);

    if (result.success) {
      logger.success("TOTP code filled");
    } else {
      logger.error(`Fill failed: ${result.error}`);
    }

    // Auto-log to active session if one exists
    const activeSession = loginHistory.getCurrentAttempt();
    if (activeSession) {
      loginHistory.logStep(
        "fill_totp",
        result.success ? "success" : "failed",
        { source: code ? "direct" : "1password" },
        result.error
      );
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: result.success,
              filled: result.success,
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
