import { z } from "zod";
import { accountPreferences } from "../preferences/account-preferences.js";
import { onePasswordCLI } from "../onepassword/cli.js";
import { logger } from "../utils/logger.js";

export const setAccountPreferenceTool = {
  name: "set_account_preference",
  description:
    "Save a default account preference for a domain. Use this after the user selects which account they want to use for a site. This will remember their choice for future logins.",
  inputSchema: z.object({
    domain: z.string().describe("The domain to set the preference for (e.g., 'webflow.com')"),
    item_id: z.string().describe("The 1Password item ID of the account to set as default"),
  }),
  handler: async ({ domain, item_id }: { domain: string; item_id: string }) => {
    logger.info(`Setting default account for ${domain}...`);

    // Get item info to store username and title
    const itemInfo = await onePasswordCLI.getItemInfo(item_id);
    if (!itemInfo) {
      logger.error("Could not retrieve item info");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `Could not retrieve item info for "${item_id}". The vault may be locked.`,
            }, null, 2),
          },
        ],
      };
    }

    // Save the preference
    accountPreferences.setDefaultForDomain(
      domain,
      item_id,
      itemInfo.username,
      itemInfo.title
    );

    logger.success(`Default account set: ${itemInfo.username}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            domain,
            defaultAccount: {
              itemId: item_id,
              username: itemInfo.username,
              title: itemInfo.title,
            },
            message: `Default account for ${domain} set to ${itemInfo.username}. This will be used automatically for future logins.`,
          }, null, 2),
        },
      ],
    };
  },
};

export const getAccountPreferenceTool = {
  name: "get_account_preference",
  description: "Get the saved default account preference for a domain.",
  inputSchema: z.object({
    domain: z.string().describe("The domain to get the preference for"),
  }),
  handler: async ({ domain }: { domain: string }) => {
    const pref = accountPreferences.getDefaultForDomain(domain);

    if (!pref) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              hasDefault: false,
              domain,
              message: `No default account set for ${domain}`,
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            hasDefault: true,
            domain,
            defaultAccount: {
              itemId: pref.itemId,
              username: pref.username,
              title: pref.title,
              savedAt: pref.savedAt,
            },
          }, null, 2),
        },
      ],
    };
  },
};

export const clearAccountPreferenceTool = {
  name: "clear_account_preference",
  description: "Remove the saved default account preference for a domain.",
  inputSchema: z.object({
    domain: z.string().describe("The domain to clear the preference for"),
  }),
  handler: async ({ domain }: { domain: string }) => {
    const removed = accountPreferences.removeDefaultForDomain(domain);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: removed,
            domain,
            message: removed
              ? `Default account preference for ${domain} has been removed.`
              : `No default account was set for ${domain}.`,
          }, null, 2),
        },
      ],
    };
  },
};
