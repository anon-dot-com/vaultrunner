/**
 * Gmail OAuth Handler
 * Handles OAuth 2.0 authentication flow for Gmail API access
 */

import { google, Auth } from "googleapis";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type Credentials = Auth.Credentials;
import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import open from "open";

// VaultRunner config directory
const VAULTRUNNER_DIR = join(homedir(), ".vaultrunner");
const TOKENS_PATH = join(VAULTRUNNER_DIR, "gmail-tokens.json");
const CONFIG_PATH = join(VAULTRUNNER_DIR, "config.json");

// OAuth configuration
// For development/testing, users need to provide their own credentials
// In production, these would be bundled with the app
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_PORT = 19877;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`;

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
}

export interface VaultRunnerConfig {
  gmail?: {
    enabled: boolean;
    email?: string;
    clientId?: string;
    clientSecret?: string;
  };
  messages?: {
    enabled: boolean;
  };
}

/**
 * Ensure VaultRunner directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(VAULTRUNNER_DIR)) {
    mkdirSync(VAULTRUNNER_DIR, { recursive: true });
  }
}

/**
 * Read VaultRunner config
 */
export function readConfig(): VaultRunnerConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write VaultRunner config
 */
export function writeConfig(config: VaultRunnerConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Read stored OAuth tokens
 */
export function readTokens(): Credentials | null {
  if (!existsSync(TOKENS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write OAuth tokens
 */
function writeTokens(tokens: Credentials): void {
  ensureConfigDir();
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

/**
 * Delete OAuth tokens
 */
export function deleteTokens(): void {
  if (existsSync(TOKENS_PATH)) {
    unlinkSync(TOKENS_PATH);
  }
}

/**
 * Check if Gmail is configured with valid tokens
 */
export function isGmailConfigured(): boolean {
  const config = readConfig();
  if (!config.gmail?.enabled || !config.gmail?.clientId || !config.gmail?.clientSecret) {
    return false;
  }
  const tokens = readTokens();
  return tokens !== null && tokens.access_token !== undefined;
}

/**
 * Get configured email address
 */
export function getConfiguredEmail(): string | null {
  const config = readConfig();
  return config.gmail?.email || null;
}

/**
 * Create OAuth2 client with stored credentials
 */
export function createOAuth2Client(): OAuth2Client | null {
  const config = readConfig();
  if (!config.gmail?.clientId || !config.gmail?.clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    REDIRECT_URI
  );

  const tokens = readTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);

    // Set up token refresh handler
    oauth2Client.on("tokens", (newTokens) => {
      const currentTokens = readTokens();
      const merged = { ...currentTokens, ...newTokens };
      writeTokens(merged);
    });
  }

  return oauth2Client;
}

/**
 * Set up Gmail with OAuth credentials
 * This should be called during vaultrunner setup-gmail
 */
export async function setupGmail(clientId: string, clientSecret: string): Promise<{ success: boolean; email?: string; error?: string }> {
  ensureConfigDir();

  // Save client credentials
  const config = readConfig();
  config.gmail = {
    enabled: true,
    clientId,
    clientSecret,
  };
  writeConfig(config);

  // Create OAuth client
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to get refresh token
  });

  // Start local server to receive callback
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || "", `http://localhost:${REDIRECT_PORT}`);

        if (url.pathname === "/oauth/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>Authorization Failed</h1><p>${error}</p><p>You can close this window.</p></body></html>`);
            server.close();
            resolve({ success: false, error });
            return;
          }

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>No Code Received</h1><p>You can close this window.</p></body></html>`);
            server.close();
            resolve({ success: false, error: "No authorization code received" });
            return;
          }

          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);
          writeTokens(tokens);
          oauth2Client.setCredentials(tokens);

          // Get user email
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });
          const profile = await gmail.users.getProfile({ userId: "me" });
          const email = profile.data.emailAddress || "unknown";

          // Update config with email
          const updatedConfig = readConfig();
          if (updatedConfig.gmail) {
            updatedConfig.gmail.email = email;
          }
          writeConfig(updatedConfig);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body>
            <h1>VaultRunner Gmail Connected!</h1>
            <p>Successfully connected: <strong>${email}</strong></p>
            <p>You can close this window and return to the terminal.</p>
          </body></html>`);

          server.close();
          resolve({ success: true, email });
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<html><body><h1>Error</h1><p>${errorMessage}</p></body></html>`);
        server.close();
        resolve({ success: false, error: errorMessage });
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`\nOpening browser for Google authorization...`);
      console.log(`If browser doesn't open, visit: ${authUrl}\n`);
      open(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: "Authorization timed out" });
    }, 5 * 60 * 1000);
  });
}

/**
 * Disconnect Gmail (remove tokens and config)
 */
export function disconnectGmail(): void {
  deleteTokens();
  const config = readConfig();
  if (config.gmail) {
    config.gmail.enabled = false;
    delete config.gmail.email;
  }
  writeConfig(config);
}

/**
 * Get authenticated Gmail API client
 */
export function getGmailClient(): ReturnType<typeof google.gmail> | null {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return null;
  }

  const tokens = readTokens();
  if (!tokens) {
    return null;
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}
