# Chrome Web Store - Detailed Description

**Character count: ~4,800 (well under 10,000 limit)**

---

## The Problem

Claude browser automation is powerful—until a site asks you to log in.

When you're working in the terminal with Claude Code, authentication breaks your flow. Session expirations, MFA challenges, and multi-step login forms force you to leave your terminal, open the browser, manually enter credentials, handle 2FA codes, and complete the flow before automation can continue.

This interrupts:
• Async automations that run while you're away
• Scripts that need to authenticate across multiple sites
• Any workflow where sessions expire unexpectedly

VaultRunner solves this by connecting Claude to your 1Password vault, enabling secure authenticated automation without ever exposing your credentials to AI.

## How It Works

VaultRunner acts as a secure bridge between Claude Code and 1Password:

1. Claude requests a login → calls VaultRunner
2. VaultRunner queries 1Password → returns account list (usernames only, never passwords)
3. Claude selects an account → VaultRunner fills credentials directly into the browser
4. Claude receives confirmation → { success: true }

The key insight: **Claude never sees your password.** Credentials flow directly from 1Password to the browser's form fields. Claude only knows the operation succeeded.

## Core Features

**1Password Integration**
Credentials flow directly from your vault to the browser. VaultRunner uses the official 1Password CLI for secure vault access. Your passwords are never logged, cached, or exposed to Claude.

**Automatic MFA Handling**
VaultRunner handles multi-factor authentication automatically:
• TOTP codes from 1Password authenticator
• SMS codes from macOS Messages
• Verification codes from Gmail

When a site sends you a 2FA code, VaultRunner retrieves it and fills it in—all without manual intervention.

**Multi-Step Login Flows**
Many sites split login across multiple pages (username → password → 2FA). VaultRunner handles these sequences automatically, clicking through each step and filling the appropriate fields.

**Smart Learning System**
VaultRunner learns from every login attempt. It remembers site-specific patterns, your preferred accounts per domain, and improves reliability over time. After successful logins, it stores the working pattern for faster future attempts.

**Account Preferences**
When you have multiple accounts for a site (personal and work GitHub, for example), VaultRunner remembers which one you prefer to use by default.

## Security Model

VaultRunner was designed with security as the foundation:

**Credentials Bypass Claude Entirely**
The flow is: 1Password → VaultRunner Extension → Browser DOM. Claude's API never receives your actual passwords. It only gets success/failure confirmation and a list of which fields were filled.

**Compliant with Claude's Security Policies**
Since Claude doesn't handle passwords directly, VaultRunner works within Claude's security guidelines. The AI assistant orchestrates the login, but the sensitive credential handling happens locally through VaultRunner.

**Your Vault, Your Control**
VaultRunner requires 1Password biometric authentication to access your vault. Nothing is stored externally. You maintain complete control over which credentials are used and when.

**Fully Local Processing**
There are no servers. No cloud services. Everything runs on your machine. Your credentials never leave your device, and there's no external service that could be compromised.

**Open Source**
Every line of code is available on GitHub for inspection. You can audit exactly how credentials are handled. Trust but verify—we encourage security researchers to review our implementation.

## What Claude Sees vs. What It Doesn't

When a login happens, Claude receives:
```
{
  "action": "fill_credentials",
  "result": {
    "success": true,
    "filledFields": ["username", "password"]
  }
}
```

What Claude does NOT see:
• Your actual password
• Your TOTP secrets
• Your SMS verification codes
• Your email verification codes
• Any sensitive credential data

## Use Cases

VaultRunner enables authenticated automation for:

**DevOps & Cloud**
Log into AWS, GCP, Azure, and other cloud consoles. Check resources, manage deployments, and monitor services—all from your terminal.

**Social Media Management**
Post to Twitter/X, LinkedIn, and other platforms. Manage multiple accounts without switching contexts.

**Financial Services**
Access banking dashboards, check balances, download statements. Handle the authentication that previously required manual intervention.

**SaaS Administration**
Manage Salesforce, HubSpot, Zendesk, and other business tools. Automate repetitive admin tasks that require authentication.

**E-commerce**
Access Shopify, Amazon Seller Central, and other merchant platforms. Automate inventory checks, order management, and reporting.

**Any Authenticated Workflow**
If it requires a login and you want Claude to handle it, VaultRunner makes it possible.

## Requirements

• 1Password account with CLI access enabled
• 1Password CLI installed (brew install --cask 1password-cli on Mac)
• Claude Code with browser automation capabilities
• Node.js 18 or higher

**Optional (for enhanced 2FA support):**
• macOS Messages app (for SMS code reading—requires Full Disk Access permission)
• Gmail account (for email verification code reading—requires OAuth setup)

## Quick Start

1. Install this extension from the Chrome Web Store
2. Run `npx vaultrunner setup` to configure 1Password integration
3. Add VaultRunner to your Claude Code MCP configuration
4. Start automating: "Log into my AWS console and check EC2 instances"

## Privacy & Data

• No analytics or tracking
• No data collection
• All processing happens locally on your device
• Passwords are never logged or cached
• Open source for complete transparency

## Support

• Documentation: github.com/anon-dot-com/vaultrunner
• Issues: github.com/anon-dot-com/vaultrunner/issues
• Discussions: github.com/anon-dot-com/vaultrunner/discussions

## About

VaultRunner is built by Anonymity Labs (anon.com) and is released under the MIT license. We believe authenticated automation should be secure by design, not an afterthought.

---

**VaultRunner: The missing auth layer for Claude browser automation.**

Claude handles the browser. 1Password handles the credentials. You stay in control.
