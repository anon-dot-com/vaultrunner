# Chrome Web Store Listing

## Extension Name
VaultRunner

## Short Description (132 characters max)
Secure 1Password autofill for Claude Code. Fill credentials without exposing passwords to AI. Works with Claude's browser automation.

## Detailed Description

### The Problem
AI assistants can now control browsers, but handling passwords securely is tricky. You don't want to paste credentials into a chat or have AI see your passwords.

### The Solution
VaultRunner bridges 1Password and Claude Code's browser automation. When Claude needs to log into a site, it asks VaultRunner to fill credentials - but the actual passwords flow directly from 1Password to the form fields. Claude never sees them.

### How It Works
1. Claude Code detects a login page
2. VaultRunner queries 1Password for matching logins (returns usernames only, not passwords)
3. You approve which account to use
4. Credentials flow: 1Password → VaultRunner → Form fields
5. Claude only sees: "Successfully filled username and password"

### Features
- **Zero Password Exposure**: Credentials go straight to forms, never through AI
- **1Password Integration**: Uses the official 1Password CLI for secure vault access
- **TOTP Support**: Can fill 2FA codes too
- **Open Source**: Fully auditable code - trust but verify

### Requirements
- 1Password account with CLI access
- Claude Code with browser automation (Claude Chrome extension)
- 1Password CLI installed (`brew install --cask 1password-cli` on Mac)

### Privacy First
- No data collection or analytics
- All processing happens locally
- Passwords never logged or cached
- Open source for full transparency

### Get Started
1. Install this extension
2. Install 1Password CLI if you haven't
3. Add VaultRunner to your Claude Code MCP config
4. Start automating logins securely!

For setup instructions and documentation, visit our GitHub repository.

---

## Category
Productivity

## Language
English

## Tags/Keywords
- 1password
- password manager
- autofill
- claude
- ai assistant
- browser automation
- credentials
- security
- mcp
- login

---

## Screenshots Needed

1. **VaultRunner in action** - Show Claude Code asking to fill credentials and VaultRunner completing it
2. **Security flow diagram** - Visual showing credentials never pass through AI
3. **Setup complete** - Show the extension connected and ready
4. **Login form filled** - Before/after of a login form

## Promotional Images

### Small Tile (440x280)
Purple gradient background with VaultRunner logo and tagline: "Secure AI-powered login automation"

### Large Tile (920x680)
Split design showing:
- Left: Claude Code interface
- Right: 1Password vault
- Center: VaultRunner logo with secure connection visual
- Tagline: "Your passwords stay between you and your browser"

### Marquee (1400x560)
Full-width banner with:
- VaultRunner logo prominent
- "Secure Credential Automation for AI"
- Visual of password being filled without AI seeing it
- GitHub stars badge (once we have them)
