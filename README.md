<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/vaultrunner-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo/vaultrunner-logo-light.svg">
    <img alt="VaultRunner" src="assets/logo/vaultrunner-logo-dark.svg" width="280">
  </picture>
</p>

<p align="center">
  <strong>The missing auth layer for Claude browser automation</strong><br>
  Secure logins. Automatic MFA. Zero credential exposure.
</p>

<p align="center">
  <a href="https://github.com/danielgmason/vaultrunner/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/danielgmason/vaultrunner/stargazers"><img src="https://img.shields.io/github/stars/danielgmason/vaultrunner?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> •
  <a href="#how-it-works">Solution</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#security">Security</a>
</p>

---

## The Problem

Claude can automate your browser—**but only for sites where you're already logged in.**

For anything requiring authentication, you're stuck:

- **Frequent re-logins**: Sites that expire sessions or require MFA on each visit
- **Async automations**: Background tasks that run while you're away
- **Multi-account workflows**: Switching between accounts requires manual auth

When auth is needed, you have to return to the browser, manually enter credentials, handle MFA codes, and babysit the automation. This defeats the purpose.

**VaultRunner eliminates this friction.**

## The Solution

VaultRunner connects Claude to 1Password, enabling secure authenticated automation:

| Capability | How It Works |
|------------|--------------|
| **1Password Sync** | Credentials flow directly from your vault to the browser—Claude never sees them |
| **Automatic MFA** | Reads TOTP codes from 1Password, SMS from Messages, verification emails from Gmail |
| **Multi-step Logins** | Handles username → password → 2FA flows automatically |
| **Account Selection** | Remembers your preferred account per site |
| **Learning System** | Improves login reliability over time |

### Security Model

```
┌─────────────────────────────────────────────────────────────┐
│  Claude: "Log me into GitHub"                               │
│  ↓                                                          │
│  VaultRunner: Fetches credentials from 1Password            │
│  ↓                                                          │
│  Chrome Extension: Fills form directly                      │
│  ↓                                                          │
│  Claude receives: { success: true }                         │
│                                                             │
│  ✓ Credentials never touch Claude                           │
│  ✓ Compliant with Claude's security policies                │
│  ✓ All processing happens locally                           │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install VaultRunner Extension

Install from [Chrome Web Store](https://chromewebstore.google.com/detail/vaultrunner/EXTENSION_ID) or load manually for development.

### 2. Run Setup

```bash
npx vaultrunner setup
```

Configures 1Password CLI integration and verifies your setup.

### 3. Add to Claude Code

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

### 4. Automate

```
You: "Log into my AWS console and check EC2 instances"

Claude: I'll log you into AWS.
        [VaultRunner fills credentials + handles MFA]

        You're now logged in. I can see 3 running EC2 instances...
```

## How It Works

### Credential Flow

1. **Claude requests login** → Calls `list_logins("aws.amazon.com")`
2. **VaultRunner queries 1Password** → Returns account list (no passwords)
3. **Claude selects account** → Calls `fill_credentials(item_id)`
4. **1Password → Extension → Browser** → Credentials filled directly
5. **Claude receives confirmation** → `{ success: true, filledFields: ["email", "password"] }`

**Claude never sees your password.** It only knows the operation succeeded.

### MFA Handling

VaultRunner automatically handles multi-factor authentication:

| MFA Type | Source | How |
|----------|--------|-----|
| **TOTP** | 1Password | Reads authenticator codes directly from your vault |
| **SMS** | macOS Messages | Queries local Messages database for verification codes |
| **Email** | Gmail | Searches recent emails for verification codes |

```
Site sends SMS: "Your code is 847291"
↓
VaultRunner: get_2fa_code(sender="40404")
↓
Returns: { code: "847291", source: "messages" }
↓
VaultRunner: fill_totp(code="847291")
↓
Login complete
```

### Multi-Step Login Flows

Many sites split login across multiple pages. VaultRunner handles this:

```
1. fill_credentials → fills username
2. click_button("Next")
3. fill_credentials → fills password
4. click_button("Sign in")
5. get_2fa_code → retrieves SMS code
6. fill_totp → enters code
7. click_button("Verify")
```

The `smart_login` tool automates this entire flow using learned patterns.

## MCP Tools

### Authentication

| Tool | Description |
|------|-------------|
| `list_logins` | List accounts for a domain (usernames only) |
| `fill_credentials` | Fill username/password into current page |
| `fill_totp` | Fill verification code |
| `get_totp` | Get TOTP code from 1Password |
| `get_2fa_code` | Read codes from SMS or email |
| `click_button` | Click buttons for multi-step flows |

### Automation

| Tool | Description |
|------|-------------|
| `smart_login` | Fully automated login with learned patterns |
| `login_stats` | View success rates and patterns |
| `set_account_preference` | Remember default account per site |

### System

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check 1Password and extension status |

## Security

### Why This Is Safe

1. **Credentials bypass Claude entirely** — 1Password → Extension → DOM. Claude only receives success/failure.

2. **Compliant with Claude's policies** — Claude doesn't handle passwords. VaultRunner does, locally.

3. **Your vault, your control** — Requires 1Password biometric auth. Nothing stored externally.

4. **Fully local** — No servers. No cloud. Everything on your machine.

5. **Open source** — Audit every line. No hidden credential handling.

### What Claude Sees

```json
// Claude's view of a login:
{
  "action": "fill_credentials",
  "result": {
    "success": true,
    "filledFields": ["username", "password"]
  }
}

// What Claude does NOT see:
// - Your actual password
// - Your TOTP secrets
// - Your email verification codes
```

## Requirements

- **1Password** with CLI access enabled
- **Chrome** with VaultRunner extension
- **Claude Code** with browser automation
- **Node.js 18+**

### Optional (for 2FA)

- **macOS Messages** — For SMS code reading (requires Full Disk Access)
- **Gmail** — For email code reading (requires OAuth setup)

## CLI Commands

```bash
npx vaultrunner setup      # Configure 1Password integration
npx vaultrunner status     # Check system status
npx vaultrunner stats      # View login statistics
npx vaultrunner dashboard  # Open web dashboard
```

## Use Cases

- **DevOps**: Log into AWS, GCP, Azure consoles
- **Social Media**: Post to Twitter, LinkedIn, manage accounts
- **Finance**: Check balances, download statements
- **SaaS Management**: Access Salesforce, HubSpot, Zendesk
- **E-commerce**: Manage Shopify, Amazon Seller accounts
- **Any authenticated workflow** Claude couldn't do before

## Development

```bash
git clone https://github.com/danielgmason/vaultrunner.git
cd vaultrunner && pnpm install && pnpm build
```

## License

MIT © Daniel Mason

---

<p align="center">
  <strong>VaultRunner makes authenticated automation possible.</strong><br>
  Claude handles the browser. 1Password handles the credentials. You stay in control.
</p>
