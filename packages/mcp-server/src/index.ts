#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { extensionBridge } from "./bridge/extension-bridge.js";
import { vaultStatusTool } from "./tools/vault-status.js";
import { listLoginsTool } from "./tools/list-logins.js";
import { fillCredentialsTool } from "./tools/fill-credentials.js";
import { getTotpTool } from "./tools/get-totp.js";
import { clickSubmitTool } from "./tools/click-submit.js";
import { clickButtonTool } from "./tools/click-button.js";
import { fillTotpTool } from "./tools/fill-totp.js";
import { get2faCodeTool } from "./tools/get-2fa-code.js";
import { smartLoginTool } from "./tools/smart-login.js";
import { loginStatsTool } from "./tools/login-stats.js";
import {
  startLoginSessionTool,
  endLoginSessionTool,
  logLoginStepTool,
  getLoginSessionTool,
} from "./tools/login-session.js";
import {
  setAccountPreferenceTool,
  getAccountPreferenceTool,
  clearAccountPreferenceTool,
} from "./tools/set-account-preference.js";

const server = new McpServer({
  name: "vaultrunner",
  version: "0.1.0",
});

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
  fillCredentialsTool.name,
  fillCredentialsTool.description,
  fillCredentialsTool.inputSchema.shape,
  fillCredentialsTool.handler
);

server.tool(
  getTotpTool.name,
  getTotpTool.description,
  getTotpTool.inputSchema.shape,
  getTotpTool.handler
);

server.tool(
  clickSubmitTool.name,
  clickSubmitTool.description,
  clickSubmitTool.inputSchema.shape,
  clickSubmitTool.handler
);

server.tool(
  clickButtonTool.name,
  clickButtonTool.description,
  clickButtonTool.inputSchema.shape,
  clickButtonTool.handler
);

server.tool(
  fillTotpTool.name,
  fillTotpTool.description,
  fillTotpTool.inputSchema.shape,
  fillTotpTool.handler
);

server.tool(
  get2faCodeTool.name,
  get2faCodeTool.description,
  get2faCodeTool.inputSchema.shape,
  get2faCodeTool.handler
);

server.tool(
  smartLoginTool.name,
  smartLoginTool.description,
  smartLoginTool.inputSchema.shape,
  smartLoginTool.handler
);

server.tool(
  loginStatsTool.name,
  loginStatsTool.description,
  loginStatsTool.inputSchema.shape,
  loginStatsTool.handler
);

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
  logLoginStepTool.name,
  logLoginStepTool.description,
  logLoginStepTool.inputSchema.shape,
  logLoginStepTool.handler
);

server.tool(
  getLoginSessionTool.name,
  getLoginSessionTool.description,
  getLoginSessionTool.inputSchema.shape,
  getLoginSessionTool.handler
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

// Start the extension bridge (WebSocket server)
extensionBridge.start();

// Handle shutdown
process.on("SIGINT", () => {
  console.error("[VaultRunner] Shutting down...");
  extensionBridge.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[VaultRunner] Shutting down...");
  extensionBridge.stop();
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
