/**
 * Account Preferences
 * Stores user preferences for default accounts per domain
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PREFERENCES_DIR = path.join(os.homedir(), ".vaultrunner");
const PREFERENCES_FILE = path.join(PREFERENCES_DIR, "account-preferences.json");

export interface AccountPreference {
  domain: string;
  itemId: string;
  username: string;
  title: string;
  savedAt: string;
}

export interface AccountPreferences {
  version: string;
  lastUpdated: string;
  defaults: Record<string, AccountPreference>; // keyed by domain
}

class AccountPreferencesManager {
  private preferences: AccountPreferences;

  constructor() {
    this.preferences = this.loadPreferences();
  }

  private loadPreferences(): AccountPreferences {
    try {
      if (fs.existsSync(PREFERENCES_FILE)) {
        const data = fs.readFileSync(PREFERENCES_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load account preferences:", error);
    }
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      defaults: {},
    };
  }

  private savePreferences(): void {
    try {
      if (!fs.existsSync(PREFERENCES_DIR)) {
        fs.mkdirSync(PREFERENCES_DIR, { recursive: true });
      }
      this.preferences.lastUpdated = new Date().toISOString();
      fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(this.preferences, null, 2));
    } catch (error) {
      console.error("Failed to save account preferences:", error);
    }
  }

  /**
   * Get the default account preference for a domain
   */
  getDefaultForDomain(domain: string): AccountPreference | null {
    return this.preferences.defaults[domain] || null;
  }

  /**
   * Set the default account for a domain
   */
  setDefaultForDomain(
    domain: string,
    itemId: string,
    username: string,
    title: string
  ): void {
    this.preferences.defaults[domain] = {
      domain,
      itemId,
      username,
      title,
      savedAt: new Date().toISOString(),
    };
    this.savePreferences();
  }

  /**
   * Remove the default for a domain
   */
  removeDefaultForDomain(domain: string): boolean {
    if (this.preferences.defaults[domain]) {
      delete this.preferences.defaults[domain];
      this.savePreferences();
      return true;
    }
    return false;
  }

  /**
   * Get all preferences
   */
  getAllPreferences(): AccountPreferences {
    return this.preferences;
  }

  /**
   * Check if a specific item is the default for its domain
   */
  isDefaultAccount(domain: string, itemId: string): boolean {
    const pref = this.preferences.defaults[domain];
    return pref?.itemId === itemId;
  }
}

export const accountPreferences = new AccountPreferencesManager();
