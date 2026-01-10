import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface LoginStep {
  action: "fill_credentials" | "click_button" | "fill_totp" | "get_2fa_code" | "wait";
  params?: Record<string, unknown>;
  result: "success" | "partial" | "failed";
  details?: string;
  timestamp: string;
}

export interface LoginAttempt {
  id: string;
  domain: string;
  loginUrl: string;
  startedAt: string;
  completedAt?: string;
  outcome: "success" | "failed" | "abandoned" | "in_progress" | "already_logged_in" | "pending_2fa";
  steps: LoginStep[];
  finalState?: string;
  errorMessage?: string;
  // User info (no sensitive data)
  username?: string;
  itemTitle?: string; // 1Password item title
  // Derived patterns
  flowType?: "single-page" | "multi-step";
  stepCount?: number;
  twoFactorSource?: "sms" | "email" | "totp" | "none";
  twoFactorSender?: string;
}

export interface LoginHistory {
  version: string;
  lastUpdated: string;
  attempts: LoginAttempt[];
}

const HISTORY_DIR = path.join(os.homedir(), ".vaultrunner");
const HISTORY_FILE = path.join(HISTORY_DIR, "login-history.json");
const MAX_HISTORY_ENTRIES = 500;

class LoginHistoryLogger {
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
      version: "1.0",
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
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
    } catch (error) {
      console.error("Failed to save login history:", error);
    }
  }

  private generateId(): string {
    return `login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start tracking a new login attempt
   */
  startAttempt(
    domain: string,
    loginUrl: string,
    options?: { username?: string; itemTitle?: string }
  ): string {
    const id = this.generateId();
    this.currentAttempt = {
      id,
      domain,
      loginUrl,
      startedAt: new Date().toISOString(),
      outcome: "in_progress",
      steps: [],
      username: options?.username,
      itemTitle: options?.itemTitle,
    };
    return id;
  }

  /**
   * Log a step in the current login attempt
   */
  logStep(
    action: LoginStep["action"],
    result: LoginStep["result"],
    params?: Record<string, unknown>,
    details?: string
  ): void {
    if (!this.currentAttempt) {
      console.warn("No active login attempt to log step to");
      return;
    }

    // Sanitize params - remove any sensitive data
    const sanitizedParams = params ? this.sanitizeParams(params) : undefined;

    this.currentAttempt.steps.push({
      action,
      params: sanitizedParams,
      result,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove sensitive data from params before logging
   */
  private sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ["password", "code", "totp", "secret", "token", "credential"];

    for (const [key, value] of Object.entries(params)) {
      const isSenitiveKey = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk));
      if (isSenitiveKey) {
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
   * Complete the current login attempt
   */
  completeAttempt(
    outcome: "success" | "failed" | "abandoned" | "already_logged_in" | "pending_2fa",
    finalState?: string,
    errorMessage?: string
  ): LoginAttempt | null {
    if (!this.currentAttempt) {
      console.warn("No active login attempt to complete");
      return null;
    }

    this.currentAttempt.completedAt = new Date().toISOString();
    this.currentAttempt.outcome = outcome;
    this.currentAttempt.finalState = finalState;
    this.currentAttempt.errorMessage = errorMessage;

    // Derive patterns from the attempt
    this.derivePatterns(this.currentAttempt);

    // Add to history
    this.history.attempts.unshift(this.currentAttempt);

    // Trim history if too long
    if (this.history.attempts.length > MAX_HISTORY_ENTRIES) {
      this.history.attempts = this.history.attempts.slice(0, MAX_HISTORY_ENTRIES);
    }

    this.saveHistory();

    const completed = this.currentAttempt;
    this.currentAttempt = null;
    return completed;
  }

  /**
   * Derive patterns from a completed login attempt
   */
  private derivePatterns(attempt: LoginAttempt): void {
    const fillSteps = attempt.steps.filter((s) => s.action === "fill_credentials");
    const clickSteps = attempt.steps.filter((s) => s.action === "click_button");

    // Determine flow type
    if (fillSteps.length > 1 || clickSteps.some((s) => s.params?.buttonText === "Next")) {
      attempt.flowType = "multi-step";
    } else {
      attempt.flowType = "single-page";
    }

    attempt.stepCount = attempt.steps.length;

    // Determine 2FA source
    const tfaStep = attempt.steps.find((s) => s.action === "get_2fa_code");
    if (tfaStep) {
      const source = tfaStep.params?.source as string;
      attempt.twoFactorSource = source === "messages" ? "sms" : source === "gmail" ? "email" : "totp";
      attempt.twoFactorSender = tfaStep.details;
    } else {
      const totpStep = attempt.steps.find((s) => s.action === "fill_totp");
      if (totpStep) {
        attempt.twoFactorSource = "totp";
      } else {
        attempt.twoFactorSource = "none";
      }
    }
  }

  /**
   * Get the current attempt (if any)
   */
  getCurrentAttempt(): LoginAttempt | null {
    return this.currentAttempt;
  }

  /**
   * Update user info on the current attempt
   */
  setUserInfo(username?: string, itemTitle?: string): void {
    if (!this.currentAttempt) {
      console.warn("No active login attempt to update");
      return;
    }
    if (username) this.currentAttempt.username = username;
    if (itemTitle) this.currentAttempt.itemTitle = itemTitle;
  }

  /**
   * Get successful login patterns for a domain
   */
  getSuccessfulPatterns(domain: string): LoginAttempt[] {
    return this.history.attempts.filter(
      (a) => a.domain === domain && a.outcome === "success"
    );
  }

  /**
   * Get all attempts for a domain
   */
  getAttemptsForDomain(domain: string): LoginAttempt[] {
    return this.history.attempts.filter((a) => a.domain === domain);
  }

  /**
   * Get aggregated stats
   */
  getStats(): {
    totalAttempts: number;
    successRate: number;
    uniqueDomains: number;
    mostCommonFlowType: string;
  } {
    const completed = this.history.attempts.filter((a) => a.outcome !== "in_progress");
    const successful = completed.filter((a) => a.outcome === "success");
    const domains = new Set(this.history.attempts.map((a) => a.domain));
    const flowTypes = completed.map((a) => a.flowType).filter(Boolean);
    const flowCounts = flowTypes.reduce((acc, ft) => {
      acc[ft!] = (acc[ft!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAttempts: completed.length,
      successRate: completed.length > 0 ? successful.length / completed.length : 0,
      uniqueDomains: domains.size,
      mostCommonFlowType:
        Object.entries(flowCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown",
    };
  }

  /**
   * Export patterns for contribution (anonymized)
   */
  exportPatternsForContribution(): Record<string, unknown>[] {
    const successfulByDomain = new Map<string, LoginAttempt[]>();

    for (const attempt of this.history.attempts) {
      if (attempt.outcome === "success") {
        const existing = successfulByDomain.get(attempt.domain) || [];
        existing.push(attempt);
        successfulByDomain.set(attempt.domain, existing);
      }
    }

    const patterns: Record<string, unknown>[] = [];

    for (const [domain, attempts] of successfulByDomain) {
      // Only export if we have at least 2 successful attempts
      if (attempts.length < 2) continue;

      // Find the most common pattern
      const patternCounts = new Map<string, number>();
      for (const attempt of attempts) {
        const patternKey = attempt.steps
          .map((s) => `${s.action}:${s.params?.buttonText || ""}`)
          .join("|");
        patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
      }

      const mostCommonPattern = [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const representativeAttempt = attempts.find(
        (a) =>
          a.steps.map((s) => `${s.action}:${s.params?.buttonText || ""}`).join("|") ===
          mostCommonPattern[0]
      );

      if (representativeAttempt) {
        patterns.push({
          domain,
          loginUrl: representativeAttempt.loginUrl,
          flowType: representativeAttempt.flowType,
          stepCount: representativeAttempt.stepCount,
          twoFactorSource: representativeAttempt.twoFactorSource,
          twoFactorSender: representativeAttempt.twoFactorSender,
          steps: representativeAttempt.steps.map((s) => ({
            action: s.action,
            buttonText: s.params?.buttonText,
            result: s.result,
          })),
          successCount: mostCommonPattern[1],
          totalAttempts: attempts.length,
        });
      }
    }

    return patterns;
  }

  /**
   * Get full history (for debugging)
   */
  getHistory(): LoginHistory {
    return this.history;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      attempts: [],
    };
    this.saveHistory();
  }

  /**
   * Get active sessions - most recent successful login per domain
   * These represent sessions where VaultRunner assisted with login
   */
  getActiveSessions(): Array<{
    domain: string;
    loginUrl: string;
    loggedInAt: string;
    assistedBy: string[];
    twoFactorUsed: boolean;
    attemptId: string;
  }> {
    const sessionsByDomain = new Map<string, LoginAttempt>();

    // Get most recent successful login for each domain
    for (const attempt of this.history.attempts) {
      if (attempt.outcome === "success" && !sessionsByDomain.has(attempt.domain)) {
        sessionsByDomain.set(attempt.domain, attempt);
      }
    }

    return Array.from(sessionsByDomain.values()).map((attempt) => {
      // Determine what VaultRunner helped with
      const assistedBy: string[] = [];
      for (const step of attempt.steps) {
        if (step.result === "success" || step.result === "partial") {
          if (step.action === "fill_credentials") {
            if (step.details?.includes("username")) assistedBy.push("Username");
            if (step.details?.includes("password")) assistedBy.push("Password");
            if (!step.details || step.details === "none") {
              // Check filledFields from the step
              assistedBy.push("Credentials");
            }
          } else if (step.action === "fill_totp" || step.action === "get_2fa_code") {
            assistedBy.push("2FA Code");
          } else if (step.action === "click_button") {
            assistedBy.push("Navigation");
          }
        }
      }

      return {
        domain: attempt.domain,
        loginUrl: attempt.loginUrl,
        loggedInAt: attempt.completedAt || attempt.startedAt,
        assistedBy: [...new Set(assistedBy)], // Remove duplicates
        twoFactorUsed: attempt.twoFactorSource !== "none" && attempt.twoFactorSource !== undefined,
        attemptId: attempt.id,
      };
    });
  }
}

export const loginHistory = new LoginHistoryLogger();
