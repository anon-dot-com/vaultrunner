import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";
import { checkAccess, type AccessCheckResult } from "../access/access-control.js";
import { loginHistory } from "../learning/login-history.js";

export const fillCredentialsTool = {
  name: "fill_credentials",
  description:
    "Fill login credentials into the current browser page. Credentials are sent directly to the browser extension and are NEVER returned to this tool's output.",
  inputSchema: z.object({
    item_id: z
      .string()
      .describe("The 1Password item ID (obtained from list_logins)"),
    tab_id: z
      .number()
      .optional()
      .describe("Optional browser tab ID to fill credentials in"),
  }),
  handler: async ({ item_id, tab_id }: { item_id: string; tab_id?: number }) => {
    logger.banner();
    logger.action("Fill Credentials", `Item: ${item_id.slice(0, 8)}...`);

    // Check if extension is connected
    logger.step("Checking extension connection...");
    if (!extensionBridge.isConnected()) {
      logger.actionEnd(false, "Chrome extension not connected");
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
    logger.step("Extension connected ✓");

    // Get item metadata for access control (username, title, vault)
    logger.step("Fetching item metadata from 1Password...");
    const itemInfo = await onePasswordCLI.getItemInfo(item_id);

    if (!itemInfo) {
      logger.actionEnd(false, "Could not retrieve item info");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Could not retrieve item info for "${item_id}". The vault may be locked or the item may not exist.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
    logger.step(`Found: ${itemInfo.title} (${itemInfo.username})`);

    // Check access control
    logger.step("Checking access permissions...");
    const accessResult: AccessCheckResult = await checkAccess({
      itemId: item_id,
      title: itemInfo.title,
      username: itemInfo.username,
      vault: itemInfo.vault,
    });

    if (accessResult.decision === "denied") {
      logger.actionEnd(false, "Access denied for this credential");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Access denied for this credential. ${accessResult.reason}`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (accessResult.decision === "unknown") {
      logger.actionEnd(false, "Credential requires explicit approval");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `This credential requires explicit approval. See console for instructions.`,
                requiresApproval: true,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Fetch credentials from 1Password
    // NOTE: These credentials are handled securely and sent directly to the extension
    // They are NOT included in the response to Claude
    logger.step("Fetching credentials from 1Password...");
    const credentials = await onePasswordCLI.getCredentials(item_id);

    if (!credentials) {
      logger.actionEnd(false, "Could not retrieve credentials");
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
    logger.step("Credentials retrieved (never exposed to AI)");

    // Send credentials to the extension for filling
    // The credentials go directly to the extension and are NEVER returned to Claude
    logger.step("Injecting into browser via extension...");
    const result = await extensionBridge.fillCredentials(credentials, tab_id);

    if (result.success) {
      logger.actionEnd(true, `Filled: ${result.filledFields?.join(", ") || "fields"}`);
    } else {
      logger.actionEnd(false, result.error || "Fill failed");
    }

    // Auto-start a session if one doesn't exist, then log
    let activeSession = loginHistory.getCurrentAttempt();

    // If there's an existing session for a DIFFERENT domain, complete it first
    if (activeSession && itemInfo.domain && activeSession.domain !== itemInfo.domain) {
      const hasSteps = (activeSession.steps?.length || 0) > 0;
      if (hasSteps) {
        // Had some activity, mark as success (likely completed but wasn't detected)
        loginHistory.completeAttempt("success", "Auto-completed when new login started");
        logger.step(`Auto-completed previous session for ${activeSession.domain}`);
      } else {
        // No steps, was abandoned
        loginHistory.completeAttempt("abandoned", "Abandoned when new login started");
        logger.step(`Abandoned previous session for ${activeSession.domain}`);
      }
      activeSession = null; // Reset so we create a new one
    }

    if (!activeSession && itemInfo.domain) {
      // Auto-start a session for this login
      const loginUrl = itemInfo.url || `https://${itemInfo.domain}`;
      loginHistory.startAttempt(itemInfo.domain, loginUrl, {
        username: itemInfo.username,
        itemTitle: itemInfo.title,
      });
      activeSession = loginHistory.getCurrentAttempt();
      logger.step(`Started tracking login session for ${itemInfo.domain}`);
    }

    if (activeSession) {
      // Always record the username/title for this login attempt
      loginHistory.setUserInfo(itemInfo.username, itemInfo.title);

      const filledFields = result.filledFields || [];
      loginHistory.logStep(
        "fill_credentials",
        result.success ? (filledFields.length > 1 ? "success" : "partial") : "failed",
        { item_id, username: itemInfo.username },
        `Filled: ${filledFields.join(", ") || "none"}`
      );
    }

    // Return only success/failure - NO credentials
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: result.success,
              filledFields: result.filledFields,
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
