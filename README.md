# VaultRunner

**Secure 1Password credential autofill for Claude Code** - credentials never exposed to AI.

## The Problem

When using AI assistants with browser automation, you might want to log into websites. But sharing passwords with AI is a security risk. Even if the AI is trustworthy, credentials could end up in conversation logs or training data.

## The Solution

VaultRunner creates a secure bridge between 1Password and your browser that Claude Code can trigger, but **credentials never flow through Claude**:

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Code                          │
│  Calls MCP tools, never sees passwords                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 VaultRunner MCP Server                      │
│  Fetches credentials from 1Password CLI                     │
│  Sends directly to Chrome extension                         │
└────────┬────────────────────────────────┬───────────────────┘
         │                                │
         │ 1Password CLI                  │ WebSocket
         ▼                                ▼
┌─────────────────┐              ┌─────────────────────────────┐
│    1Password    │              │   VaultRunner Extension     │
│      Vault      │              │   Injects into DOM          │
└─────────────────┘              └─────────────────────────────┘
```

Claude only sees: `{success: true, filledFields: ["username", "password"]}`

## Prerequisites

- [1Password](https://1password.com/) account
- [1Password CLI](https://developer.1password.com/docs/cli/get-started/) (`op`) installed and configured
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) package manager
- Google Chrome

### Setting up 1Password CLI

1. Install the CLI: https://developer.1password.com/docs/cli/get-started/
2. Enable app integration: Open 1Password → Settings → Developer → "Integrate with 1Password CLI"
3. Test it works: `op vault list`

## Installation

### 1. Clone and build

```bash
git clone https://github.com/yourusername/vaultrunner.git
cd vaultrunner
pnpm install
pnpm build
```

### 2. Install the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `packages/chrome-extension` folder

### 3. Configure Claude Code

Add VaultRunner to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "vaultrunner": {
      "command": "node",
      "args": ["/path/to/vaultrunner/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Usage

Once configured, you can ask Claude Code to fill credentials:

```
User: "Log me into gusto.com"

Claude: Let me check for saved credentials.
        [Calls list_logins("gusto.com")]

        I found your account daniel@example.com. Should I fill the credentials?

User: "Yes"

Claude: [Calls fill_credentials with item ID]
        Done! I've filled in your credentials. The login form should now have your email and password.
```

## MCP Tools

### `get_vault_status`

Check if 1Password is unlocked and the extension is connected.

### `list_logins`

List saved logins for a domain. Returns usernames and titles (no passwords).

```
Input: { domain: "github.com" }
Output: {
  logins: [
    { id: "abc123", title: "GitHub - Personal", username: "me@example.com", vault: "Personal" }
  ]
}
```

### `fill_credentials`

Fill credentials into the current browser page. Credentials go directly to the extension - Claude never sees them.

```
Input: { item_id: "abc123" }
Output: { success: true, filledFields: ["username", "password"] }
```

## Security Model

1. **Credentials never flow through Claude** - The MCP server fetches credentials and sends them directly to the Chrome extension via WebSocket
2. **Local only** - Everything runs on your machine, no cloud services
3. **1Password security** - Leverages 1Password's encryption and biometric auth
4. **Minimal permissions** - The extension only needs `activeTab` and `scripting`

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode for MCP server
cd packages/mcp-server && pnpm dev

# Watch mode for extension
cd packages/chrome-extension && pnpm dev
```

## Future Enhancements

- [ ] Bitwarden support
- [ ] Firefox extension
- [ ] Native messaging (more secure than WebSocket)
- [ ] Optional user confirmation before fill

## License

MIT
