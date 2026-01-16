<p align="center">
  <img src="assets/branding/logo.png" alt="VaultRunner" width="120">
  <br><br>
  <a href="https://anon.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://cdn.prod.website-files.com/689bc3805f94765d37f8acd7/689e250badcbdc3397449e2e_Anon%20Official%20Logo%20-%20White.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://cdn.prod.website-files.com/689bc3805f94765d37f8acd7/689c252a7e6af0f5b331a1b1_Anon%20Brandmark%20-%20Black.svg">
      <img alt="by Anon" src="https://cdn.prod.website-files.com/689bc3805f94765d37f8acd7/689e250badcbdc3397449e2e_Anon%20Official%20Logo%20-%20White.svg" height="24">
    </picture>
  </a>
</p>

<p align="center">
  <strong>Give Claude for Chrome a password manager.</strong><br>
  Pulls from 1Password. Fills forms. Handles 2FA. Learns what works.
</p>

<p align="center">
  <a href="https://github.com/anon-dot-com/vaultrunner/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/anon-dot-com/vaultrunner/stargazers"><img src="https://img.shields.io/github/stars/anon-dot-com/vaultrunner?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-it-does">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#mcp-tools">Tools</a>
</p>

---

## Quick Start

> **No cloning required!** Install directly via npm. Only clone if you want to contribute.

### 1. Install

```bash
npx vaultrunner setup
claude mcp add vaultrunner -s user -- npx -p vaultrunner vaultrunner-mcp
```

### 2. Install Claude for Chrome

[Get it from the Chrome Web Store](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)

### 3. Restart Claude Code

```bash
claude mcp list  # Should show vaultrunner
```

### 4. Start Automating

```
You: "Log into my AWS console"

Claude: Found 2 accounts. Which one?
        1. work@company.com
        2. personal@gmail.com

You: "Use work"

Claude: Done! You're logged into AWS.
```

---

## What It Does

| Feature | Description |
|---------|-------------|
| **1Password Integration** | Fetches credentials via 1Password CLI |
| **Automatic 2FA** | TOTP from 1Password, SMS from Messages, codes from Gmail |
| **Pattern Learning** | Remembers successful login flows per site |
| **Account Preferences** | Saves your default account per domain |
| **Dashboard** | Web UI for login history and success rates |

---

## How It Works

VaultRunner is an MCP server that gives Claude access to your 1Password credentials:

```
┌─────────────────────────────────────────────────────────────┐
│  You: "Log into GitHub"                                      │
│  ↓                                                           │
│  Claude: list_logins("github.com") → VaultRunner MCP         │
│  ↓                                                           │
│  VaultRunner: Queries 1Password CLI                          │
│  ↓                                                           │
│  Claude: get_credentials(item_id) → Gets username/password   │
│  ↓                                                           │
│  Claude for Chrome: Fills form, clicks login                 │
│  ↓                                                           │
│  If 2FA needed: get_totp() or get_2fa_code() from SMS/email  │
│  ↓                                                           │
│  Logged in!                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Requirements

- **Claude Max subscription** — Required for Claude Code
- **Claude for Chrome** — [Chrome Web Store](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn)
- **1Password** with CLI enabled ([install guide](https://developer.1password.com/docs/cli/get-started/))
- **Node.js 18+**

### Optional (for 2FA)

- **macOS Messages** — For SMS codes (requires Full Disk Access)
- **Gmail** — For email codes (requires Google OAuth)

---

## MCP Tools

### Credentials

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password is authenticated |
| `list_logins` | List accounts for a domain |
| `get_credentials` | Get username and password |
| `get_totp` | Get TOTP code from 1Password |

### 2FA

| Tool | Description |
|------|-------------|
| `get_2fa_code` | Read codes from SMS or email |

### Preferences

| Tool | Description |
|------|-------------|
| `set_account_preference` | Save default account per site |
| `get_account_preference` | Get saved default |
| `clear_account_preference` | Clear preference |

### Tracking

| Tool | Description |
|------|-------------|
| `report_login_outcome` | Report success/failure |
| `get_login_pattern` | Get learned pattern for a domain |
| `get_login_stats` | View history and statistics |

---

## CLI Commands

```bash
# Setup
npx vaultrunner setup              # Full setup wizard
npx vaultrunner status             # Check system status

# 2FA Configuration
npx vaultrunner setup-messages     # Configure SMS reading (macOS)
npx vaultrunner setup-gmail        # Connect Gmail for email 2FA
npx vaultrunner test-2fa           # Test 2FA code reading

# Dashboard & History
npx vaultrunner dashboard          # Launch web dashboard
npx vaultrunner stats              # View login statistics
npx vaultrunner history            # View recent login attempts
```

---

## Troubleshooting

### "Vault not authenticated"

1. Open 1Password Desktop App and unlock, OR
2. Run `op signin` in terminal

### MCP not loading

1. Run `claude mcp list` to verify
2. Restart Claude Code
3. Check `/mcp` in Claude Code

### 2FA codes not found

- **SMS**: Run `vaultrunner setup-messages` and grant Full Disk Access
- **Gmail**: Run `vaultrunner setup-gmail`
- **TOTP**: Check that 1Password item has a one-time password

---

## Dashboard

```bash
npx vaultrunner dashboard
# Opens http://localhost:19877
```

Tracks login attempts, success rates, 2FA types, and learned patterns.

---

## Use Cases

- **DevOps**: AWS, GCP, Azure consoles
- **Social Media**: Twitter, LinkedIn
- **SaaS**: Salesforce, HubSpot, Zendesk
- **E-commerce**: Shopify, Amazon Seller
- **Any authenticated workflow** Claude couldn't do before

---

## Development (Contributing)

> **For contributors only.** Most users should use the [Quick Start](#quick-start) instead.
>
> **Do not mix npm and local builds.** If you cloned the repo, use the commands below. Do not run `npx vaultrunner` from inside the cloned repo — it will fail.

```bash
git clone https://github.com/anon-dot-com/vaultrunner.git
cd vaultrunner && pnpm install && pnpm build

# Run setup (use local build, NOT npx)
node packages/mcp-server/dist/cli/index.js setup

# Add to Claude Code (use local build, NOT npx)
claude mcp add vaultrunner -s user -- node $(pwd)/packages/mcp-server/dist/index.js
```

---

## License

MIT © [Anonymity Labs, Inc.](https://anon.com)
