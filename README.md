<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/vaultrunner-logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo/vaultrunner-logo-light.svg">
    <img alt="Vaultrunner" src="assets/logo/vaultrunner-logo-dark.svg" width="280">
  </picture>
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
  <strong>1Password credentials for Claude browser automation</strong><br>
  Connect your vault to Claude for Chrome. Automate logins with MFA.
</p>

<p align="center">
  <a href="https://github.com/anon-dot-com/vaultrunner/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/anon-dot-com/vaultrunner/stargazers"><img src="https://img.shields.io/github/stars/anon-dot-com/vaultrunner?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> •
  <a href="#how-it-works">Solution</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#mcp-tools">Tools</a>
</p>

---

## The Problem

Claude for Chrome can automate browsers—until a site asks you to log in.

**Logins, session expirations, and MFA challenges break automation.** When auth is required, you have to manually enter credentials, handle 2FA codes, and complete the flow before automation can continue.

**VaultRunner bridges 1Password and Claude for Chrome.**

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

| Capability | How It Works |
|------------|--------------|
| **1Password Integration** | Fetches credentials via 1Password CLI |
| **TOTP Codes** | Reads authenticator codes from 1Password |
| **SMS 2FA** | Reads verification codes from macOS Messages |
| **Email 2FA** | Reads verification codes from Gmail |
| **Account Selection** | Remembers your preferred account per site |
| **Login Tracking** | Records login attempts with MCP tool steps and browser actions |
| **Pattern Learning** | Learns successful login flows per domain for future reference |
| **Dashboard** | Web UI showing login history, success rates, and learned patterns |

## Quick Start

### Option A: Install via npm (Recommended)

```bash
npx vaultrunner setup
claude mcp add vaultrunner -s user -- npx vaultrunner-mcp
```

### Option B: Clone and Build (for Development)

```bash
git clone https://github.com/anon-dot-com/vaultrunner.git
cd vaultrunner
pnpm install && pnpm build

# Run setup
node packages/mcp-server/dist/cli/index.js setup

# Add MCP to Claude Code (from the vaultrunner directory)
claude mcp add vaultrunner -s user -- node $(pwd)/packages/mcp-server/dist/index.js
```

### Verify Installation

Restart Claude Code to load the VaultRunner MCP:

```bash
claude mcp list  # Should show vaultrunner
```

### Install Claude for Chrome

VaultRunner provides credentials; Claude for Chrome handles browser automation.

Install from Chrome Web Store: [Claude for Chrome](https://chromewebstore.google.com/detail/claude/danfoofmcgmjopflpidnpkdlphdngjgo)

### Start Automating Logins

```
You: "Log into my AWS console"

Claude: I'll look up your AWS credentials.
        [Calls list_logins("aws.amazon.com")]

        Found 2 accounts. Which one?
        1. work@company.com
        2. personal@gmail.com

You: "Use work"

Claude: [Calls get_credentials(item_id)]
        [Uses Claude for Chrome to fill and submit]

        Done! You're logged into AWS.
```

## MCP Tools

### Credentials

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password is authenticated |
| `list_logins` | List accounts for a domain (usernames only) |
| `get_credentials` | Get username and password for an item |
| `get_totp` | Get TOTP code from 1Password |

### 2FA Codes

| Tool | Description |
|------|-------------|
| `get_2fa_code` | Read verification codes from SMS or email |

### Account Preferences

| Tool | Description |
|------|-------------|
| `set_account_preference` | Remember default account per site |
| `get_account_preference` | Get saved default account |
| `clear_account_preference` | Clear saved preference |

### Session Tracking

| Tool | Description |
|------|-------------|
| `report_login_outcome` | Report login result (sessions auto-start on `get_credentials`) |
| `get_login_pattern` | Get stored pattern for a domain |
| `get_login_stats` | View login history and statistics |

## Dashboard

VaultRunner includes a web dashboard for monitoring login activity:

```bash
npx vaultrunner dashboard
# Opens http://localhost:19877
```

### What the Dashboard Tracks

| Metric | Description |
|--------|-------------|
| **Total Logins** | Number of login attempts and unique sites |
| **Success Rate** | Percentage of successful logins |
| **2FA Breakdown** | Logins by 2FA type (TOTP, SMS, Email, None) |
| **Login History** | Detailed log with domain, account, outcome, steps, and timestamps |
| **Learned Patterns** | Saved login flows per domain with success rates |

### Login History Details

Each login attempt records:
- **MCP Tool Steps**: Which VaultRunner tools were called (`list_logins`, `get_credentials`, `get_totp`)
- **Browser Steps**: Actions taken in Claude for Chrome (`fill_field`, `click_button`)
- **Account Used**: Which credential was used
- **2FA Type**: Whether TOTP, SMS, email, or no 2FA was required
- **Timestamps**: When the login started and completed

## Login Flow Example

Here's how Claude handles a multi-step login with 2FA:

```
1. list_logins("x.com") → Get available accounts
2. get_credentials(item_id) → Get username/password [SESSION AUTO-STARTS]
3. [Claude for Chrome] Fill username, click "Next"
4. [Claude for Chrome] Fill password, click "Log in"
5. get_2fa_code(sender="40404") → Read SMS code
6. [Claude for Chrome] Fill 2FA code, click "Verify"
7. report_login_outcome(success=true) → Record result [SESSION ENDS]
```

Sessions auto-start when `get_credentials` is called. Call `report_login_outcome` after every login to record the result.

## Requirements

- **Claude Max subscription** — Required for Claude Code
- **Claude for Chrome** — [Install from Chrome Web Store](https://chromewebstore.google.com/detail/claude/danfoofmcgmjopflpidnpkdlphdngjgo)
- **1Password** with CLI enabled ([install guide](https://developer.1password.com/docs/cli/get-started/))
- **1Password Desktop App** (optional, enables biometric unlock)
- **Node.js 18+**

### Optional (for 2FA)

- **macOS Messages** — For SMS code reading (requires Full Disk Access)
- **Gmail** — For email code reading (requires Google OAuth)

## CLI Commands

If installed via npm, use `npx vaultrunner` or `vaultrunner` (if installed globally):

```bash
# Setup
npx vaultrunner setup              # Full setup wizard
npx vaultrunner status             # Check system status
npx vaultrunner config             # Show MCP config instructions

# 2FA Configuration
npx vaultrunner setup-messages     # Configure SMS reading (macOS)
npx vaultrunner setup-gmail        # Connect Gmail for email 2FA
npx vaultrunner disconnect-gmail   # Disconnect Gmail
npx vaultrunner test-2fa           # Test 2FA code reading

# Dashboard & History
npx vaultrunner dashboard          # Launch web dashboard (default: port 19877)
npx vaultrunner dashboard --port 8080  # Use custom port
npx vaultrunner stats              # View login statistics
npx vaultrunner history            # View recent login attempts
npx vaultrunner patterns           # View learned login patterns
npx vaultrunner clear-history      # Clear login history
npx vaultrunner clear-patterns     # Clear learned patterns
```

For development (cloned repo), use:
```bash
node packages/mcp-server/dist/cli/index.js <command>
```

## Troubleshooting

### "Vault not authenticated"

1Password needs to be unlocked:
1. Open 1Password Desktop App and unlock with biometrics, OR
2. Run `op signin` in terminal

### MCP not loading in Claude Code

1. Verify the MCP is added:
   ```bash
   claude mcp list
   ```
2. Restart Claude Code after adding
3. Check status with `/mcp` in Claude Code

### 2FA codes not found

- **SMS**: Run `vaultrunner setup-messages` and grant Full Disk Access
- **Gmail**: Run `vaultrunner setup-gmail` to connect your account
- **TOTP**: Ensure the 1Password item has a one-time password configured

## Use Cases

- **DevOps**: Log into AWS, GCP, Azure consoles
- **Social Media**: Post to Twitter, LinkedIn, manage accounts
- **Finance**: Check balances, download statements
- **SaaS Management**: Access Salesforce, HubSpot, Zendesk
- **E-commerce**: Manage Shopify, Amazon Seller accounts
- **Any authenticated workflow** Claude couldn't do before

## Development

```bash
git clone https://github.com/anon-dot-com/vaultrunner.git
cd vaultrunner && pnpm install && pnpm build
```

## License

MIT © [Anonymity Labs, Inc.](https://anon.com)

---

<p align="center">
  <strong>VaultRunner + Claude for Chrome = Authenticated automation.</strong><br>
  Claude handles the browser. 1Password handles the credentials.
</p>
