# VaultRunner Privacy Policy

**Last Updated:** January 2025

## Overview

VaultRunner is a Chrome extension that enables secure credential autofill for AI-assisted browser automation. This privacy policy explains what data VaultRunner collects, how it's used, and your rights regarding that data.

## Core Privacy Principle

**VaultRunner never stores, transmits, or exposes your passwords to AI systems.**

Credentials flow directly from your 1Password vault to web page form fields. The AI assistant only receives confirmation that fields were filled, never the actual credential values.

## Data Collection

### What VaultRunner Does NOT Collect

- Passwords or credentials
- Form field values
- Browsing history
- Personal information
- Analytics or usage data
- Cookies or session tokens

### What VaultRunner Does Access

1. **Website Domain Names**: When you request to fill credentials, VaultRunner accesses the domain name of the current tab to match it with saved logins in 1Password.

2. **Form Field Detection**: VaultRunner identifies login forms on web pages to determine where to fill credentials. This detection happens locally in your browser.

3. **1Password Item Metadata**: VaultRunner retrieves login item titles and usernames (not passwords) from 1Password to display available accounts for a domain.

## Data Flow

```
1Password CLI (local) -> MCP Server (local) -> Chrome Extension (local) -> Web Page Form
                                                        ^
                                                        |
                                              Credentials never leave
                                              your local machine except
                                              to fill the form
```

## Third-Party Services

VaultRunner communicates with:

1. **1Password CLI**: Runs locally on your machine to access your vault. Credentials are retrieved locally through the official 1Password command-line interface.

2. **Local MCP Server**: A local server running on your machine that coordinates between the AI assistant and the Chrome extension. No data is sent to external servers.

## Data Storage

VaultRunner stores minimal configuration data locally:

- **Access permissions**: Records which credential items you've approved for autofill
- **Configuration settings**: User preferences for the extension

This data is stored in `~/.vaultrunner/` on your local machine and is never transmitted externally.

## Security

- All communication between components happens locally on your machine
- Credentials are never logged, cached, or stored by VaultRunner
- The extension requires explicit user action to fill credentials
- You can revoke access permissions at any time

## Your Rights

You can:

- **Review** which credentials you've approved for autofill
- **Revoke** access to specific credentials at any time
- **Uninstall** the extension to remove all local data
- **Inspect** the source code (VaultRunner is open source)

## Open Source

VaultRunner is open source software. You can review the complete source code at:
https://github.com/anthropics/vaultrunner

## Children's Privacy

VaultRunner is not intended for use by children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted to this page with an updated revision date.

## Contact

For questions about this privacy policy or VaultRunner's data practices, please open an issue on our GitHub repository.

---

**Summary**: VaultRunner helps you securely fill credentials without exposing them to AI. Your passwords stay between 1Password and your browser - never shared with AI assistants or external servers.
