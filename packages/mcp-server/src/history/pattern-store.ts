/**
 * Pattern Store
 * Stores and retrieves learned login patterns per domain
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { BrowserStep, LoginAttempt } from "./login-history.js";

export interface LoginPattern {
  domain: string;
  loginUrl?: string;
  lastUpdated: string;
  successCount: number;
  failureCount: number;
  browserSteps: BrowserStep[];
  twoFactorType?: "totp" | "sms" | "email" | "none";
  notes?: string;
}

export interface PatternStore {
  version: string;
  lastUpdated: string;
  patterns: Record<string, LoginPattern>; // keyed by domain
}

const STORE_DIR = path.join(os.homedir(), ".vaultrunner");
const STORE_FILE = path.join(STORE_DIR, "login-patterns.json");

class PatternStoreManager {
  private store: PatternStore;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): PatternStore {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data = fs.readFileSync(STORE_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load pattern store:", error);
    }
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      patterns: {},
    };
  }

  private saveStore(): void {
    try {
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }
      this.store.lastUpdated = new Date().toISOString();
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.store, null, 2));
    } catch (error) {
      console.error("Failed to save pattern store:", error);
    }
  }

  /**
   * Get the stored pattern for a domain
   */
  getPattern(domain: string): LoginPattern | null {
    return this.store.patterns[domain] || null;
  }

  /**
   * Save or update a pattern from a successful login attempt
   */
  savePattern(attempt: LoginAttempt): void {
    if (attempt.outcome !== "success" || attempt.browserSteps.length === 0) {
      // Only save successful attempts with browser steps
      // But still track failures
      if (this.store.patterns[attempt.domain] && attempt.outcome === "failed") {
        this.store.patterns[attempt.domain].failureCount++;
        this.saveStore();
      }
      return;
    }

    const existing = this.store.patterns[attempt.domain];

    if (existing) {
      // Update existing pattern
      existing.lastUpdated = new Date().toISOString();
      existing.successCount++;
      existing.browserSteps = attempt.browserSteps;
      existing.loginUrl = attempt.loginUrl || existing.loginUrl;
      existing.twoFactorType = attempt.twoFactorType || existing.twoFactorType;
    } else {
      // Create new pattern
      this.store.patterns[attempt.domain] = {
        domain: attempt.domain,
        loginUrl: attempt.loginUrl,
        lastUpdated: new Date().toISOString(),
        successCount: 1,
        failureCount: 0,
        browserSteps: attempt.browserSteps,
        twoFactorType: attempt.twoFactorType,
      };
    }

    this.saveStore();
  }

  /**
   * Get pattern info for display
   */
  getPatternInfo(domain: string): {
    found: boolean;
    domain: string;
    successCount: number;
    failureCount: number;
    successRate: number;
    pattern?: {
      browserSteps: BrowserStep[];
      twoFactorType?: string;
      loginUrl?: string;
      lastUpdated: string;
    };
    hint?: string;
  } {
    const pattern = this.store.patterns[domain];

    if (!pattern) {
      return {
        found: false,
        domain,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
      };
    }

    const total = pattern.successCount + pattern.failureCount;
    const successRate = total > 0 ? pattern.successCount / total : 0;

    // Generate a hint based on the pattern
    let hint: string | undefined;
    const hasMultiStep = pattern.browserSteps.some(
      (s) => s.action === "click_button" && s.text?.toLowerCase().includes("next")
    );
    if (hasMultiStep) {
      hint = "Multi-step flow: username first, then password on next page";
    } else if (pattern.twoFactorType && pattern.twoFactorType !== "none") {
      hint = `Uses ${pattern.twoFactorType.toUpperCase()} 2FA`;
    }

    return {
      found: true,
      domain,
      successCount: pattern.successCount,
      failureCount: pattern.failureCount,
      successRate,
      pattern: {
        browserSteps: pattern.browserSteps,
        twoFactorType: pattern.twoFactorType,
        loginUrl: pattern.loginUrl,
        lastUpdated: pattern.lastUpdated,
      },
      hint,
    };
  }

  /**
   * Get all stored patterns
   */
  getAllPatterns(): LoginPattern[] {
    return Object.values(this.store.patterns);
  }

  /**
   * Clear all patterns
   */
  clearPatterns(): void {
    this.store = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      patterns: {},
    };
    this.saveStore();
  }

  /**
   * Delete pattern for a specific domain
   */
  deletePattern(domain: string): boolean {
    if (this.store.patterns[domain]) {
      delete this.store.patterns[domain];
      this.saveStore();
      return true;
    }
    return false;
  }
}

export const patternStore = new PatternStoreManager();
