#!/usr/bin/env node
/**
 * VaultRunner CLI
 * Command-line interface for managing VaultRunner
 */

import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";
import open from "open";
import { createInterface } from "readline";
import { setupGmail, disconnectGmail, readConfig } from "../sources/gmail-oauth.js";
import { isMessagesConfigured, checkMessagesAccess } from "../sources/messages-reader.js";
import { getGmailStatus } from "../sources/gmail-reader.js";

const program = new Command();

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
};

const BANNER = `
${colors.cyan}${colors.bold}
 ██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗
 ██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝
 ██║   ██║███████║██║   ██║██║     ██║
 ╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║
  ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║
   ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝
${colors.magenta}
 ██████╗ ██╗   ██╗███╗   ██╗███╗   ██╗███████╗██████╗
 ██╔══██╗██║   ██║████╗  ██║████╗  ██║██╔════╝██╔══██╗
 ██████╔╝██║   ██║██╔██╗ ██║██╔██╗ ██║█████╗  ██████╔╝
 ██╔══██╗██║   ██║██║╚██╗██║██║╚██╗██║██╔══╝  ██╔══██╗
 ██║  ██║╚██████╔╝██║ ╚████║██║ ╚████║███████╗██║  ██║
 ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝
${colors.reset}${colors.dim}  Secure credential automation for AI agents${colors.reset}
`;

// Extension Web Store URL (update after publishing)
const EXTENSION_WEBSTORE_URL = "https://chromewebstore.google.com/detail/vaultrunner/EXTENSION_ID_HERE";

/**
 * Check if 1Password CLI is installed
 */
function check1PasswordCLI(): { installed: boolean; path?: string } {
  try {
    const result = execSync("which op", { encoding: "utf-8" }).trim();
    return { installed: true, path: result };
  } catch {
    return { installed: false };
  }
}

/**
 * Install 1Password CLI
 */
async function install1PasswordCLI(): Promise<boolean> {
  const os = platform();

  console.log(`   ${colors.dim}Installing 1Password CLI...${colors.reset}`);

  try {
    if (os === "darwin") {
      // macOS - use Homebrew
      console.log(`   ${colors.dim}Running: brew install --cask 1password-cli${colors.reset}`);
      execSync("brew install --cask 1password-cli", { stdio: "inherit" });
      return true;
    } else if (os === "linux") {
      // Linux - guide to manual install
      console.log(`   ${colors.yellow}Please install 1Password CLI manually:${colors.reset}`);
      console.log(`   ${colors.dim}https://developer.1password.com/docs/cli/get-started/#install${colors.reset}`);
      return false;
    } else if (os === "win32") {
      // Windows - guide to manual install
      console.log(`   ${colors.yellow}Please install 1Password CLI manually:${colors.reset}`);
      console.log(`   ${colors.dim}https://developer.1password.com/docs/cli/get-started/#install${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`   ${colors.red}Failed to install 1Password CLI${colors.reset}`);
    console.log(`   ${colors.dim}Install manually: https://developer.1password.com/docs/cli/get-started/#install${colors.reset}`);
    return false;
  }

  return false;
}

program
  .name("vaultrunner")
  .description("Secure credential automation for AI agents")
  .version("0.1.0");

program
  .command("setup")
  .description("Set up VaultRunner - check requirements and guide through installation")
  .action(async () => {
    console.log(BANNER);
    console.log(`${colors.magenta}${colors.bold}⚡${colors.reset} ${colors.cyan}${colors.bold}VaultRunner Setup${colors.reset}`);
    console.log("");

    let allGood = true;

    // Check 1Password CLI
    console.log(`${colors.bold}1. 1Password CLI${colors.reset}`);
    const opCheck = check1PasswordCLI();
    if (opCheck.installed) {
      console.log(`   ${colors.green}✓${colors.reset} Installed: ${colors.dim}${opCheck.path}${colors.reset}`);
    } else {
      console.log(`   ${colors.red}✗${colors.reset} Not installed`);
      console.log("");
      const os = platform();
      if (os === "darwin") {
        console.log(`   ${colors.cyan}Installing via Homebrew...${colors.reset}`);
        const installed = await install1PasswordCLI();
        if (!installed) {
          allGood = false;
        } else {
          console.log(`   ${colors.green}✓${colors.reset} Installed successfully`);
        }
      } else {
        console.log(`   ${colors.yellow}Please install manually:${colors.reset}`);
        console.log(`   ${colors.dim}https://developer.1password.com/docs/cli/get-started/#install${colors.reset}`);
        allGood = false;
      }
    }
    console.log("");

    // Check 1Password Desktop App (recommended for biometric unlock)
    console.log(`${colors.bold}2. 1Password Desktop App${colors.reset}`);
    const os = platform();
    let desktopAppPath: string | null = null;
    if (os === "darwin") {
      const paths = [
        "/Applications/1Password.app",
        `${homedir()}/Applications/1Password.app`,
      ];
      desktopAppPath = paths.find((p) => existsSync(p)) || null;
    }

    if (desktopAppPath) {
      console.log(`   ${colors.green}✓${colors.reset} Installed ${colors.dim}(enables biometric unlock for CLI)${colors.reset}`);
    } else {
      console.log(`   ${colors.yellow}○${colors.reset} Not detected ${colors.dim}(optional, but recommended for biometric unlock)${colors.reset}`);
    }
    console.log("");

    // Guide to install Chrome extension
    console.log(`${colors.bold}3. VaultRunner Chrome Extension${colors.reset}`);
    console.log(`   ${colors.yellow}○${colors.reset} Install from Chrome Web Store:`);
    console.log(`   ${colors.cyan}${EXTENSION_WEBSTORE_URL}${colors.reset}`);
    console.log("");

    // Guide to install Claude extension
    console.log(`${colors.bold}4. Claude Chrome Extension${colors.reset}`);
    console.log(`   ${colors.dim}Required for browser automation${colors.reset}`);
    console.log(`   ${colors.cyan}https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn${colors.reset}`);
    console.log("");

    // Summary
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    if (allGood) {
      console.log(`${colors.green}${colors.bold}✓ Core requirements met!${colors.reset}`);
      console.log("");
      console.log(`${colors.bold}Next steps:${colors.reset}`);
      console.log(`   1. Install the VaultRunner Chrome extension (link above)`);
      console.log(`   2. Install the Claude Chrome extension if you haven't`);
      console.log(`   3. Add VaultRunner to your Claude Code MCP config`);
    } else {
      console.log(`${colors.yellow}${colors.bold}! Some requirements need attention${colors.reset}`);
      console.log(`   Please install the missing components above.`);
    }
    console.log("");
  });

program
  .command("status")
  .description("Check VaultRunner status and connections")
  .action(() => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}VaultRunner Status${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    // Check 1Password CLI
    const opCheck = check1PasswordCLI();
    console.log(`${colors.bold}1Password CLI:${colors.reset}`);
    if (opCheck.installed) {
      console.log(`   ${colors.green}✓${colors.reset} Installed: ${colors.dim}${opCheck.path}${colors.reset}`);

      // Try to check if signed in
      try {
        execSync("op account list", { encoding: "utf-8", stdio: "pipe" });
        console.log(`   ${colors.green}✓${colors.reset} Authenticated`);
      } catch {
        console.log(`   ${colors.yellow}○${colors.reset} Not signed in ${colors.dim}(run: op signin)${colors.reset}`);
      }
    } else {
      console.log(`   ${colors.red}✗${colors.reset} Not installed ${colors.dim}(run: vaultrunner setup)${colors.reset}`);
    }
    console.log("");

    // Note about extension
    console.log(`${colors.bold}Chrome Extension:${colors.reset}`);
    console.log(`   ${colors.dim}Extension status is shown in the MCP tools${colors.reset}`);
    console.log(`   ${colors.dim}Use get_vault_status tool to check connection${colors.reset}`);
    console.log("");

    // 2FA Sources
    console.log(`${colors.bold}2FA Code Sources:${colors.reset}`);

    // Messages (macOS)
    if (isMessagesConfigured()) {
      console.log(`   ${colors.green}✓${colors.reset} Messages: ${colors.dim}Configured (Full Disk Access granted)${colors.reset}`);
    } else {
      const messagesError = checkMessagesAccess();
      console.log(`   ${colors.yellow}○${colors.reset} Messages: ${colors.dim}${messagesError || "Not configured"}${colors.reset}`);
    }

    // Gmail
    const gmailStatus = getGmailStatus();
    if (gmailStatus.configured) {
      console.log(`   ${colors.green}✓${colors.reset} Gmail: ${colors.dim}${gmailStatus.email}${colors.reset}`);
    } else {
      console.log(`   ${colors.yellow}○${colors.reset} Gmail: ${colors.dim}Not connected (run: vaultrunner setup-gmail)${colors.reset}`);
    }
    console.log("");

    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");
  });

program
  .command("config")
  .description("Show Claude Code MCP configuration")
  .action(() => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}Claude Code MCP Configuration${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");
    console.log(`Add this to your Claude Code MCP settings:`);
    console.log("");
    console.log(`${colors.dim}┌──────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.cyan}{`);
    console.log(`  "mcpServers": {`);
    console.log(`    "vaultrunner": {`);
    console.log(`      "command": "npx",`);
    console.log(`      "args": ["vaultrunner-mcp"]`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}${colors.reset}`);
    console.log(`${colors.dim}└──────────────────────────────────────────────────┘${colors.reset}`);
    console.log("");
    console.log(`${colors.dim}Or if installed globally:${colors.reset}`);
    console.log("");
    console.log(`${colors.dim}┌──────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.cyan}{`);
    console.log(`  "mcpServers": {`);
    console.log(`    "vaultrunner": {`);
    console.log(`      "command": "vaultrunner-mcp"`);
    console.log(`    }`);
    console.log(`  }`);
    console.log(`}${colors.reset}`);
    console.log(`${colors.dim}└──────────────────────────────────────────────────┘${colors.reset}`);
    console.log("");
  });

program
  .command("setup-gmail")
  .description("Connect Gmail for 2FA code reading")
  .action(async () => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}Gmail Setup for 2FA Code Reading${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    // Check if already configured
    const gmailStatus = getGmailStatus();
    if (gmailStatus.configured) {
      console.log(`${colors.yellow}Gmail is already connected: ${gmailStatus.email}${colors.reset}`);
      console.log("");

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("Do you want to reconnect with a different account? (y/N): ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("Setup cancelled.");
        return;
      }
      console.log("");
    }

    console.log(`To connect Gmail, you need Google OAuth credentials.`);
    console.log("");
    console.log(`${colors.bold}Quick Setup:${colors.reset}`);
    console.log(`1. Go to ${colors.cyan}https://console.cloud.google.com/${colors.reset}`);
    console.log(`2. Create a new project (or select existing)`);
    console.log(`3. Enable the Gmail API`);
    console.log(`4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"`);
    console.log(`5. Choose "Desktop app" as application type`);
    console.log(`6. Copy the Client ID and Client Secret`);
    console.log("");

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    const clientId = await new Promise<string>((resolve) => {
      rl.question(`${colors.bold}Enter Client ID:${colors.reset} `, resolve);
    });

    const clientSecret = await new Promise<string>((resolve) => {
      rl.question(`${colors.bold}Enter Client Secret:${colors.reset} `, resolve);
    });

    rl.close();

    if (!clientId || !clientSecret) {
      console.log(`${colors.red}Client ID and Secret are required.${colors.reset}`);
      return;
    }

    console.log("");
    console.log(`${colors.dim}Starting OAuth flow...${colors.reset}`);

    const result = await setupGmail(clientId.trim(), clientSecret.trim());

    console.log("");
    if (result.success) {
      console.log(`${colors.green}${colors.bold}✓ Gmail connected successfully!${colors.reset}`);
      console.log(`   Account: ${colors.cyan}${result.email}${colors.reset}`);
      console.log("");
      console.log(`You can now use the ${colors.bold}get_2fa_code${colors.reset} tool to read verification codes from Gmail.`);
    } else {
      console.log(`${colors.red}${colors.bold}✗ Gmail setup failed${colors.reset}`);
      console.log(`   Error: ${result.error}`);
    }
    console.log("");
  });

program
  .command("disconnect-gmail")
  .description("Disconnect Gmail account")
  .action(async () => {
    console.log("");

    const gmailStatus = getGmailStatus();
    if (!gmailStatus.configured) {
      console.log(`${colors.yellow}Gmail is not connected.${colors.reset}`);
      return;
    }

    console.log(`${colors.bold}Disconnecting Gmail:${colors.reset} ${gmailStatus.email}`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("Are you sure? (y/N): ", resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }

    disconnectGmail();
    console.log(`${colors.green}✓ Gmail disconnected.${colors.reset}`);
    console.log("");
  });

program.parse();
