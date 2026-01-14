# VaultRunner - Claude Code Guidelines

## Overview

VaultRunner is an MCP server that provides 1Password credentials to Claude. Claude uses the Claude for Chrome extension for browser automation (filling forms, clicking buttons).

## Available Tools

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password CLI is authenticated |
| `list_logins` | List accounts for a domain (returns usernames, not passwords) |
| `get_credentials` | Get username and password for an item ID |
| `get_totp` | Get TOTP code from 1Password |
| `get_2fa_code` | Read verification codes from SMS (Messages) or email (Gmail) |
| `set_account_preference` | Remember default account for a domain |
| `get_account_preference` | Get saved default account |
| `clear_account_preference` | Clear saved preference |

## Login Flow (using Claude for Chrome)

### Standard Flow

1. `list_logins(domain)` → Get available accounts
2. `get_credentials(item_id)` → Get username/password
3. Use Claude for Chrome to fill username field
4. Use Claude for Chrome to click "Next" if multi-step
5. Use Claude for Chrome to fill password field
6. Use Claude for Chrome to click "Log in" / "Sign in"
7. If 2FA required:
   a. `get_2fa_code()` → Check SMS/email first
   b. Or `get_totp(item_id)` → Get from 1Password
   c. Use Claude for Chrome to fill code and submit

### Example Sequence

```
User: "Log me into X.com"

1. list_logins("x.com") → Returns accounts with item IDs
2. If multiple accounts, ask user which one (or use saved preference)
3. get_credentials(item_id) → Returns { username, password }
4. Navigate to https://x.com/i/flow/login (if not already there)
5. Fill username field with the returned username
6. Click "Next" button
7. Wait for password field to appear
8. Fill password field with the returned password
9. Click "Log in" button
10. If 2FA prompt appears:
    - get_2fa_code(sender="40404") → Check SMS for X.com codes
    - If found, fill the code field
    - Click "Next" or "Verify"
11. Login complete
```

## Site-Specific Notes

### X.com (Twitter)
- **Login URL**: `https://x.com/i/flow/login`
- **Flow**: Username → Next → Password → Log in → SMS 2FA → Next
- **2FA**: SMS from shortcode `40404`, format: "X authentication code: XXXXXX"
- **Buttons**: Use "Next" after username, "Log in" after password

### Google
- **Login URL**: `https://accounts.google.com`
- **Flow**: Email → Next → Password → Next → (2FA)
- **Notes**: Multi-step flow, may have TOTP or Google prompts

### General Tips
- **Avoid social login buttons**: Prefer standard email/password login over OAuth (Google, Apple, Facebook, etc.)
- **Multi-step flows**: Many sites split login into username → password → 2FA steps
- **Wait between steps**: Allow 2-3 seconds after clicking for page transitions
- **Button text varies**: Look for "Next", "Continue", "Log in", "Sign in", "Submit"

## 2FA Sources

Check `get_2fa_code` for SMS/email codes BEFORE trying `get_totp`. Many accounts use SMS-based 2FA rather than TOTP.

| Source | Usage |
|--------|-------|
| SMS (Messages) | `get_2fa_code(source="messages")` - Reads macOS Messages database |
| Gmail | `get_2fa_code(source="gmail")` - Searches recent emails |
| 1Password TOTP | `get_totp(item_id)` - Gets authenticator code from vault |

## Account Preferences

When a domain has multiple accounts, VaultRunner can remember the user's preferred choice:

```
# If list_logins returns multiple accounts and no default is set:
1. Ask user which account to use
2. set_account_preference(domain, item_id) to remember choice

# Next time:
1. get_account_preference(domain) returns saved item_id
2. Use that account automatically
```

## Troubleshooting

### "Vault not authenticated"
- User needs to unlock 1Password (biometrics or `op signin`)

### 2FA code not found
- SMS: User needs Full Disk Access for Messages (`vaultrunner setup-messages`)
- Gmail: User needs to connect Gmail (`vaultrunner setup-gmail`)
- TOTP: Item may not have TOTP configured in 1Password
