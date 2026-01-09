import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";

export const getTotpTool = {
  name: "get_totp",
  description:
    "Get the current TOTP (one-time password) code for a login item. TOTP codes expire in 30 seconds, so use immediately after retrieval.",
  inputSchema: z.object({
    item_id: z
      .string()
      .describe("The 1Password item ID (obtained from list_logins)"),
  }),
  handler: async ({ item_id }: { item_id: string }) => {
    const totp = await onePasswordCLI.getTOTP(item_id);

    if (!totp) {
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

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              totp,
              expires_in: "~30 seconds",
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
