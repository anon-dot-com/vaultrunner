# VaultRunner - Claude Code Guidelines

## CRITICAL: The One Thing You Must Remember

**After EVERY login attempt, call `report_login_outcome`.**

That's it. Everything else is automatic.

---

## Quick Reference: Login Flow

```
1. list_logins(domain)           # Find accounts
2. get_credentials(item_id)      # Get password (auto-starts tracking!)
3. [Browser: fill forms, click buttons]
4. get_totp() or get_2fa_code()  # If 2FA needed (auto-tracked!)
5. [Browser: complete login]
6. report_login_outcome(success) # <-- DON'T FORGET THIS!
```

---

## Tool Reference

### Core Tools (Use These)

| Tool | When to Use | Auto-Tracked? |
|------|-------------|---------------|
| `list_logins(domain)` | Find available accounts for a site | Yes |
| `get_credentials(item_id)` | Get username/password | Yes (starts session) |
| `get_totp(item_id)` | Get TOTP code from 1Password | Yes |
| `get_2fa_code(source?, sender?)` | Get SMS/email verification code | Yes |
| `report_login_outcome(success, steps?)` | **Report if login succeeded** | N/A |

### Account Management

| Tool | When to Use |
|------|-------------|
| `set_account_preference(domain, item_id)` | Remember user's preferred account |
| `get_account_preference(domain)` | Get saved default account |
| `clear_account_preference(domain)` | Clear saved preference |

### Optional (Analytics/Debugging)

| Tool | When to Use |
|------|-------------|
| `get_vault_status()` | Check if 1Password is unlocked |
| `get_login_pattern(domain)` | See previously learned login steps |
| `get_login_stats(domain?, limit?)` | View login history/statistics |

### Legacy (Still Work, But Not Required)

| Tool | Notes |
|------|-------|
| `start_login_session(domain)` | Not needed - sessions auto-start on get_credentials |
| `end_login_session(...)` | Use `report_login_outcome` instead (simpler) |

---

## Data Quality Tiers

VaultRunner tracks login attempts automatically. Your reporting determines data quality:

| Quality | What You Did | What's Tracked |
|---------|--------------|----------------|
| **Gold** | Called `report_login_outcome` with `steps` array | Full analytics + pattern learning |
| **Silver** | Called `report_login_outcome` without steps | Success/fail known |
| **Bronze** | Forgot to report (session auto-ended) | Domain, account, 2FA type only |

**Goal: Gold quality = better future logins.**

---

## Complete Example

```
User: "Log me into GitHub"

1. list_logins("github.com")
   → Returns: [{ id: "abc123", username: "user@example.com", ... }]

2. get_credentials("abc123")
   → Returns: { username: "user@example.com", password: "..." }
   → (Session auto-started for github.com)

3. [Browser automation]
   - Navigate to github.com/login
   - Fill username field
   - Fill password field
   - Click "Sign in"

4. get_totp("abc123")  # If 2FA prompt appears
   → Returns: { totp: "123456" }
   → (2FA type auto-recorded as "totp")

5. [Browser automation]
   - Fill 2FA code field
   - Click "Verify"

6. report_login_outcome({
     success: true,
     steps: [
       { action: "fill_field", field: "username" },
       { action: "fill_field", field: "password" },
       { action: "click_button", text: "Sign in" },
       { action: "fill_field", field: "2fa_code" },
       { action: "click_button", text: "Verify" }
     ]
   })
   → Returns: { recorded: { domain: "github.com", data_quality: "gold", ... } }
```

---

## 2FA Priority

When a site asks for 2FA, check in this order:

1. **`get_2fa_code()`** - Check SMS/email first (many sites use this)
2. **`get_totp(item_id)`** - Fall back to 1Password TOTP

### 2FA Source Hints

| Site | Typical 2FA | get_2fa_code params |
|------|-------------|---------------------|
| X.com (Twitter) | SMS | `sender: "40404"` |
| Google | Various | `source: "gmail"` or TOTP |
| GitHub | TOTP or SMS | Try TOTP first |
| npm | Email OTP | `source: "gmail", sender: "npm"` |

---

## Handling Multiple Accounts

When `list_logins` returns multiple accounts:

```
1. Check if one is marked `isDefault: true`
   → If yes, use that account

2. If no default, ASK THE USER which account to use

3. After successful login, offer to save preference:
   set_account_preference(domain, item_id)
```

---

## Browser Step Format

When reporting steps, use this format:

```javascript
// Fill a form field
{ action: "fill_field", field: "username" }  // or "password", "2fa_code"

// Click a button
{ action: "click_button", text: "Sign in" }  // or "Next", "Continue", "Verify"

// Wait between steps
{ action: "wait", seconds: 2 }

// Navigate to URL
{ action: "navigate", url: "https://github.com/login" }
```

---

## Common Issues

### "Vault not authenticated"
User needs to unlock 1Password (biometrics or `op signin`)

### 2FA code not found
- **SMS**: User needs Full Disk Access for Messages
- **Gmail**: User needs to run `vaultrunner setup-gmail`
- **TOTP**: Item may not have TOTP configured in 1Password

### Session already ended
Sessions auto-expire after 5 minutes. If you get this warning, the login was likely already tracked with bronze quality.

---

## CLI Commands (For Users)

```bash
vaultrunner setup           # Initial setup
vaultrunner status          # Check system status
vaultrunner dashboard       # Open web dashboard
vaultrunner setup-gmail     # Connect Gmail for 2FA
vaultrunner setup-messages  # Set up SMS reading (macOS)
```
