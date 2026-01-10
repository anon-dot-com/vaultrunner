# VaultRunner - Claude Code Guidelines

## Login Flow Best Practices

### General Rules

1. **Multi-step login flows**: Many sites split login into username → password → 2FA steps. After filling each field, look for a "Next", "Continue", or "Submit" button before proceeding.

2. **Avoid social login buttons**: Always prefer standard email/password login over OAuth buttons (Google, Apple, Facebook, Microsoft, GitHub, LinkedIn, Twitter). Use `click_button` with `exclude_texts` parameter if needed.

3. **2FA code sources**: Check `get_2fa_code` for SMS/email codes BEFORE trying `fill_totp` with a 1Password item_id. Many accounts use SMS-based 2FA rather than TOTP.

4. **Button click order of preference**:
   - "Next" / "Continue" (for multi-step flows)
   - "Log in" / "Sign in" (for final submission)
   - Avoid: Social login buttons, "Create account", "Sign up"

5. **Wait between steps**: Allow 2-3 seconds after clicking buttons for page transitions.

6. **Field detection**: If `fill_credentials` reports missing fields, the page may not have loaded fully or may be showing a different step. Wait and retry.

### Site-Specific Rules

#### X.com (Twitter)
- **Login URL**: `https://x.com/i/flow/login`
- **Flow**: Username → Next → Password → Log in → SMS 2FA → Next
- **2FA**: SMS from shortcode `40404`, message format: "X authentication code: XXXXXX"
- **Buttons**: Use "Next" after username, "Log in" after password, "Next" after 2FA code
- **Notes**: Has Google/Apple OAuth buttons - avoid these

#### Webflow
- **Login URL**: `https://webflow.com/dashboard/login`
- **Flow**: Email + Password on same page → Log in → (2FA if enabled)
- **Notes**: Single-page login form

#### Google
- **Login URL**: `https://accounts.google.com`
- **Flow**: Email → Next → Password → Next → (2FA)
- **2FA**: May use Google Authenticator TOTP, SMS, or Google prompts
- **Notes**: Multi-step flow similar to X.com

### Recommended Login Sequence

```
1. list_logins(domain) → get credentials
2. fill_credentials(item_id) → fills available fields
3. If only username filled:
   a. click_button("Next") or click_button("Continue")
   b. wait 2 seconds
   c. fill_credentials(item_id) → fill password
4. click_button("Log in") or click_submit()
5. wait 3 seconds
6. If 2FA required:
   a. get_2fa_code(sender) → check SMS/email first
   b. If found: fill_totp(code=<code>)
   c. If not found: fill_totp(item_id) → try 1Password TOTP
   d. click_button("Next") or click_submit()
```

### Troubleshooting

- **1Password overlay blocking**: VaultRunner tools work through content scripts and bypass overlay issues. Use VaultRunner tools instead of browser automation for credential filling.
- **"Cannot access chrome-extension://"**: This error means 1Password's overlay is active. VaultRunner fill_credentials/click_button still work.
- **Field not found**: Page may be in wrong state. Check what step you're on and use appropriate button clicks.

## Learning System

VaultRunner learns from every login attempt and improves over time.

### How It Works

1. **Local Learning**: Every login attempt is logged with steps and outcomes
2. **Rule Refinement**: Successful patterns are extracted and stored as rules
3. **Community Sharing**: Users can contribute their learned rules via GitHub PRs
4. **Distribution**: Community rules are bundled in npm updates

### Using smart_login

For the best experience, use the `smart_login` tool which:
- Looks up existing rules for the domain
- Executes the optimal login flow automatically
- Handles multi-step flows and 2FA
- Logs the attempt and learns from the outcome

```
smart_login(domain="x.com", item_id="...")
```

### Checking Stats

Use `login_stats` to see:
- Success rates and learned patterns
- Rules ready for contribution
- Recent login history

### Contributing Rules

After 3+ successful logins to a site, your learned rules become eligible for contribution:

```bash
vaultrunner contribute-rules
```

This packages your patterns and guides you through creating a GitHub PR.

### CLI Commands

- `vaultrunner stats` - View login statistics
- `vaultrunner contribute-rules` - Share learned patterns
- `vaultrunner clear-history` - Clear login history (keeps rules)
