/**
 * Access Control Configuration
 * Manages ~/.vaultrunner/access.json for storing allowed/denied credentials
 */

import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { logger } from "../utils/logger.js";

export interface AccessEntry {
  item_id: string;
  title: string;
  username: string;
  vault: string;
  timestamp: string;
}

export interface AccessConfig {
  allowed: AccessEntry[];
  denied: AccessEntry[];
}

const CONFIG_DIR = join(homedir(), ".vaultrunner");
const CONFIG_FILE = join(CONFIG_DIR, "access.json");

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists, that's fine
  }
}

/**
 * Load the access configuration from disk
 */
export async function loadAccessConfig(): Promise<AccessConfig> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data) as AccessConfig;
  } catch (error) {
    // File doesn't exist or is invalid, return default
    return { allowed: [], denied: [] };
  }
}

/**
 * Save the access configuration to disk
 */
export async function saveAccessConfig(config: AccessConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Check if an item is allowed
 */
export async function isItemAllowed(itemId: string): Promise<boolean | null> {
  const config = await loadAccessConfig();

  // Check if explicitly allowed
  if (config.allowed.some((entry) => entry.item_id === itemId)) {
    return true;
  }

  // Check if explicitly denied
  if (config.denied.some((entry) => entry.item_id === itemId)) {
    return false;
  }

  // Not in either list
  return null;
}

/**
 * Add an item to the allowed list
 */
export async function allowItem(
  itemId: string,
  title: string,
  username: string,
  vault: string
): Promise<void> {
  const config = await loadAccessConfig();

  // Remove from denied if present
  config.denied = config.denied.filter((entry) => entry.item_id !== itemId);

  // Add to allowed if not already there
  if (!config.allowed.some((entry) => entry.item_id === itemId)) {
    config.allowed.push({
      item_id: itemId,
      title,
      username,
      vault,
      timestamp: new Date().toISOString(),
    });
    logger.step(`Added "${title}" to allowed list`);
  }

  await saveAccessConfig(config);
}

/**
 * Add an item to the denied list
 */
export async function denyItem(
  itemId: string,
  title: string,
  username: string,
  vault: string
): Promise<void> {
  const config = await loadAccessConfig();

  // Remove from allowed if present
  config.allowed = config.allowed.filter((entry) => entry.item_id !== itemId);

  // Add to denied if not already there
  if (!config.denied.some((entry) => entry.item_id === itemId)) {
    config.denied.push({
      item_id: itemId,
      title,
      username,
      vault,
      timestamp: new Date().toISOString(),
    });
    logger.step(`Added "${title}" to denied list`);
  }

  await saveAccessConfig(config);
}

/**
 * Remove an item from both lists (reset its status)
 */
export async function resetItem(itemId: string): Promise<void> {
  const config = await loadAccessConfig();
  config.allowed = config.allowed.filter((entry) => entry.item_id !== itemId);
  config.denied = config.denied.filter((entry) => entry.item_id !== itemId);
  await saveAccessConfig(config);
}

/**
 * Get all allowed items
 */
export async function getAllowedItems(): Promise<AccessEntry[]> {
  const config = await loadAccessConfig();
  return config.allowed;
}

/**
 * Get all denied items
 */
export async function getDeniedItems(): Promise<AccessEntry[]> {
  const config = await loadAccessConfig();
  return config.denied;
}
