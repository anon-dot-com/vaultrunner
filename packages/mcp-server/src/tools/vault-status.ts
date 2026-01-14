import { z } from "zod";
import { onePasswordCLI } from "../onepassword/cli.js";

export const vaultStatusTool = {
  name: "get_vault_status",
  description:
    "Check if 1Password CLI is authenticated and vault is unlocked",
  inputSchema: z.object({}),
  handler: async () => {
    const status = await onePasswordCLI.getStatus();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              authenticated: status.unlocked,
              accounts: status.accounts,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
