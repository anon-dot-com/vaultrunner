#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { extensionBridge } from "./bridge/extension-bridge.js";
import { vaultStatusTool } from "./tools/vault-status.js";
import { listLoginsTool } from "./tools/list-logins.js";
import { fillCredentialsTool } from "./tools/fill-credentials.js";
import { getTotpTool } from "./tools/get-totp.js";
import { clickSubmitTool } from "./tools/click-submit.js";
import { fillTotpTool } from "./tools/fill-totp.js";

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
  fillTotpTool.name,
  fillTotpTool.description,
  fillTotpTool.inputSchema.shape,
  fillTotpTool.handler
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
