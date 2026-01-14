#!/usr/bin/env node
/**
 * VaultRunner CLI
 * Command-line interface for managing VaultRunner
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";
import open from "open";
import { createInterface } from "readline";
import { setupGmail, disconnectGmail } from "../sources/gmail-oauth.js";
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
${colors.reset}${colors.dim}  1Password credentials for Claude browser automation${colors.reset}
`;

/**
 * Find the repo root by looking for package.json with name "vaultrunner"
 */
function findRepoRoot(): string | null {
  let dir = process.cwd();
  while (dir !== "/") {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "vaultrunner" && pkg.private === true) {
          return dir;
        }
      } catch {
        // Not valid JSON, continue
      }
    }
    dir = join(dir, "..");
  }
  return null;
}

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
  .description("1Password credentials for Claude browser automation")
  .version("0.2.0");

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

    // Guide to install Claude for Chrome extension
    console.log(`${colors.bold}3. Claude for Chrome Extension${colors.reset}`);
    console.log(`   ${colors.dim}Required for browser automation${colors.reset}`);
    console.log(`   ${colors.cyan}https://chromewebstore.google.com/detail/claude/danfoofmcgmjopflpidnpkdlphdngjgo${colors.reset}`);
    console.log("");

    // Summary
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    if (allGood) {
      console.log(`${colors.green}${colors.bold}✓ Setup complete!${colors.reset}`);
      console.log("");
      console.log(`${colors.bold}Next steps:${colors.reset}`);
      console.log(`   1. Install the Claude for Chrome extension if you haven't`);
      console.log(`   2. Add VaultRunner MCP to Claude Code (see below)`);
      console.log("");

      // Show MCP configuration instructions
      const repoRoot = findRepoRoot() || process.cwd();
      const mcpPath = join(repoRoot, "packages/mcp-server/dist/index.js");
      console.log(`${colors.bold}Add VaultRunner MCP to Claude Code:${colors.reset}`);
      console.log("");
      console.log(`   ${colors.cyan}claude mcp add vaultrunner -s user -- node ${mcpPath}${colors.reset}`);
      console.log("");
      console.log(`   Or use ${colors.cyan}/mcp${colors.reset} in Claude Code and add manually.`);
      console.log("");
      console.log(`   3. Restart Claude Code to load VaultRunner MCP`);
      console.log("");
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
  .description("Show how to add VaultRunner MCP to Claude Code")
  .action(() => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}Add VaultRunner MCP to Claude Code${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    const repoRoot = findRepoRoot() || process.cwd();
    const mcpPath = join(repoRoot, "packages/mcp-server/dist/index.js");

    console.log(`${colors.bold}Option 1: Use the claude CLI (recommended)${colors.reset}`);
    console.log("");
    console.log(`   Run this command:`);
    console.log("");
    console.log(`   ${colors.cyan}claude mcp add vaultrunner -s user -- node ${mcpPath}${colors.reset}`);
    console.log("");
    console.log(`   Then restart Claude Code.`);
    console.log("");
    console.log(`${colors.bold}Option 2: Use /mcp in Claude Code${colors.reset}`);
    console.log("");
    console.log(`   1. Type ${colors.cyan}/mcp${colors.reset} in Claude Code`);
    console.log(`   2. Select "Add MCP Server"`);
    console.log(`   3. Configure with:`);
    console.log(`      - Name: ${colors.cyan}vaultrunner${colors.reset}`);
    console.log(`      - Command: ${colors.cyan}node${colors.reset}`);
    console.log(`      - Args: ${colors.cyan}${mcpPath}${colors.reset}`);
    console.log("");
    console.log(`${colors.bold}Verify it's working:${colors.reset}`);
    console.log("");
    console.log(`   ${colors.cyan}claude mcp list${colors.reset}        # Should show vaultrunner`);
    console.log(`   ${colors.cyan}/mcp${colors.reset}                   # Check status in Claude Code`);
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

program
  .command("setup-messages")
  .description("Set up Messages (SMS/iMessage) for 2FA code reading")
  .action(async () => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}Messages Setup for 2FA Code Reading${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    // Check platform
    if (platform() !== "darwin") {
      console.log(`${colors.red}✗ Messages reading is only available on macOS.${colors.reset}`);
      console.log("");
      return;
    }

    // Check current status
    if (isMessagesConfigured()) {
      console.log(`${colors.green}✓ Messages is already configured and working!${colors.reset}`);
      console.log("");
      console.log(`Your terminal app has Full Disk Access and can read the Messages database.`);
      console.log("");
      return;
    }

    // Show instructions
    const error = checkMessagesAccess();
    console.log(`${colors.yellow}⚠ ${error}${colors.reset}`);
    console.log("");
    console.log(`${colors.bold}To enable Messages reading, you need to grant Full Disk Access:${colors.reset}`);
    console.log("");
    console.log(`${colors.cyan}Step 1:${colors.reset} Open System Settings`);
    console.log(`        You can do this by clicking the Apple menu → System Settings`);
    console.log("");
    console.log(`${colors.cyan}Step 2:${colors.reset} Navigate to Privacy & Security`);
    console.log(`        Click "Privacy & Security" in the sidebar`);
    console.log("");
    console.log(`${colors.cyan}Step 3:${colors.reset} Find Full Disk Access`);
    console.log(`        Scroll down and click "Full Disk Access"`);
    console.log("");
    console.log(`${colors.cyan}Step 4:${colors.reset} Add your terminal app`);
    console.log(`        Click the + button and add one of these:`);
    console.log(`        • Terminal (in /Applications/Utilities/)`);
    console.log(`        • iTerm (if you use iTerm2)`);
    console.log(`        • Your IDE's terminal (VS Code, Cursor, etc.)`);
    console.log("");
    console.log(`${colors.cyan}Step 5:${colors.reset} Restart your terminal`);
    console.log(`        Close and reopen your terminal for changes to take effect`);
    console.log("");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${colors.bold}Open System Settings now? (Y/n):${colors.reset} `, resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "n") {
      console.log("");
      console.log(`${colors.dim}Opening System Settings...${colors.reset}`);
      // Open directly to Full Disk Access pane
      execSync("open 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'");
      console.log("");
      console.log(`${colors.yellow}After granting access, restart your terminal and run:${colors.reset}`);
      console.log(`   ${colors.cyan}vaultrunner setup-messages${colors.reset}`);
      console.log("");
      console.log(`to verify it's working.`);
    }
    console.log("");
  });

program
  .command("test-2fa")
  .description("Test 2FA code reading from configured sources")
  .action(async () => {
    console.log("");
    console.log(`${colors.cyan}${colors.bold}Testing 2FA Code Reading${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");

    // Check Messages
    console.log(`${colors.bold}Messages (SMS/iMessage):${colors.reset}`);
    if (platform() !== "darwin") {
      console.log(`   ${colors.dim}Not available (macOS only)${colors.reset}`);
    } else if (isMessagesConfigured()) {
      console.log(`   ${colors.green}✓${colors.reset} Configured - attempting to read recent messages...`);
      try {
        // Dynamic import to avoid errors on non-macOS
        const { getRecentMessages } = await import("../sources/messages-reader.js");
        const messages = getRecentMessages(3600); // Last hour
        console.log(`   ${colors.green}✓${colors.reset} Success! Found ${messages.length} messages in the last hour`);
        if (messages.length > 0) {
          console.log(`   ${colors.dim}Most recent: "${messages[0].text.substring(0, 40)}..."${colors.reset}`);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.log(`   ${colors.red}✗${colors.reset} Error: ${error}`);
      }
    } else {
      const error = checkMessagesAccess();
      console.log(`   ${colors.yellow}○${colors.reset} Not configured: ${colors.dim}${error}${colors.reset}`);
      console.log(`   ${colors.dim}Run: vaultrunner setup-messages${colors.reset}`);
    }
    console.log("");

    // Check Gmail
    console.log(`${colors.bold}Gmail:${colors.reset}`);
    const gmailStatus = getGmailStatus();
    if (gmailStatus.configured) {
      console.log(`   ${colors.green}✓${colors.reset} Configured: ${gmailStatus.email}`);
      console.log(`   ${colors.dim}Attempting to search Gmail...${colors.reset}`);
      try {
        const { searchGmailForCode } = await import("../sources/gmail-reader.js");
        const result = await searchGmailForCode({ maxAgeSeconds: 3600 });
        if (result.error) {
          console.log(`   ${colors.yellow}⚠${colors.reset} ${result.error}`);
        } else if (result.found) {
          console.log(`   ${colors.green}✓${colors.reset} Found a code: ${result.code} from ${result.sender}`);
        } else {
          console.log(`   ${colors.green}✓${colors.reset} Connection working (no verification codes in last hour)`);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        console.log(`   ${colors.red}✗${colors.reset} Error: ${error}`);
      }
    } else {
      console.log(`   ${colors.yellow}○${colors.reset} Not configured`);
      console.log(`   ${colors.dim}Run: vaultrunner setup-gmail${colors.reset}`);
    }
    console.log("");

    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log("");
  });

program.parse();
