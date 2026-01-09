# VaultRunner

**Secure 1Password credential autofill for Claude Code** - credentials never exposed to AI.

## The Problem

When using AI assistants with browser automation, you might want to log into websites. But sharing passwords with AI is a security risk. Even if the AI is trustworthy, credentials could end up in conversation logs or training data.

## The Solution

VaultRunner creates a secure bridge between 1Password and your browser. Claude Code can trigger credential fills, but **passwords never flow through Claude**:

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
└────────┬────────────────────────────────────────────────────┘
         │
         │ Credentials flow directly to extension
         ▼
┌─────────────────────────────────────────────────────────────┐
│                 VaultRunner Chrome Extension                │
│  Receives credentials, fills into DOM                       │
│  Claude only sees: {success: true}                          │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install the Chrome Extension

**From Chrome Web Store (recommended):**
- Install [VaultRunner](https://chromewebstore.google.com/detail/vaultrunner/EXTENSION_ID) from the Chrome Web Store

**Or manually (for development):**
1. Clone this repo and run `pnpm install && pnpm build`
2. Open `chrome://extensions/`, enable Developer mode
3. Click "Load unpacked" and select `packages/chrome-extension`

### 2. Run the Setup

```bash
npx vaultrunner setup
```

This will:
- Check/install 1Password CLI
- Verify your 1Password is configured
- Guide you through any remaining setup

### 3. Add to Claude Code

Add VaultRunner to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "vaultrunner": {
      "command": "npx",
      "args": ["vaultrunner-mcp"]
    }
  }
}
```

### 4. Install Claude Chrome Extension

You'll also need the [Claude Chrome extension](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) for browser automation.

## Requirements

- **1Password account** with CLI access
- **1Password CLI** (auto-installed on macOS via setup)
- **Google Chrome** with VaultRunner and Claude extensions
- **Node.js 18+**

### 1Password CLI Setup

The 1Password CLI (`op`) needs to be connected to your account:

1. Install: `brew install --cask 1password-cli` (or run `npx vaultrunner setup`)
2. If you have 1Password desktop app: Settings → Developer → Enable "Integrate with 1Password CLI"
3. If CLI-only: Run `op account add` and follow prompts
4. Test: `op vault list` should show your vaults

## Usage

Once configured, ask Claude to log into websites:

```
User: "Log me into GitHub"

Claude: Let me check for saved credentials.
        [Calls list_logins("github.com")]

        I found 2 accounts:
        1. work@company.com (Work vault)
        2. personal@gmail.com (Personal vault)

        Which one should I use?

User: "Use my personal account"

Claude: [Calls fill_credentials with item ID]
        Done! I've filled your credentials into the login form.
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password is unlocked and extension connected |
| `list_logins` | List saved logins for a domain (usernames only, no passwords) |
| `fill_credentials` | Fill credentials into the current page |
| `get_totp` | Get current TOTP code for 2FA |
| `fill_totp` | Fill TOTP code into verification field |
| `click_submit` | Click the submit/login button |

## Security Model

1. **Credentials never flow through Claude** - The MCP server sends credentials directly to the Chrome extension
2. **Local only** - Everything runs on your machine, no external servers
3. **1Password security** - Leverages 1Password's encryption and biometric auth
4. **Minimal permissions** - Extension only needs `activeTab` and `scripting`
5. **Open source** - Full code transparency, audit it yourself

## CLI Commands

```bash
# Check requirements and setup
npx vaultrunner setup

# Check current status
npx vaultrunner status

# Show MCP configuration
npx vaultrunner config
```

## Development

```bash
# Clone and install
git clone https://github.com/anthropics/vaultrunner.git
cd vaultrunner
pnpm install

# Build all packages
pnpm build

# Watch mode
pnpm dev
```

## Privacy

VaultRunner collects no data. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT
