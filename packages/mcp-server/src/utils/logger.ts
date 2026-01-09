/**
 * VaultRunner Logger
 * Provides colorized CLI output for visibility into operations
 */

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgBlue: "\x1b[44m",
};

// ASCII Art Banner
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

const PREFIX = `${colors.magenta}${colors.bold}⚡${colors.reset}`;
const BOX_TOP = `${colors.cyan}╭${"─".repeat(50)}╮${colors.reset}`;
const BOX_BOT = `${colors.cyan}╰${"─".repeat(50)}╯${colors.reset}`;

let bannerShown = false;

export const logger = {
  /**
   * Show the startup banner (only once)
   */
  banner: () => {
    if (!bannerShown) {
      console.error(BANNER);
      bannerShown = true;
    }
  },
  /**
   * Info message - general operation info
   */
  info: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.cyan}${colors.bold}${message}${colors.reset}`, ...args);
  },

  /**
   * Success message - operation completed successfully
   */
  success: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.green}${colors.bold}✓ ${message}${colors.reset}`, ...args);
  },

  /**
   * Warning message - something to be aware of
   */
  warn: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.yellow}${colors.bold}⚠ ${message}${colors.reset}`, ...args);
  },

  /**
   * Error message - operation failed
   */
  error: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.red}${colors.bold}✗ ${message}${colors.reset}`, ...args);
  },

  /**
   * Step message - sub-operation or step in a process
   */
  step: (message: string, ...args: unknown[]) => {
    console.error(`   ${colors.gray}│ → ${message}${colors.reset}`, ...args);
  },

  /**
   * Prompt message - asking for user input
   */
  prompt: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.yellow}${colors.bold}? ${message}${colors.reset}`, ...args);
  },

  /**
   * Access granted message
   */
  granted: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.green}${colors.bold}🔓 ACCESS GRANTED: ${message}${colors.reset}`, ...args);
  },

  /**
   * Access denied message
   */
  denied: (message: string, ...args: unknown[]) => {
    console.error(`${PREFIX} ${colors.red}${colors.bold}🔒 ACCESS DENIED: ${message}${colors.reset}`, ...args);
  },

  /**
   * Credential info (sanitized - no passwords)
   */
  credential: (title: string, username: string, vault: string) => {
    console.error(
      `   ${colors.cyan}│${colors.reset} ${colors.bold}${title}${colors.reset} ${colors.dim}─${colors.reset} ${colors.yellow}${username}${colors.reset} ${colors.dim}[${vault}]${colors.reset}`
    );
  },

  /**
   * Divider line
   */
  divider: () => {
    console.error(`${colors.cyan}${"━".repeat(52)}${colors.reset}`);
  },

  /**
   * Start a boxed section
   */
  boxStart: (title: string) => {
    console.error(BOX_TOP);
    console.error(`${colors.cyan}│${colors.reset} ${colors.bold}${colors.magenta}${title}${colors.reset}`);
    console.error(`${colors.cyan}├${"─".repeat(50)}┤${colors.reset}`);
  },

  /**
   * End a boxed section
   */
  boxEnd: () => {
    console.error(BOX_BOT);
  },

  /**
   * Action start - for major operations
   */
  action: (action: string, target: string) => {
    console.error("");
    console.error(`${colors.bgMagenta}${colors.white}${colors.bold} ${action.toUpperCase()} ${colors.reset} ${colors.cyan}${colors.bold}${target}${colors.reset}`);
    console.error(`${colors.cyan}┌${"─".repeat(50)}${colors.reset}`);
  },

  /**
   * Action end
   */
  actionEnd: (success: boolean, message: string) => {
    console.error(`${colors.cyan}└${"─".repeat(50)}${colors.reset}`);
    if (success) {
      console.error(`  ${colors.green}${colors.bold}✓ ${message}${colors.reset}`);
    } else {
      console.error(`  ${colors.red}${colors.bold}✗ ${message}${colors.reset}`);
    }
    console.error("");
  },
};
