import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";

export const fillTotpTool = {
  name: "fill_totp",
  description:
    "Get the TOTP code from 1Password and fill it into the current page's verification code field. Use this for two-factor authentication.",
  inputSchema: z.object({
    item_id: z
      .string()
      .describe("The 1Password item ID (obtained from list_logins)"),
    tab_id: z
      .number()
      .optional()
      .describe("Optional browser tab ID to fill TOTP in"),
  }),
  handler: async ({ item_id, tab_id }: { item_id: string; tab_id?: number }) => {
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

    // Get TOTP from 1Password
    logger.step("Fetching TOTP from 1Password...");
    const totp = await onePasswordCLI.getTOTP(item_id);

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

    // Fill TOTP into the page (TOTP goes through extension, not returned to Claude)
    logger.step("Sending to browser extension...");
    const result = await extensionBridge.fillTotp(totp, tab_id);

    if (result.success) {
      logger.success("TOTP code filled");
    } else {
      logger.error(`Fill failed: ${result.error}`);
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
