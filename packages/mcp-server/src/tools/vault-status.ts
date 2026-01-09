import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { logger } from "../utils/logger.js";

export const vaultStatusTool = {
  name: "get_vault_status",
  description:
    "Check if 1Password vault is unlocked and VaultRunner extension is connected",
  inputSchema: z.object({}),
  handler: async () => {
    logger.info("Checking vault status...");

    const status = await onePasswordCLI.getStatus();
    const extensionConnected = extensionBridge.isConnected();

    if (status.unlocked) {
      logger.success(`Vault unlocked (${status.accounts.length} account(s))`);
    } else {
      logger.error("Vault is locked or 1Password CLI not available");
    }

    if (extensionConnected) {
      logger.success("Chrome extension connected");
    } else {
      logger.warn("Chrome extension not connected");
    }

    const ready = status.unlocked && extensionConnected;
    if (ready) {
      logger.success("VaultRunner ready");
    } else {
      logger.warn("VaultRunner not ready");
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              vault: {
                unlocked: status.unlocked,
                accounts: status.accounts,
              },
              extension: {
                connected: extensionConnected,
              },
              ready,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
