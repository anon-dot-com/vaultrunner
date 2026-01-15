import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { logger } from "../utils/logger.js";
import { accountPreferences } from "../preferences/account-preferences.js";
import { loginHistory } from "../history/login-history.js";

export const listLoginsTool = {
  name: "list_logins",
  description:
    "STEP 1: List saved logins for a website domain. Returns account names and usernames (no passwords). Shows which account is set as default. IMPORTANT: If multiple accounts found and no default set, ask the user which account to use. After they choose, you can save their preference with set_account_preference().",
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

    // Check for default preference
    const defaultPref = accountPreferences.getDefaultForDomain(domain);

    logger.step(`Found ${logins.length} credential(s):`);
    for (const login of logins) {
      const isDefault = defaultPref?.itemId === login.id;
      logger.credential(login.title, login.username, login.vault);
      if (isDefault) {
        logger.step(`  ^ Default account`);
      }
    }
    logger.actionEnd(true, `${logins.length} login(s) available`);

    // Build response with default info
    const loginsWithDefault = logins.map((login) => ({
      id: login.id,
      title: login.title,
      username: login.username,
      vault: login.vault,
      isDefault: defaultPref?.itemId === login.id,
    }));

    // Determine if user needs to choose
    const hasDefault = loginsWithDefault.some(l => l.isDefault);
    const needsUserChoice = logins.length > 1 && !hasDefault;

    // Auto-log if session is active
    const session = loginHistory.getCurrentSession();
    if (session) {
      loginHistory.logToolStep("list_logins", { domain, count: logins.length }, "success");
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              found: true,
              domain,
              logins: loginsWithDefault,
              defaultAccount: defaultPref ? {
                itemId: defaultPref.itemId,
                username: defaultPref.username,
                title: defaultPref.title,
              } : null,
              needsUserChoice,
              message: needsUserChoice
                ? `Multiple accounts found for ${domain}. Please ask the user which account they want to use, then offer to save their choice as the default.`
                : hasDefault
                ? `Using default account: ${defaultPref!.username}`
                : undefined,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
