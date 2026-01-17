/**
 * Rules Store
 * Manages global and domain-specific rules for login automation
 *
 * Rules are learned from login experiences and user feedback to improve
 * automation accuracy over time.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export type RuleTrigger =
  | "before_fill_field"      // Before filling any input field
  | "after_click_field"      // After clicking on a field (before typing)
  | "before_click_button"    // Before clicking any button
  | "before_login"           // At the start of login flow
  | "after_login"            // After login completes
  | "on_2fa_prompt"          // When 2FA is detected
  | "on_error"               // When an error occurs
  | "always";                // Always apply

export type RuleAction =
  | "press_escape"           // Press Escape key
  | "wait"                   // Wait for specified duration
  | "click_elsewhere"        // Click outside the element first
  | "use_password_login"     // Prefer password over magic link
  | "use_sms_2fa"            // Prefer SMS for 2FA
  | "use_totp_2fa"           // Prefer TOTP for 2FA
  | "dismiss_popup"          // Try to dismiss any popup
  | "navigate_to_url"        // Navigate to a specific URL
  | "custom";                // Custom instruction for Claude

export interface Rule {
  id: string;
  scope: "global" | "domain";
  domain?: string;           // Required if scope is "domain"
  trigger: RuleTrigger;
  action: RuleAction;
  actionParams?: {
    duration?: number;       // For "wait" action (ms)
    url?: string;            // For "navigate_to_url" action
    instruction?: string;    // For "custom" action
    fieldType?: string;      // Specific field to apply to (e.g., "password")
  };
  reason: string;            // Why this rule exists
  learnedFrom?: {
    loginAttemptId?: string;
    date: string;
    context?: string;        // What happened that led to this rule
  };
  enabled: boolean;
  priority: number;          // Higher = applied first (default 50)
  successCount: number;      // Times this rule helped
  failureCount: number;      // Times this rule didn't help
  createdAt: string;
  updatedAt: string;
}

export interface DomainInsights {
  domain: string;
  loginUrl?: string;
  notes: string[];           // Human-readable insights
  quirks: string[];          // Known issues/workarounds
  lastUpdated: string;
}

export interface RulesStore {
  version: string;
  lastUpdated: string;
  globalRules: Rule[];
  domainRules: Record<string, Rule[]>;  // Keyed by domain
  domainInsights: Record<string, DomainInsights>;
}

const STORE_DIR = path.join(os.homedir(), ".vaultrunner");
const STORE_FILE = path.join(STORE_DIR, "rules.json");

// Default global rules based on common issues
const DEFAULT_GLOBAL_RULES: Omit<Rule, "id" | "createdAt" | "updatedAt">[] = [
  {
    scope: "global",
    trigger: "before_fill_field",
    action: "wait",
    actionParams: { duration: 300 },
    reason: "Brief pause to let page JS settle before typing",
    enabled: true,
    priority: 90,
    successCount: 0,
    failureCount: 0,
  },
];

class RulesStoreManager {
  private store: RulesStore;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): RulesStore {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data = fs.readFileSync(STORE_FILE, "utf-8");
        const store = JSON.parse(data) as RulesStore;
        // Ensure default rules exist
        const hadDefaults = this.ensureDefaultRules(store);
        if (hadDefaults) {
          // Save if we added default rules
          this.saveStoreSync(store);
        }
        return store;
      }
    } catch (error) {
      console.error("Failed to load rules store:", error);
    }

    // Create new store with default rules
    const newStore: RulesStore = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      globalRules: [],
      domainRules: {},
      domainInsights: {},
    };
    this.ensureDefaultRules(newStore);
    // Save immediately so the file exists
    this.saveStoreSync(newStore);
    return newStore;
  }

  private saveStoreSync(store: RulesStore): void {
    try {
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }
      store.lastUpdated = new Date().toISOString();
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
    } catch (error) {
      console.error("Failed to save rules store:", error);
    }
  }

  private ensureDefaultRules(store: RulesStore): boolean {
    let addedRules = false;
    for (const defaultRule of DEFAULT_GLOBAL_RULES) {
      const exists = store.globalRules.some(
        r => r.trigger === defaultRule.trigger &&
             r.action === defaultRule.action &&
             r.reason === defaultRule.reason
      );
      if (!exists) {
        const rule: Rule = {
          ...defaultRule,
          id: this.generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.globalRules.push(rule);
        addedRules = true;
      }
    }
    return addedRules;
  }

  private saveStore(): void {
    try {
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true });
      }
      this.store.lastUpdated = new Date().toISOString();
      fs.writeFileSync(STORE_FILE, JSON.stringify(this.store, null, 2));
    } catch (error) {
      console.error("Failed to save rules store:", error);
    }
  }

  private generateId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a new rule
   */
  addRule(rule: Omit<Rule, "id" | "createdAt" | "updatedAt" | "successCount" | "failureCount">): Rule {
    const newRule: Rule = {
      ...rule,
      id: this.generateId(),
      successCount: 0,
      failureCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (rule.scope === "global") {
      this.store.globalRules.push(newRule);
    } else if (rule.scope === "domain" && rule.domain) {
      if (!this.store.domainRules[rule.domain]) {
        this.store.domainRules[rule.domain] = [];
      }
      this.store.domainRules[rule.domain].push(newRule);
    }

    this.saveStore();
    return newRule;
  }

  /**
   * Get all applicable rules for a domain (global + domain-specific)
   */
  getRulesForDomain(domain: string): Rule[] {
    const globalRules = this.store.globalRules.filter(r => r.enabled);
    const domainRules = (this.store.domainRules[domain] || []).filter(r => r.enabled);

    // Combine and sort by priority (higher first)
    return [...globalRules, ...domainRules].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get rules filtered by trigger
   */
  getRulesForTrigger(domain: string, trigger: RuleTrigger): Rule[] {
    return this.getRulesForDomain(domain).filter(
      r => r.trigger === trigger || r.trigger === "always"
    );
  }

  /**
   * Get all global rules
   */
  getGlobalRules(): Rule[] {
    return this.store.globalRules;
  }

  /**
   * Get domain-specific rules
   */
  getDomainRules(domain: string): Rule[] {
    return this.store.domainRules[domain] || [];
  }

  /**
   * Update a rule
   */
  updateRule(ruleId: string, updates: Partial<Rule>): Rule | null {
    // Search in global rules
    let ruleIndex = this.store.globalRules.findIndex(r => r.id === ruleId);
    if (ruleIndex !== -1) {
      this.store.globalRules[ruleIndex] = {
        ...this.store.globalRules[ruleIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.saveStore();
      return this.store.globalRules[ruleIndex];
    }

    // Search in domain rules
    for (const domain of Object.keys(this.store.domainRules)) {
      ruleIndex = this.store.domainRules[domain].findIndex(r => r.id === ruleId);
      if (ruleIndex !== -1) {
        this.store.domainRules[domain][ruleIndex] = {
          ...this.store.domainRules[domain][ruleIndex],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        this.saveStore();
        return this.store.domainRules[domain][ruleIndex];
      }
    }

    return null;
  }

  /**
   * Record rule success (helped with login)
   */
  recordRuleSuccess(ruleId: string): void {
    this.updateRule(ruleId, {
      successCount: (this.getRule(ruleId)?.successCount || 0) + 1
    });
  }

  /**
   * Record rule failure (didn't help or caused issues)
   */
  recordRuleFailure(ruleId: string): void {
    this.updateRule(ruleId, {
      failureCount: (this.getRule(ruleId)?.failureCount || 0) + 1
    });
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): Rule | null {
    // Search global rules
    let rule = this.store.globalRules.find(r => r.id === ruleId);
    if (rule) return rule;

    // Search domain rules
    for (const domain of Object.keys(this.store.domainRules)) {
      rule = this.store.domainRules[domain].find(r => r.id === ruleId);
      if (rule) return rule;
    }

    return null;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    // Search in global rules
    const globalIndex = this.store.globalRules.findIndex(r => r.id === ruleId);
    if (globalIndex !== -1) {
      this.store.globalRules.splice(globalIndex, 1);
      this.saveStore();
      return true;
    }

    // Search in domain rules
    for (const domain of Object.keys(this.store.domainRules)) {
      const domainIndex = this.store.domainRules[domain].findIndex(r => r.id === ruleId);
      if (domainIndex !== -1) {
        this.store.domainRules[domain].splice(domainIndex, 1);
        this.saveStore();
        return true;
      }
    }

    return false;
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const result = this.updateRule(ruleId, { enabled });
    return result !== null;
  }

  /**
   * Add domain insights (learned context about a site)
   */
  addDomainInsight(domain: string, insight: string, isQuirk: boolean = false): void {
    if (!this.store.domainInsights[domain]) {
      this.store.domainInsights[domain] = {
        domain,
        notes: [],
        quirks: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    const insights = this.store.domainInsights[domain];
    const list = isQuirk ? insights.quirks : insights.notes;

    // Don't add duplicates
    if (!list.includes(insight)) {
      list.push(insight);
      insights.lastUpdated = new Date().toISOString();
      this.saveStore();
    }
  }

  /**
   * Set the login URL for a domain
   */
  setDomainLoginUrl(domain: string, loginUrl: string): void {
    if (!this.store.domainInsights[domain]) {
      this.store.domainInsights[domain] = {
        domain,
        loginUrl,
        notes: [],
        quirks: [],
        lastUpdated: new Date().toISOString(),
      };
    } else {
      this.store.domainInsights[domain].loginUrl = loginUrl;
      this.store.domainInsights[domain].lastUpdated = new Date().toISOString();
    }
    this.saveStore();
  }

  /**
   * Get domain insights
   */
  getDomainInsights(domain: string): DomainInsights | null {
    return this.store.domainInsights[domain] || null;
  }

  /**
   * Get all domain insights
   */
  getAllDomainInsights(): DomainInsights[] {
    return Object.values(this.store.domainInsights);
  }

  /**
   * Get a summary of all rules for display
   */
  getRulesSummary(): {
    globalCount: number;
    domainCount: number;
    domains: string[];
    totalSuccesses: number;
    totalFailures: number;
  } {
    const globalCount = this.store.globalRules.length;
    const domains = Object.keys(this.store.domainRules);
    const domainCount = domains.reduce(
      (sum, d) => sum + this.store.domainRules[d].length,
      0
    );

    let totalSuccesses = 0;
    let totalFailures = 0;

    for (const rule of this.store.globalRules) {
      totalSuccesses += rule.successCount;
      totalFailures += rule.failureCount;
    }
    for (const domain of domains) {
      for (const rule of this.store.domainRules[domain]) {
        totalSuccesses += rule.successCount;
        totalFailures += rule.failureCount;
      }
    }

    return {
      globalCount,
      domainCount,
      domains,
      totalSuccesses,
      totalFailures,
    };
  }

  /**
   * Clear all rules (reset to defaults)
   */
  clearAllRules(): void {
    this.store = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      globalRules: [],
      domainRules: {},
      domainInsights: {},
    };
    this.ensureDefaultRules(this.store);
    this.saveStore();
  }

  /**
   * Export rules as JSON (for sharing/backup)
   */
  exportRules(): string {
    return JSON.stringify(this.store, null, 2);
  }

  /**
   * Import rules from JSON
   */
  importRules(json: string, merge: boolean = true): void {
    const imported = JSON.parse(json) as RulesStore;

    if (merge) {
      // Merge with existing rules
      for (const rule of imported.globalRules) {
        if (!this.store.globalRules.some(r => r.id === rule.id)) {
          this.store.globalRules.push(rule);
        }
      }
      for (const domain of Object.keys(imported.domainRules)) {
        if (!this.store.domainRules[domain]) {
          this.store.domainRules[domain] = [];
        }
        for (const rule of imported.domainRules[domain]) {
          if (!this.store.domainRules[domain].some(r => r.id === rule.id)) {
            this.store.domainRules[domain].push(rule);
          }
        }
      }
      for (const domain of Object.keys(imported.domainInsights)) {
        if (!this.store.domainInsights[domain]) {
          this.store.domainInsights[domain] = imported.domainInsights[domain];
        }
      }
    } else {
      // Replace entirely
      this.store = imported;
    }

    this.saveStore();
  }
}

export const rulesStore = new RulesStoreManager();
