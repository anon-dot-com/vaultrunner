#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { vaultStatusTool } from "./tools/vault-status.js";
import { listLoginsTool } from "./tools/list-logins.js";
import { getCredentialsTool } from "./tools/get-credentials.js";
import { getTotpTool } from "./tools/get-totp.js";
import { get2faCodeTool } from "./tools/get-2fa-code.js";
import {
  setAccountPreferenceTool,
  getAccountPreferenceTool,
  clearAccountPreferenceTool,
} from "./tools/set-account-preference.js";
import {
  startLoginSessionTool,
  endLoginSessionTool,
  getLoginPatternTool,
  getLoginStatsTool,
  reportLoginOutcomeTool,
} from "./tools/login-session.js";

const server = new McpServer({
  name: "vaultrunner",
  version: "0.3.0",
});

// Register login guide prompt
server.registerPrompt("vaultrunner_guide", {
  title: "VaultRunner Login Guide",
  description: "Complete login flow instructions for using VaultRunner tools",
}, () => ({
  messages: [{
    role: "assistant" as const,
    content: {
      type: "text" as const,
      text: `# VaultRunner Login Flow

## Standard Flow
1. list_logins(domain) - Get available accounts
2. get_credentials(item_id) - Get username/password [SESSION AUTO-STARTS]
3. Fill username via browser automation, click Next/Submit
4. Fill password, click Sign in
5. If 2FA prompt appears:
   - Try get_2fa_code() first (SMS/email)
   - Fall back to get_totp(item_id) for authenticator apps
6. report_login_outcome(success) - ALWAYS call this to end session

## 2FA Tips by Site
| Site | Method | Hint |
|------|--------|------|
| X.com | SMS | get_2fa_code(sender: "40404") |
| npm | Email | get_2fa_code(source: "gmail", sender: "npm") |
| GitHub | TOTP | get_totp(item_id) |
| Google | Varies | Try get_2fa_code() first, then TOTP |

## Multiple Accounts
When list_logins returns multiple accounts:
1. Check for isDefault: true
2. If none, ask the user which to use
3. After successful login, offer to save preference with set_account_preference()`
    }
  }]
}));

// Register tools
server.tool(
  vaultStatusTool.name,
  vaultStatusTool.description,
  vaultStatusTool.inputSchema.shape,
  vaultStatusTool.handler
);

server.tool(
  listLoginsTool.name,
  listLoginsTool.description,
  listLoginsTool.inputSchema.shape,
  listLoginsTool.handler
);

server.tool(
  getCredentialsTool.name,
  getCredentialsTool.description,
  getCredentialsTool.inputSchema.shape,
  getCredentialsTool.handler
);

server.tool(
  getTotpTool.name,
  getTotpTool.description,
  getTotpTool.inputSchema.shape,
  getTotpTool.handler
);

server.tool(
  get2faCodeTool.name,
  get2faCodeTool.description,
  get2faCodeTool.inputSchema.shape,
  get2faCodeTool.handler
);

server.tool(
  setAccountPreferenceTool.name,
  setAccountPreferenceTool.description,
  setAccountPreferenceTool.inputSchema.shape,
  setAccountPreferenceTool.handler
);

server.tool(
  getAccountPreferenceTool.name,
  getAccountPreferenceTool.description,
  getAccountPreferenceTool.inputSchema.shape,
  getAccountPreferenceTool.handler
);

server.tool(
  clearAccountPreferenceTool.name,
  clearAccountPreferenceTool.description,
  clearAccountPreferenceTool.inputSchema.shape,
  clearAccountPreferenceTool.handler
);

// Session and pattern tools
server.tool(
  startLoginSessionTool.name,
  startLoginSessionTool.description,
  startLoginSessionTool.inputSchema.shape,
  startLoginSessionTool.handler
);

server.tool(
  endLoginSessionTool.name,
  endLoginSessionTool.description,
  endLoginSessionTool.inputSchema.shape,
  endLoginSessionTool.handler
);

server.tool(
  getLoginPatternTool.name,
  getLoginPatternTool.description,
  getLoginPatternTool.inputSchema.shape,
  getLoginPatternTool.handler
);

server.tool(
  getLoginStatsTool.name,
  getLoginStatsTool.description,
  getLoginStatsTool.inputSchema.shape,
  getLoginStatsTool.handler
);

server.tool(
  reportLoginOutcomeTool.name,
  reportLoginOutcomeTool.description,
  reportLoginOutcomeTool.inputSchema.shape,
  reportLoginOutcomeTool.handler
);

// Handle shutdown
process.on("SIGINT", () => {
  console.error("[VaultRunner] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[VaultRunner] Shutting down...");
  process.exit(0);
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[VaultRunner] MCP server started");
}

main().catch((error) => {
  console.error("[VaultRunner] Fatal error:", error);
  process.exit(1);
});
