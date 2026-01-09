/**
 * Browser launch logic for VaultRunner
 * Launches Chrome with a managed profile and auto-loads the VaultRunner extension
 */

import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI colors for CLI output
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

/**
 * VaultRunner directories
 */
export const VAULTRUNNER_DIR = join(homedir(), ".vaultrunner");
export const CHROME_PROFILE_DIR = join(VAULTRUNNER_DIR, "chrome-profile");
export const EXTENSIONS_DIR = join(VAULTRUNNER_DIR, "extensions");
export const BUNDLED_EXTENSIONS_DIR = join(VAULTRUNNER_DIR, "bundled-extensions");

/**
 * Common extensions that make a browser look "normal"
 * These are open source extensions we can bundle or recommend
 * NOTE: No password managers - they would interfere with VaultRunner's form filling
 */
export const RECOMMENDED_EXTENSIONS = [
  {
    id: "ublock-origin",
    name: "uBlock Origin",
    description: "Ad blocker (very common, ~30% of users)",
    chromeId: "cjpalhdlnbpafiamejdnhcphjbkeiagm",
    webstoreUrl: "https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm",
  },
  {
    id: "react-devtools",
    name: "React Developer Tools",
    description: "Common for developers",
    chromeId: "fmkadmapgofadopljbjfkapdkoienihi",
    webstoreUrl: "https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi",
  },
  {
    id: "google-docs-offline",
    name: "Google Docs Offline",
    description: "Pre-installed on many Chrome browsers",
    chromeId: "ghbmnnjooekpmoecnnnilnnbdlolhkhi",
    webstoreUrl: "https://chromewebstore.google.com/detail/google-docs-offline/ghbmnnjooekpmoecnnnilnnbdlolhkhi",
  },
  {
    id: "dark-reader",
    name: "Dark Reader",
    description: "Popular dark mode extension",
    chromeId: "eimadpbcbfnmbkopoojfekhnkhdbieeh",
    webstoreUrl: "https://chromewebstore.google.com/detail/dark-reader/eimadpbcbfnmbkopoojfekhnkhdbieeh",
  },
];

/**
 * Get the Chrome executable path based on platform
 */
export function getChromePath(): string | null {
  const os = platform();

  const browsers: Record<string, string[]> = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    ],
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ],
  };

  const candidates = browsers[os] || browsers.linux;
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Get the path to the VaultRunner Chrome extension
 * Note: We point to the extension ROOT (where manifest.json is), not dist/
 * The manifest.json references dist/background.js and dist/content.js
 */
export function getExtensionPath(): string {
  // The extension is in the sibling chrome-extension package
  // When installed globally, it should be relative to the mcp-server dist
  const possiblePaths = [
    // Development: from mcp-server/dist/cli -> chrome-extension root
    join(__dirname, "..", "..", "..", "..", "chrome-extension"),
    // Development: relative to mcp-server/src/cli
    join(__dirname, "..", "..", "..", "chrome-extension"),
    // Copied to .vaultrunner/extensions
    join(EXTENSIONS_DIR, "chrome-extension"),
  ];

  for (const path of possiblePaths) {
    // Check for manifest.json to confirm it's the extension root
    if (existsSync(join(path, "manifest.json"))) {
      return path;
    }
  }

  // Default to the extensions dir (user should copy it there)
  return join(EXTENSIONS_DIR, "chrome-extension");
}

/**
 * Ensure VaultRunner directories exist
 */
export function ensureDirectories(): void {
  if (!existsSync(VAULTRUNNER_DIR)) {
    mkdirSync(VAULTRUNNER_DIR, { recursive: true });
  }
  if (!existsSync(CHROME_PROFILE_DIR)) {
    mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  }
  if (!existsSync(EXTENSIONS_DIR)) {
    mkdirSync(EXTENSIONS_DIR, { recursive: true });
  }
  if (!existsSync(BUNDLED_EXTENSIONS_DIR)) {
    mkdirSync(BUNDLED_EXTENSIONS_DIR, { recursive: true });
  }
}

/**
 * Get all extension paths to load (VaultRunner + any bundled extensions)
 */
export function getAllExtensionPaths(): string[] {
  const paths: string[] = [];

  // Add VaultRunner extension
  const vaultRunnerExt = getExtensionPath();
  if (existsSync(vaultRunnerExt) && existsSync(join(vaultRunnerExt, "manifest.json"))) {
    paths.push(vaultRunnerExt);
  }

  // Add any bundled extensions
  if (existsSync(BUNDLED_EXTENSIONS_DIR)) {
    const entries = readdirSync(BUNDLED_EXTENSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extPath = join(BUNDLED_EXTENSIONS_DIR, entry.name);
        if (existsSync(join(extPath, "manifest.json"))) {
          paths.push(extPath);
        }
      }
    }
  }

  return paths;
}

/**
 * Configure Chrome profile to have the VaultRunner extension pre-installed
 * This works around Chrome stable not supporting --load-extension
 */
export function configureExtensionInProfile(extensionPath: string): string | null {
  const defaultDir = join(CHROME_PROFILE_DIR, "Default");
  const prefsPath = join(defaultDir, "Preferences");
  const securePrefsPath = join(defaultDir, "Secure Preferences");

  // Ensure Default directory exists
  if (!existsSync(defaultDir)) {
    mkdirSync(defaultDir, { recursive: true });
  }

  // Read manifest to get extension info
  const manifestPath = join(extensionPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Generate a consistent extension ID based on the path
  // Chrome uses a specific algorithm, but for unpacked extensions we can use a simpler approach
  const extensionId = generateExtensionId(extensionPath);

  // Read existing preferences or create new
  let prefs: Record<string, unknown> = {};
  if (existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
    } catch {
      prefs = {};
    }
  }

  // Enable developer mode
  if (!prefs.extensions) {
    prefs.extensions = {};
  }
  const extensions = prefs.extensions as Record<string, unknown>;
  if (!extensions.ui) {
    extensions.ui = {};
  }
  (extensions.ui as Record<string, unknown>).developer_mode = true;

  // Configure the extension in settings
  if (!extensions.settings) {
    extensions.settings = {};
  }
  const settings = extensions.settings as Record<string, unknown>;

  // Add our extension
  settings[extensionId] = {
    active_permissions: {
      api: manifest.permissions || [],
      explicit_host: manifest.host_permissions || [],
      manifest_permissions: [],
      scriptable_host: manifest.host_permissions || [],
    },
    commands: {},
    content_settings: [],
    creation_flags: 1, // CREATION_FLAG_IS_UNPACKED
    from_webstore: false,
    granted_permissions: {
      api: manifest.permissions || [],
      explicit_host: manifest.host_permissions || [],
      manifest_permissions: [],
      scriptable_host: manifest.host_permissions || [],
    },
    incognito_content_settings: [],
    incognito_preferences: {},
    install_time: Date.now().toString(),
    location: 4, // LOAD - unpacked extension
    manifest: manifest,
    newAllowFileAccess: true,
    path: extensionPath,
    preferences: {},
    regular_only_preferences: {},
    state: 1, // ENABLED
    was_installed_by_default: false,
    was_installed_by_oem: false,
    withholding_permissions: false,
  };

  // Write preferences
  writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

  return extensionId;
}

/**
 * Generate a consistent extension ID from a path
 * Chrome's real algorithm is more complex, but this works for our purposes
 */
function generateExtensionId(path: string): string {
  // Use a simple hash of the path to generate a consistent ID
  // Extension IDs are 32 lowercase letters (a-p)
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to a string of letters a-p (16 chars = 4 bits each)
  const chars = "abcdefghijklmnop";
  let id = "";
  const absHash = Math.abs(hash);

  // Generate 32 character ID
  for (let i = 0; i < 32; i++) {
    // Use different parts of the hash and path for each character
    const charIndex = (absHash + path.charCodeAt(i % path.length) + i * 7) % 16;
    id += chars[charIndex];
  }

  return id;
}

/**
 * Print a log message with VaultRunner styling
 */
function log(message: string, type: "info" | "success" | "warn" | "error" = "info"): void {
  const prefix = `${colors.magenta}${colors.bold}⚡${colors.reset}`;
  const colorMap = {
    info: colors.cyan,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red,
  };
  const icon = {
    info: "",
    success: "✓ ",
    warn: "⚠ ",
    error: "✗ ",
  };
  console.log(`${prefix} ${colorMap[type]}${colors.bold}${icon[type]}${message}${colors.reset}`);
}

/**
 * Print a step message
 */
function step(message: string): void {
  console.log(`   ${colors.dim}│ → ${message}${colors.reset}`);
}

export interface LaunchOptions {
  /** Show the banner */
  showBanner?: boolean;
  /** Additional Chrome flags */
  chromeFlags?: string[];
  /** Custom Chrome path */
  chromePath?: string;
  /** Detach the browser process */
  detached?: boolean;
}

/**
 * Launch Chrome with the VaultRunner profile and extension
 */
export async function launchBrowser(options: LaunchOptions = {}): Promise<void> {
  const { showBanner = true, chromeFlags = [], chromePath: customChromePath, detached = true } = options;

  if (showBanner) {
    console.log(BANNER);
  }

  log("Launching VaultRunner browser...");

  // Ensure directories exist
  step("Creating VaultRunner directories...");
  ensureDirectories();

  // Find Chrome
  step("Detecting Chrome installation...");
  const chromePath = customChromePath || getChromePath();

  if (!chromePath) {
    log("Chrome not found! Please install Google Chrome.", "error");
    process.exit(1);
  }
  step(`Found: ${chromePath}`);

  // Get extension path
  const extensionPath = getExtensionPath();
  step(`Extension path: ${extensionPath}`);

  // Build Chrome arguments
  const args = [
    `--user-data-dir=${CHROME_PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...chromeFlags,
  ];

  // Check if this is first run (extension not yet installed in profile)
  const profileExtensionsDir = join(CHROME_PROFILE_DIR, "Default", "Extensions");
  const isFirstRun = !existsSync(profileExtensionsDir) || readdirSync(profileExtensionsDir).length === 0;

  if (isFirstRun && existsSync(extensionPath)) {
    console.log("");
    log("First-time setup - install the VaultRunner extension:", "info");
    console.log("");
    step("1. Browser will open to chrome://extensions");
    step("2. Enable 'Developer mode' (toggle in top-right)");
    step("3. Click 'Load unpacked'");
    step("4. Select this folder:");
    console.log(`      ${colors.cyan}${extensionPath}${colors.reset}`);
    console.log("");
    step("This is one-time only - extension will persist in your profile.");
    console.log("");

    // Open to extensions page on first run
    args.push("chrome://extensions");
  }

  // Launch Chrome
  step("Starting Chrome...");

  let chrome;
  const os = platform();

  if (os === "darwin") {
    // On macOS, use 'open -n -a' to force a new instance
    // This works even when Chrome is already running
    const openArgs = [
      "-n", // Open a new instance
      "-a", chromePath.includes(".app") ? chromePath.replace(/\/Contents\/MacOS\/.*$/, "") : "Google Chrome",
      "--args",
      ...args,
    ];
    chrome = spawn("open", openArgs, {
      detached,
      stdio: detached ? "ignore" : "inherit",
    });
  } else {
    // On Windows/Linux, launch directly
    chrome = spawn(chromePath, args, {
      detached,
      stdio: detached ? "ignore" : "inherit",
    });
  }

  if (detached) {
    chrome.unref();
  }

  console.log("");
  log("Browser launched successfully!", "success");
  console.log("");
  console.log(`${colors.dim}   Profile: ${CHROME_PROFILE_DIR}${colors.reset}`);
  console.log(`${colors.dim}   Extension: ${extensionPath}${colors.reset}`);
  console.log("");
  log("Next steps:", "info");
  step("1. The VaultRunner extension should auto-connect");
  step("2. Log into any sites you want to automate");
  step("3. Use Claude Code with browser automation");
  console.log("");
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
}
