# vaultrunner

The missing auth layer for Claude browser automation. Secure logins. Automatic MFA. Zero credential exposure.

## Installation

```bash
npx vaultrunner setup
```

Or install globally:

```bash
npm install -g vaultrunner
vaultrunner setup
```

## Quick Start

### 1. Prerequisites

- **1Password CLI** - Install with `brew install --cask 1password-cli`
- **Claude for Chrome** - Anthropic's browser automation extension
- **Claude Max subscription** - Required for Claude for Chrome

### 2. Run Setup

```bash
npx vaultrunner setup
```

This configures 1Password CLI integration and verifies your setup.

### 3. Add to Claude Code

Add this to your Claude Code MCP configuration (`~/.claude.json`):

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

### 4. Start Automating

```
You: "Log into my AWS console and check EC2 instances"

Claude: I'll log you into AWS.
        [VaultRunner provides credentials, Claude for Chrome fills the form]

        You're now logged in. I can see 3 running EC2 instances...
```

## How It Works

VaultRunner is an MCP server that connects Claude to 1Password:

1. **VaultRunner queries 1Password** for credentials via the CLI
2. **Claude receives the credentials** through MCP
3. **Claude for Chrome fills the form** in your browser
4. **2FA codes** are retrieved from 1Password TOTP, SMS, or Gmail

## CLI Commands

```bash
npx vaultrunner setup           # Configure 1Password integration
npx vaultrunner status          # Check system status
npx vaultrunner config          # Show MCP config instructions
npx vaultrunner stats           # View login statistics
npx vaultrunner history         # Show recent login attempts
npx vaultrunner patterns        # Show learned login patterns
npx vaultrunner dashboard       # Open web dashboard
npx vaultrunner setup-gmail     # Connect Gmail for 2FA codes
npx vaultrunner disconnect-gmail # Disconnect Gmail
npx vaultrunner setup-messages  # Set up SMS reading (macOS)
npx vaultrunner test-2fa        # Test 2FA code reading
npx vaultrunner clear-history   # Clear login history
npx vaultrunner clear-patterns  # Clear learned patterns
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_vault_status` | Check if 1Password CLI is authenticated |
| `list_logins` | List accounts for a domain |
| `get_credentials` | Get username and password for an item |
| `get_totp` | Get TOTP code from 1Password |
| `get_2fa_code` | Read codes from SMS/email |
| `set_account_preference` | Save default account for a domain |
| `get_account_preference` | Get saved default account |
| `clear_account_preference` | Clear saved preference |
| `start_login_session` | Start tracking a login attempt |
| `end_login_session` | End session with browser steps |
| `get_login_pattern` | Get stored pattern for a domain |
| `get_login_stats` | View login statistics |

## Login Flow Example

```
1. list_logins("github.com")        # Get available accounts
2. get_credentials(item_id)         # Get username/password
3. [Claude for Chrome fills form]   # Browser automation
4. get_totp(item_id)                # Get 2FA code if needed
5. [Claude for Chrome fills 2FA]    # Complete login
```

## Requirements

- **1Password** with CLI access enabled
- **Claude for Chrome** extension (requires Claude Max)
- **Node.js 18+**
- **macOS** (for SMS reading via Messages)

## 2FA Sources

| Source | Setup |
|--------|-------|
| 1Password TOTP | Automatic if item has TOTP configured |
| SMS (macOS) | `npx vaultrunner setup-messages` |
| Gmail | `npx vaultrunner setup-gmail` |

## Security

- Credentials fetched fresh from 1Password each time
- Fully local processing - no external servers
- Your vault, your control - requires 1Password biometric auth
- Open source - audit every line

## License

MIT - See [LICENSE](./LICENSE)

## Links

- [GitHub Repository](https://github.com/anon-dot-com/vaultrunner)
- [Full Documentation](https://github.com/anon-dot-com/vaultrunner#readme)
- [Report Issues](https://github.com/anon-dot-com/vaultrunner/issues)
