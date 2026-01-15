import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { loginHistory } from "../history/login-history.js";

export const getCredentialsTool = {
  name: "get_credentials",
  description:
    "Get username and password for a 1Password login item. Returns credentials for you to fill via browser automation (e.g., Claude for Chrome).",
  inputSchema: z.object({
    item_id: z
      .string()
      .describe("The 1Password item ID (obtained from list_logins)"),
  }),
  handler: async ({ item_id }: { item_id: string }) => {
    const credentials = await onePasswordCLI.getCredentials(item_id);

    if (!credentials) {
      // Auto-log failure if session is active
      const session = loginHistory.getCurrentSession();
      if (session) {
        loginHistory.logToolStep("get_credentials", { item_id }, "failed");
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Could not retrieve credentials for item "${item_id}". The vault may be locked or the item may not exist.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get item info to extract domain for auto-session
    const itemInfo = await onePasswordCLI.getItemInfo(item_id);
    const domain = itemInfo?.domain || "unknown";

    // AUTO-START SESSION if none exists
    // This enables tracking even when Claude forgets to call start_login_session
    if (!loginHistory.hasActiveSession()) {
      loginHistory.autoStartSession(domain, credentials.username, itemInfo?.url);
    }

    // Log the tool step
    loginHistory.logToolStep(
      "get_credentials",
      { item_id, username: credentials.username, domain },
      "success"
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              username: credentials.username,
              password: credentials.password,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
