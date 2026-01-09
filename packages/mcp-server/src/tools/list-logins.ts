import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { logger } from "../utils/logger.js";

export const listLoginsTool = {
  name: "list_logins",
  description:
    "List saved logins for a website domain. Returns account names and usernames (no passwords).",
  inputSchema: z.object({
    domain: z
      .string()
      .describe('Website domain to search for (e.g., "gusto.com", "github.com")'),
  }),
  handler: async ({ domain }: { domain: string }) => {
    logger.banner();
    logger.action("Search", domain);
    logger.step("Querying 1Password vault...");

    const logins = await onePasswordCLI.listLoginsForDomain(domain);

    if (logins.length === 0) {
      logger.actionEnd(false, `No logins found for ${domain}`);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                found: false,
                message: `No saved logins found for domain "${domain}"`,
                logins: [],
              },
              null,
              2
            ),
          },
        ],
      };
    }

    logger.step(`Found ${logins.length} credential(s):`);
    for (const login of logins) {
      logger.credential(login.title, login.username, login.vault);
    }
    logger.actionEnd(true, `${logins.length} login(s) available`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              found: true,
              domain,
              logins: logins.map((login) => ({
                id: login.id,
                title: login.title,
                username: login.username,
                vault: login.vault,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
