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

### 1. Install Chrome Extension

```bash
git clone https://github.com/anon-dot-com/vaultrunner.git
cd vaultrunner
pnpm install && pnpm build
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked** and select `packages/chrome-extension/dist`

### 2. Run Setup

```bash
npx vaultrunner setup
```

This configures 1Password CLI integration and verifies your setup.

### 3. Add to Claude Code

Add this to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "vaultrunner": {
      "command": "npx",
      "args": ["vaultrunner"]
    }
  }
}
```

### 4. Start Automating

```
You: "Log into my AWS console and check EC2 instances"

Claude: I'll log you into AWS.
        [VaultRunner fills credentials + handles MFA]

        You're now logged in. I can see 3 running EC2 instances...
```

## How It Works

VaultRunner connects Claude to 1Password, enabling secure authenticated automation:

- **Credentials bypass Claude entirely** - 1Password -> Extension -> DOM. Claude only receives success/failure.
- **Automatic MFA** - Reads TOTP from 1Password, SMS from Messages, verification emails from Gmail
- **Multi-step logins** - Handles username -> password -> 2FA flows automatically
- **Learning system** - Improves login reliability over time

## CLI Commands

```bash
npx vaultrunner setup      # Configure 1Password integration
npx vaultrunner status     # Check system status
npx vaultrunner stats      # View login statistics
npx vaultrunner dashboard  # Open web dashboard
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_logins` | List accounts for a domain |
| `fill_credentials` | Fill username/password |
| `fill_totp` | Fill verification code |
| `get_2fa_code` | Read codes from SMS/email |
| `smart_login` | Fully automated login |

## Requirements

- **1Password** with CLI access enabled
- **Chrome** with VaultRunner extension
- **Claude Code** with browser automation (claude-in-chrome MCP)
- **Node.js 18+**

## Security

- Credentials never touch Claude - only success/failure results
- Fully local processing - no external servers
- Your vault, your control - requires 1Password biometric auth
- Open source - audit every line

## License

MIT - See [LICENSE](./LICENSE)

## Links

- [GitHub Repository](https://github.com/anon-dot-com/vaultrunner)
- [Full Documentation](https://github.com/anon-dot-com/vaultrunner#readme)
- [Report Issues](https://github.com/anon-dot-com/vaultrunner/issues)
