import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";

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
