import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { loginHistory } from "../history/login-history.js";

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
      // Auto-log failure if session is active
      const session = loginHistory.getCurrentSession();
      if (session) {
        loginHistory.logToolStep("get_totp", { item_id }, "failed");
      }

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

    // Auto-log success if session is active
    const session = loginHistory.getCurrentSession();
    if (session) {
      loginHistory.logToolStep("get_totp", { item_id }, "success");
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
