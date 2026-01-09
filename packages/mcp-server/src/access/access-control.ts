/**
 * Access Control
 * Main module for checking and managing credential access
 */

import { isItemAllowed, allowItem, denyItem, loadAccessConfig, saveAccessConfig } from "./config.js";
import { notifyAccessDenied, notifyAccessGranted, notifyFirstTimeAccess, type CredentialInfo } from "./prompt.js";
import { logger } from "../utils/logger.js";
import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";

export type AccessDecision = "allowed" | "denied" | "unknown";

export interface AccessCheckResult {
  decision: AccessDecision;
  reason: string;
}

/**
 * Settings for access control behavior
 */
export interface AccessSettings {
  // If true, unknown credentials are auto-approved (less secure but more convenient)
  autoApproveUnknown: boolean;
  // If true, log detailed access information
  verbose: boolean;
}

const SETTINGS_FILE = join(homedir(), ".vaultrunner", "settings.json");

const DEFAULT_SETTINGS: AccessSettings = {
  autoApproveUnknown: true, // Default to auto-approve for ease of use
  verbose: true,
};

/**
 * Load access settings
 */
export async function loadSettings(): Promise<AccessSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save access settings
 */
export async function saveSettings(settings: AccessSettings): Promise<void> {
  const dir = join(homedir(), ".vaultrunner");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Check if access is allowed for a credential
 */
export async function checkAccess(credential: CredentialInfo): Promise<AccessCheckResult> {
  const settings = await loadSettings();

  // Check explicit allow/deny list
  const isAllowed = await isItemAllowed(credential.itemId);

  if (isAllowed === true) {
    // Explicitly allowed
    notifyAccessGranted(credential, true);
    return { decision: "allowed", reason: "Credential is in allowed list" };
  }

  if (isAllowed === false) {
    // Explicitly denied
    notifyAccessDenied(credential);
    return { decision: "denied", reason: "Credential is in denied list" };
  }

  // Not in either list - handle based on settings
  if (settings.autoApproveUnknown) {
    // Auto-approve and remember
    await allowItem(credential.itemId, credential.title, credential.username, credential.vault);
    notifyAccessGranted(credential, false);
    logger.step("Auto-approved and remembered for future use");
    return { decision: "allowed", reason: "Auto-approved (autoApproveUnknown=true)" };
  } else {
    // Require explicit approval
    notifyFirstTimeAccess(credential);
    return { decision: "unknown", reason: "Credential requires explicit approval" };
  }
}

/**
 * Quick check if an item can be accessed (without logging)
 */
export async function canAccess(itemId: string): Promise<boolean> {
  const settings = await loadSettings();
  const isAllowed = await isItemAllowed(itemId);

  if (isAllowed === true) return true;
  if (isAllowed === false) return false;
  return settings.autoApproveUnknown;
}

/**
 * Approve a credential for future use
 */
export async function approveCredential(credential: CredentialInfo): Promise<void> {
  await allowItem(credential.itemId, credential.title, credential.username, credential.vault);
  logger.success(`Approved: ${credential.title} (${credential.username})`);
}

/**
 * Deny a credential for future use
 */
export async function denyCredential(credential: CredentialInfo): Promise<void> {
  await denyItem(credential.itemId, credential.title, credential.username, credential.vault);
  logger.warn(`Denied: ${credential.title} (${credential.username})`);
}

/**
 * List all access decisions
 */
export async function listAccessDecisions(): Promise<void> {
  const config = await loadAccessConfig();

  logger.divider();
  logger.info("Allowed Credentials:");
  if (config.allowed.length === 0) {
    logger.step("(none)");
  } else {
    for (const entry of config.allowed) {
      logger.credential(entry.title, entry.username, entry.vault);
    }
  }

  logger.info("");
  logger.info("Denied Credentials:");
  if (config.denied.length === 0) {
    logger.step("(none)");
  } else {
    for (const entry of config.denied) {
      logger.credential(entry.title, entry.username, entry.vault);
    }
  }
  logger.divider();
}
