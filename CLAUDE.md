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

## CRITICAL: Use TodoWrite to Enforce Login Reporting

**Problem:** Claude forgets to call `report_login_outcome` after successful logins. When Claude completes a login flow and sees the dashboard/success screen, it mentally marks the task "done" and moves on—without calling `report_login_outcome`. This leaves login sessions untracked.

**Solution:** Use TodoWrite to enforce the reporting step.

When Claude starts a login flow, it **must** create a todo list that includes "Report login outcome to VaultRunner" as the final item. The login is not complete until that todo is marked done.

### Required todo structure for every login:

```
1. List logins from 1Password [completed]
2. Get credentials and navigate to login page [completed]
3. Enter username/email and proceed [completed]
4. Enter password and submit [completed]
5. Handle 2FA if required [completed]
6. Report login outcome to VaultRunner [in_progress] ← CANNOT skip this
```

### Key behaviors:

1. **Create the todo list immediately** when starting a login flow—before calling `get_credentials`
2. **"Report login outcome" must always be the final todo item**
3. **Do not mark it complete** until `report_login_outcome` is actually called
4. **Call `report_login_outcome` BEFORE taking a confirmation screenshot**—the visual confirmation creates a false sense of completion

### Why this works:

- The todo list creates visible accountability
- Claude cannot mentally "finish" until all todos are checked
- The explicit final step prevents the dopamine-driven shortcut of "I see the dashboard, I'm done"

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
