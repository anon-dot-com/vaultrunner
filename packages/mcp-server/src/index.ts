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

const server = new McpServer({
  name: "vaultrunner",
  version: "0.2.0",
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
