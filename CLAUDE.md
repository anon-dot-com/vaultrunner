# VaultRunner - Claude Code Guidelines

## Login Flow

```
1. list_logins(domain)              # Get available accounts
2. get_credentials(item_id)         # Get username/password  [SESSION STARTS]
3. [Fill username, click Next/Submit]
4. [Fill password, click Sign in]
5. If 2FA prompt:
   - get_2fa_code() for SMS/email   # Check this first!
   - get_totp(item_id) for TOTP     # Fallback
   - [Fill code, click Verify]
6. report_login_outcome(success)    # Always call this      [SESSION ENDS]
```

**Always call `report_login_outcome` after every login attempt.**

---

## Tools

| Tool | Purpose |
|------|---------|
| `list_logins(domain)` | Find accounts for a domain |
| `get_credentials(item_id)` | Get username and password |
| `get_2fa_code(sender?, source?)` | Get verification code from SMS/email |
| `get_totp(item_id)` | Get TOTP code from 1Password |
| `report_login_outcome(success, steps?)` | Report login result |
| `set_account_preference(domain, item_id)` | Save default account choice |
| `get_account_preference(domain)` | Get saved default |

---

## Multiple Accounts

When `list_logins` returns multiple accounts:
1. Check for `isDefault: true`
2. If none, ask the user
3. After login, offer: `set_account_preference(domain, item_id)`

---

## 2FA Tips

| Site | Method | Hint |
|------|--------|------|
| X.com | SMS | `get_2fa_code(sender: "40404")` |
| npm | Email | `get_2fa_code(source: "gmail", sender: "npm")` |
| GitHub | TOTP | `get_totp(item_id)` |
| Google | Varies | Try `get_2fa_code()` first, then TOTP |

---

## Reporting Steps (Optional but Recommended)

Include browser steps for better pattern learning:

```javascript
report_login_outcome({
  success: true,
  steps: [
    { action: "fill_field", field: "username" },
    { action: "click_button", text: "Next" },
    { action: "fill_field", field: "password" },
    { action: "click_button", text: "Sign in" }
  ]
})
```

Step types: `fill_field`, `click_button`, `wait`, `navigate`

---

## Troubleshooting

- **"Vault not authenticated"**: User needs to unlock 1Password
- **2FA code not found**: Check if SMS/Gmail is set up (`vaultrunner setup-gmail`)
- **No session warning**: Session timed out (5 min), login was still tracked
