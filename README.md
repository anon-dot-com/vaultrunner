<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/vaultrunner-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo/vaultrunner-logo-light.svg">
    <img alt="VaultRunner" src="assets/logo/vaultrunner-logo-dark.svg" width="280">
  </picture>
</p>

<p align="center">
  <strong>Secure 1Password autofill for AI agents</strong><br>
  Let Claude log into websites without ever seeing your passwords
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vaultrunner-mcp"><img src="https://img.shields.io/npm/v/vaultrunner-mcp?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://github.com/danielgmason/vaultrunner/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/danielgmason/vaultrunner/stargazers"><img src="https://img.shields.io/github/stars/danielgmason/vaultrunner?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#mcp-tools">MCP Tools</a> •
  <a href="#security">Security</a>
</p>

---

## The Problem

AI agents with browser automation need to log into websites. But sharing passwords with AI is risky—credentials could leak into logs, context windows, or training data.

**VaultRunner solves this.** Claude can trigger 1Password autofill, but passwords flow directly from 1Password → Browser, completely bypassing the AI.

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                         Claude Code                          │
│           "Log me into GitHub with my work account"          │
└──────────────────────────┬───────────────────────────────────┘
                           │ MCP call: fill_credentials
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   VaultRunner MCP Server                     │
│                                                              │
│  1. Fetches credentials from 1Password CLI                   │
│  2. Sends directly to Chrome extension (not Claude!)         │
└──────────────────────────┬───────────────────────────────────┘
                           │ WebSocket (localhost only)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                VaultRunner Chrome Extension                  │
│                                                              │
│  Fills credentials into the page                             │
│  Returns only: { success: true, filledFields: ["email"] }    │
└──────────────────────────────────────────────────────────────┘
```

**Claude never sees your password.** It only knows the fill succeeded.

## Features

- **Zero credential exposure** — Passwords bypass Claude entirely
- **Works with any website** — Universal form detection
- **2FA support** — TOTP from 1Password + SMS/email code reading
- **Learning system** — Improves login flows over time
- **Account preferences** — Remember default accounts per site
- **Smart login** — Automated multi-step login flows
- **Local only** — No external servers, everything on your machine

## Quick Start

### 1. Install Chrome Extension

Install [VaultRunner](https://chromewebstore.google.com/detail/vaultrunner/EXTENSION_ID) from the Chrome Web Store

<details>
<summary>Or load manually for development</summary>

```bash
git clone https://github.com/danielgmason/vaultrunner.git
cd vaultrunner
pnpm install && pnpm build
```

Then in Chrome: `chrome://extensions/` → Enable Developer Mode → Load Unpacked → Select `packages/chrome-extension`
</details>

### 2. Run Setup

```bash
npx vaultrunner setup
```

This checks your 1Password CLI setup and guides you through configuration.

### 3. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

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

Get the [Claude Chrome extension](https://chromewebstore.google.com/detail/claude/EXTENSION_ID) for browser automation.

### 5. Start Using

```
You: "Log me into GitHub"

Claude: I found 2 accounts for github.com:
        1. work@company.com
        2. personal@gmail.com
        Which should I use?

You: "Work account"

Claude: ✓ Filled credentials. Click Sign In to continue.
```

## Requirements

| Requirement | Details |
|------------|---------|
| **1Password** | Account with CLI access enabled |
| **1Password CLI** | `brew install 1password-cli` or auto-installed via setup |
| **Chrome** | With VaultRunner extension installed |
| **Node.js** | Version 18 or higher |
| **Claude Code** | With browser automation (Claude Chrome extension) |

### 1Password CLI Setup

```bash
# Install CLI
brew install --cask 1password-cli

# If using 1Password desktop app:
# Settings → Developer → "Integrate with 1Password CLI"

# Test it works
op vault list
```

## MCP Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password is unlocked and extension connected |
| `list_logins` | List saved logins for a domain (usernames only) |
| `fill_credentials` | Fill credentials into the current page |
| `fill_totp` | Fill TOTP/verification code |
| `get_totp` | Get current TOTP code from 1Password |
| `click_submit` | Click the submit button |
| `click_button` | Click a button by text (for multi-step flows) |

### 2FA Tools

| Tool | Description |
|------|-------------|
| `get_2fa_code` | Read verification codes from SMS or email |
| `fill_totp` | Fill codes into verification fields |

### Automation Tools

| Tool | Description |
|------|-------------|
| `smart_login` | Automated login using learned patterns |
| `login_stats` | View success rates and learned rules |
| `set_account_preference` | Save default account for a domain |

### Session Tools

| Tool | Description |
|------|-------------|
| `start_login_session` | Begin tracking a login attempt |
| `end_login_session` | Complete session and save learning |
| `get_login_session` | Get current session status |

## Security

### What makes VaultRunner secure?

1. **Credentials never touch Claude** — The MCP server sends credentials directly to the browser extension via localhost WebSocket. Claude only receives success/failure status.

2. **Local only** — No external servers. Everything runs on your machine.

3. **1Password security** — Leverages 1Password's encryption, biometric auth, and secure vault architecture.

4. **Minimal permissions** — Chrome extension only needs `activeTab` and `scripting`.

5. **Open source** — Audit the code yourself. No hidden credential handling.

### Data Flow

```
1Password CLI → VaultRunner Server → Chrome Extension → DOM
                      ↓
                 Claude sees:
                 { success: true }
```

## CLI Commands

```bash
# Interactive setup
npx vaultrunner setup

# Check status
npx vaultrunner status

# View login statistics
npx vaultrunner stats

# Start dashboard UI
npx vaultrunner dashboard

# Show MCP config
npx vaultrunner config
```

## Development

```bash
# Clone
git clone https://github.com/danielgmason/vaultrunner.git
cd vaultrunner

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (watch)
pnpm dev
```

## Troubleshooting

<details>
<summary><strong>Extension not connecting</strong></summary>

1. Check the VaultRunner MCP server is running
2. Refresh the page you're trying to log into
3. Check `npx vaultrunner status` for connection status
</details>

<details>
<summary><strong>1Password CLI not working</strong></summary>

1. Run `op vault list` to test CLI access
2. Ensure "Integrate with 1Password CLI" is enabled in 1Password settings
3. Try `op signin` if prompted
</details>

<details>
<summary><strong>Credentials not filling</strong></summary>

1. Make sure you're on a login page with visible form fields
2. Try clicking into the username field first
3. Some sites have unusual form structures—try `click_button` for multi-step flows
</details>

## Privacy

VaultRunner collects no data. Everything runs locally. See [PRIVACY.md](PRIVACY.md) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT © Daniel Mason
