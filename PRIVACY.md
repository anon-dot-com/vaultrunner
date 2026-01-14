# VaultRunner Privacy Policy

**Last Updated:** January 2025

## Overview

VaultRunner is an MCP (Model Context Protocol) server that provides secure credential management for AI-assisted browser automation. It bridges 1Password credentials to Claude, which uses the Claude for Chrome extension for browser interactions.

## How VaultRunner Works

VaultRunner operates as a local MCP server that:

1. **Reads credentials from 1Password** using the official 1Password CLI (`op`)
2. **Provides credential data to Claude** via the MCP protocol
3. **Claude for Chrome performs browser automation** (filling forms, clicking buttons)

```
Claude Code <-> VaultRunner (MCP) <-> 1Password CLI
                    |
            Claude for Chrome <-> Browser
```

## Data Collection

### What We DON'T Collect

- **No passwords or secrets sent externally** - Credentials flow from 1Password to the browser locally
- **No browsing history** - We don't track which sites you visit
- **No personal information** - No names, emails, or identifiers collected
- **No analytics or telemetry** - No data sent to external servers
- **No cloud storage** - Everything runs locally on your machine

### What We DO Store (Locally)

VaultRunner stores the following data **locally on your machine** in `~/.vaultrunner/`:

| File | Purpose |
|------|---------|
| `config.json` | Gmail OAuth settings (if configured) |
| `gmail-tokens.json` | Gmail API tokens (if configured) |
| `login-history.json` | Login attempt history for learning |
| `login-patterns.json` | Learned login patterns per domain |
| `account-preferences.json` | Default account preferences per domain |

**All data remains on your local machine and is never transmitted externally.**

## Credential Flow

When you log into a website using VaultRunner:

1. **You request a login** through Claude
2. **VaultRunner queries 1Password CLI** for matching credentials
3. **Credentials are returned to Claude** (username and password)
4. **Claude for Chrome fills the form** in your browser
5. **Login history is saved locally** for pattern learning

### Security Considerations

- **1Password authentication required** - You must unlock 1Password (biometrics or master password)
- **No credential caching** - Credentials are fetched fresh each time from 1Password
- **Local processing only** - No external servers involved
- **Open source** - Full code available for audit at [github.com/anon-dot-com/vaultrunner](https://github.com/anon-dot-com/vaultrunner)

## 2FA Code Sources

VaultRunner can read 2FA codes from:

### 1Password TOTP
- Reads TOTP secrets directly from 1Password items
- Requires the item to have a TOTP field configured

### SMS (macOS Messages)
- Reads from the local Messages database (`~/Library/Messages/chat.db`)
- Requires **Full Disk Access** permission for your terminal
- Only reads recent messages (configurable, default 5 minutes)
- No messages are stored or transmitted

### Gmail
- Uses OAuth 2.0 to access your Gmail (read-only)
- Searches for recent verification emails
- Tokens stored locally in `~/.vaultrunner/gmail-tokens.json`
- You can disconnect anytime with `vaultrunner disconnect-gmail`

## Third-Party Services

### 1Password CLI
- VaultRunner uses the official 1Password CLI
- Subject to [1Password's Privacy Policy](https://1password.com/legal/privacy/)

### Google Gmail API (Optional)
- Only if you configure Gmail for 2FA codes
- Read-only access to search for verification emails
- Subject to [Google's Privacy Policy](https://policies.google.com/privacy)

### Claude for Chrome
- Browser automation is performed by Anthropic's Claude for Chrome extension
- Subject to [Anthropic's Privacy Policy](https://www.anthropic.com/privacy)

## Data Retention

- **Login history**: Stored indefinitely until you clear it (`vaultrunner clear-history`)
- **Patterns**: Stored indefinitely until you clear them (`vaultrunner clear-patterns`)
- **Gmail tokens**: Stored until you disconnect (`vaultrunner disconnect-gmail`)
- **Account preferences**: Stored until you clear them

## Your Rights

You have full control over your data:

- **View data**: Check `~/.vaultrunner/` directory
- **Clear history**: `vaultrunner clear-history`
- **Clear patterns**: `vaultrunner clear-patterns`
- **Disconnect Gmail**: `vaultrunner disconnect-gmail`
- **Delete everything**: Remove the `~/.vaultrunner/` directory

## Open Source

VaultRunner is open source software. You can review the complete source code at:
https://github.com/anon-dot-com/vaultrunner

## Children's Privacy

VaultRunner is not intended for use by children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above and committed to our public repository.

## Contact

For privacy concerns or questions:
- **GitHub Issues**: [github.com/anon-dot-com/vaultrunner/issues](https://github.com/anon-dot-com/vaultrunner/issues)
- **Email**: dm@team.anon.com

---

**VaultRunner is open source software developed by [Anonymity Labs, Inc.](https://anon.com)**
