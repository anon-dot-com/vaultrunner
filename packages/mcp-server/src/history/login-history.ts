/**
 * Login History
 * Tracks login attempts and their outcomes for learning and debugging
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Browser action step (reported by Claude)
export interface BrowserStep {
  action: "fill_field" | "click_button" | "wait" | "navigate";
  field?: string;    // For fill_field: "username", "password", "2fa_code"
  text?: string;     // For click_button: button text
  url?: string;      // For navigate: the URL
  seconds?: number;  // For wait: duration
}

// MCP tool call step (auto-logged)
export interface ToolStep {
  tool: "list_logins" | "get_credentials" | "get_totp" | "get_2fa_code";
  timestamp: string;
  params: Record<string, unknown>;
  result: "success" | "failed";
}

export interface LoginAttempt {
  id: string;
  domain: string;
  loginUrl?: string;
  startedAt: string;
  completedAt?: string;
  outcome: "success" | "failed" | "abandoned" | "in_progress";
  toolSteps: ToolStep[];
  browserSteps: BrowserStep[];
  // Metadata (no sensitive data)
  accountUsed?: string;
  twoFactorType?: "totp" | "sms" | "email" | "none";
  error?: string;
}

export interface LoginHistory {
  version: string;
  lastUpdated: string;
  attempts: LoginAttempt[];
}

export interface LoginStats {
  totalAttempts: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  byDomain: Record<string, { total: number; success: number; rate: number }>;
  twoFactorBreakdown: Record<string, number>;
}

const HISTORY_DIR = path.join(os.homedir(), ".vaultrunner");
const HISTORY_FILE = path.join(HISTORY_DIR, "login-history.json");
const MAX_HISTORY_ENTRIES = 500;

class LoginHistoryManager {
  private history: LoginHistory;
  private currentAttempt: LoginAttempt | null = null;

  constructor() {
    this.history = this.loadHistory();
  }

  private loadHistory(): LoginHistory {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const data = fs.readFileSync(HISTORY_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("Failed to load login history:", error);
    }
    return {
      version: "2.0",
      lastUpdated: new Date().toISOString(),
      attempts: [],
    };
  }

  private saveHistory(): void {
    try {
      if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
      }
      this.history.lastUpdated = new Date().toISOString();

      // Trim history if too large
      if (this.history.attempts.length > MAX_HISTORY_ENTRIES) {
        this.history.attempts = this.history.attempts.slice(-MAX_HISTORY_ENTRIES);
      }

      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error("Failed to save login history:", error);
    }
  }

  private generateId(): string {
    return `login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start a new login session
   */
  startSession(domain: string, loginUrl?: string): string {
    // If there's an existing session, abandon it
    if (this.currentAttempt) {
      this.endSession(false, undefined, "Abandoned - new session started");
    }

    const id = this.generateId();
    this.currentAttempt = {
      id,
      domain,
      loginUrl,
      startedAt: new Date().toISOString(),
      outcome: "in_progress",
      toolSteps: [],
      browserSteps: [],
    };
    return id;
  }

  /**
   * Get the current active session
   */
  getCurrentSession(): LoginAttempt | null {
    return this.currentAttempt;
  }

  /**
   * Log a tool step in the current session
   */
  logToolStep(
    tool: ToolStep["tool"],
    params: Record<string, unknown>,
    result: ToolStep["result"]
  ): void {
    if (!this.currentAttempt) {
      return; // No active session
    }

    // Sanitize params
    const sanitizedParams = this.sanitizeParams(params);

    this.currentAttempt.toolSteps.push({
      tool,
      timestamp: new Date().toISOString(),
      params: sanitizedParams,
      result,
    });

    // Extract metadata
    if (tool === "get_credentials" && params.username) {
      this.currentAttempt.accountUsed = params.username as string;
    }
    if (tool === "get_totp") {
      this.currentAttempt.twoFactorType = "totp";
    }
    if (tool === "get_2fa_code") {
      const source = params.source as string;
      if (source === "messages") {
        this.currentAttempt.twoFactorType = "sms";
      } else if (source === "gmail") {
        this.currentAttempt.twoFactorType = "email";
      }
    }
  }

  /**
   * Remove sensitive data from params
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ["password", "code", "totp", "secret", "token", "credential"];

    for (const [key, value] of Object.entries(params)) {
      const isSensitiveKey = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk));
      if (isSensitiveKey) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeParams(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * End the current session
   */
  endSession(
    success: boolean,
    browserSteps?: BrowserStep[],
    error?: string
  ): LoginAttempt | null {
    if (!this.currentAttempt) {
      return null;
    }

    this.currentAttempt.completedAt = new Date().toISOString();
    this.currentAttempt.outcome = success ? "success" : "failed";
    if (browserSteps) {
      this.currentAttempt.browserSteps = browserSteps;
    }
    if (error) {
      this.currentAttempt.error = error;
    }
    if (!this.currentAttempt.twoFactorType) {
      this.currentAttempt.twoFactorType = "none";
    }

    // Save to history
    this.history.attempts.push(this.currentAttempt);
    this.saveHistory();

    const completedAttempt = this.currentAttempt;
    this.currentAttempt = null;
    return completedAttempt;
  }

  /**
   * Get login statistics
   */
  getStats(domain?: string): LoginStats {
    let attempts = this.history.attempts.filter((a) => a.outcome !== "in_progress");

    if (domain) {
      attempts = attempts.filter((a) => a.domain === domain);
    }

    const successCount = attempts.filter((a) => a.outcome === "success").length;
    const failedCount = attempts.filter((a) => a.outcome === "failed").length;

    // Stats by domain
    const byDomain: Record<string, { total: number; success: number; rate: number }> = {};
    for (const attempt of attempts) {
      if (!byDomain[attempt.domain]) {
        byDomain[attempt.domain] = { total: 0, success: 0, rate: 0 };
      }
      byDomain[attempt.domain].total++;
      if (attempt.outcome === "success") {
        byDomain[attempt.domain].success++;
      }
    }
    for (const d of Object.keys(byDomain)) {
      byDomain[d].rate = byDomain[d].total > 0
        ? byDomain[d].success / byDomain[d].total
        : 0;
    }

    // 2FA breakdown
    const twoFactorBreakdown: Record<string, number> = {};
    for (const attempt of attempts) {
      const type = attempt.twoFactorType || "none";
      twoFactorBreakdown[type] = (twoFactorBreakdown[type] || 0) + 1;
    }

    return {
      totalAttempts: attempts.length,
      successCount,
      failedCount,
      successRate: attempts.length > 0 ? successCount / attempts.length : 0,
      byDomain,
      twoFactorBreakdown,
    };
  }

  /**
   * Get recent login attempts
   */
  getRecent(limit: number = 20, domain?: string): LoginAttempt[] {
    let attempts = [...this.history.attempts].reverse();

    if (domain) {
      attempts = attempts.filter((a) => a.domain === domain);
    }

    return attempts.slice(0, limit);
  }

  /**
   * Get full history
   */
  getHistory(): LoginHistory {
    return this.history;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = {
      version: "2.0",
      lastUpdated: new Date().toISOString(),
      attempts: [],
    };
    this.currentAttempt = null;
    this.saveHistory();
  }
}

export const loginHistory = new LoginHistoryManager();
