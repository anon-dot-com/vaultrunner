/**
 * VaultRunner Dashboard Server
 * Web dashboard for viewing login history and patterns
 */

import express, { Request, Response } from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// File paths for direct reading (to get fresh data on each request)
const VAULTRUNNER_DIR = path.join(os.homedir(), ".vaultrunner");
const HISTORY_FILE = path.join(VAULTRUNNER_DIR, "login-history.json");
const PATTERNS_FILE = path.join(VAULTRUNNER_DIR, "login-patterns.json");
const RULES_FILE = path.join(VAULTRUNNER_DIR, "rules.json");

interface BrowserStep {
  action: "fill_field" | "click_button" | "wait" | "navigate";
  field?: string;
  text?: string;
  url?: string;
  seconds?: number;
}

interface ToolStep {
  tool: string;
  timestamp: string;
  params: Record<string, unknown>;
  result: "success" | "failed";
}

type DataQuality = "gold" | "silver" | "bronze";

interface LoginAttempt {
  id: string;
  domain: string;
  loginUrl?: string;
  startedAt: string;
  completedAt?: string;
  outcome: "success" | "failed" | "abandoned" | "in_progress";
  toolSteps: ToolStep[];
  browserSteps: BrowserStep[];
  accountUsed?: string;
  twoFactorType?: "totp" | "sms" | "email" | "none";
  error?: string;
  dataQuality?: DataQuality;
  autoStarted?: boolean;
}

interface LoginHistory {
  version: string;
  lastUpdated: string;
  attempts: LoginAttempt[];
}

interface LoginPattern {
  domain: string;
  loginUrl?: string;
  lastUpdated: string;
  successCount: number;
  failureCount: number;
  browserSteps: BrowserStep[];
  twoFactorType?: string;
  notes?: string;
}

interface PatternStore {
  version: string;
  lastUpdated: string;
  patterns: Record<string, LoginPattern>;
}

type RuleTrigger =
  | "before_fill_field"
  | "after_click_field"
  | "before_click_button"
  | "before_login"
  | "after_login"
  | "on_2fa_prompt"
  | "on_error"
  | "always";

type RuleAction =
  | "press_escape"
  | "wait"
  | "click_elsewhere"
  | "use_password_login"
  | "use_sms_2fa"
  | "use_totp_2fa"
  | "dismiss_popup"
  | "navigate_to_url"
  | "custom";

interface Rule {
  id: string;
  scope: "global" | "domain";
  domain?: string;
  trigger: RuleTrigger;
  action: RuleAction;
  actionParams?: {
    duration?: number;
    url?: string;
    instruction?: string;
    fieldType?: string;
  };
  reason: string;
  priority: number;
  enabled: boolean;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  learnedFrom?: {
    date: string;
    context: string;
  };
}

interface DomainInsight {
  domain: string;
  loginUrl?: string;
  notes: string[];
  quirks: string[];
  lastUpdated: string;
}

interface RulesStore {
  version: string;
  lastUpdated: string;
  // New format (from rules-store.ts)
  globalRules?: Rule[];
  domainRules?: Record<string, Rule[]>;
  domainInsights?: Record<string, DomainInsight>;
  // Old format (for backwards compatibility)
  rules?: Rule[];
}

/**
 * Read login history directly from disk (fresh data on each request)
 */
function readHistoryFromDisk(): LoginHistory {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to read login history:", error);
  }
  return {
    version: "2.0",
    lastUpdated: new Date().toISOString(),
    attempts: [],
  };
}

/**
 * Read patterns directly from disk (fresh data on each request)
 */
function readPatternsFromDisk(): PatternStore {
  try {
    if (fs.existsSync(PATTERNS_FILE)) {
      const data = fs.readFileSync(PATTERNS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to read patterns:", error);
  }
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    patterns: {},
  };
}

/**
 * Read rules directly from disk (fresh data on each request)
 */
function readRulesFromDisk(): RulesStore {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const data = fs.readFileSync(RULES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to read rules:", error);
  }
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    globalRules: [],
    domainRules: {},
    domainInsights: {},
  };
}

/**
 * Calculate stats from history
 */
function calculateStats(history: LoginHistory) {
  const completed = history.attempts.filter((a) => a.outcome !== "in_progress");
  const successful = completed.filter((a) => a.outcome === "success");
  const failed = completed.filter((a) => a.outcome === "failed");
  const abandoned = completed.filter((a) => a.outcome === "abandoned");
  const domains = new Set(history.attempts.map((a) => a.domain));

  // 2FA breakdown
  const twoFactorCounts: Record<string, number> = {};
  for (const attempt of completed) {
    const type = attempt.twoFactorType || "none";
    twoFactorCounts[type] = (twoFactorCounts[type] || 0) + 1;
  }

  // Data quality breakdown
  const dataQualityCounts: Record<DataQuality, number> = {
    gold: 0,
    silver: 0,
    bronze: 0,
  };
  for (const attempt of completed) {
    const quality = attempt.dataQuality || "bronze"; // Default old records to bronze
    dataQualityCounts[quality]++;
  }

  // Per-domain stats
  const byDomain: Record<string, { total: number; success: number; rate: number }> = {};
  for (const attempt of completed) {
    if (!byDomain[attempt.domain]) {
      byDomain[attempt.domain] = { total: 0, success: 0, rate: 0 };
    }
    byDomain[attempt.domain].total++;
    if (attempt.outcome === "success") {
      byDomain[attempt.domain].success++;
    }
  }
  for (const d of Object.keys(byDomain)) {
    byDomain[d].rate = byDomain[d].total > 0 ? byDomain[d].success / byDomain[d].total : 0;
  }

  return {
    totalAttempts: completed.length,
    successCount: successful.length,
    failedCount: failed.length,
    abandonedCount: abandoned.length,
    successRate: completed.length > 0 ? successful.length / completed.length : 0,
    uniqueDomains: domains.size,
    twoFactorBreakdown: twoFactorCounts,
    dataQualityBreakdown: dataQualityCounts,
    byDomain,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_PORT = 19877;

export function startDashboard(port: number = DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = express();

    // Serve static files
    app.use(express.static(join(__dirname, "public")));
    app.use(express.json());

    // API: Get overall stats
    app.get("/api/stats", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const patterns = readPatternsFromDisk();
      const stats = calculateStats(history);
      const patternCount = Object.keys(patterns.patterns).length;

      res.json({
        attempts: {
          total: stats.totalAttempts,
          success: stats.successCount,
          failed: stats.failedCount,
          abandoned: stats.abandonedCount,
          successRate: stats.successRate,
          uniqueSites: stats.uniqueDomains,
        },
        patterns: {
          total: patternCount,
        },
        twoFactor: stats.twoFactorBreakdown,
        dataQuality: stats.dataQualityBreakdown,
        byDomain: stats.byDomain,
      });
    });

    // API: Get login history
    app.get("/api/history", (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const domain = req.query.domain as string;

      const history = readHistoryFromDisk();
      let attempts = [...history.attempts].reverse(); // Most recent first

      if (domain) {
        attempts = attempts.filter((a) => a.domain.includes(domain));
      }

      res.json({
        attempts: attempts.slice(0, limit).map((a) => ({
          id: a.id,
          domain: a.domain,
          loginUrl: a.loginUrl,
          outcome: a.outcome,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          toolStepCount: a.toolSteps?.length || 0,
          browserStepCount: a.browserSteps?.length || 0,
          twoFactorType: a.twoFactorType,
          accountUsed: a.accountUsed,
          error: a.error,
          dataQuality: a.dataQuality || "bronze",
          autoStarted: a.autoStarted || false,
        })),
        total: attempts.length,
      });
    });

    // API: Get single attempt details
    app.get("/api/history/:id", (req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const attempt = history.attempts.find((a) => a.id === req.params.id);

      if (!attempt) {
        res.status(404).json({ error: "Attempt not found" });
        return;
      }

      res.json(attempt);
    });

    // API: Get all patterns
    app.get("/api/patterns", (_req: Request, res: Response) => {
      const patterns = readPatternsFromDisk();

      const patternList = Object.entries(patterns.patterns).map(([domain, p]) => ({
        domain,
        loginUrl: p.loginUrl,
        successCount: p.successCount,
        failureCount: p.failureCount,
        successRate: (p.successCount + p.failureCount) > 0
          ? p.successCount / (p.successCount + p.failureCount)
          : 0,
        twoFactorType: p.twoFactorType,
        browserStepCount: p.browserSteps?.length || 0,
        browserSteps: p.browserSteps || [],
        lastUpdated: p.lastUpdated,
      }));

      res.json({
        patterns: patternList,
        total: patternList.length,
      });
    });

    // API: Get single pattern details
    app.get("/api/patterns/:domain", (req: Request, res: Response) => {
      const patterns = readPatternsFromDisk();
      const pattern = patterns.patterns[req.params.domain];

      if (!pattern) {
        res.status(404).json({ error: "Pattern not found" });
        return;
      }

      res.json(pattern);
    });

    // API: Clear history
    app.post("/api/history/clear", (_req: Request, res: Response) => {
      const emptyHistory: LoginHistory = {
        version: "2.0",
        lastUpdated: new Date().toISOString(),
        attempts: [],
      };
      try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(emptyHistory, null, 2));
        res.json({ success: true, message: "History cleared" });
      } catch (error) {
        res.status(500).json({ success: false, error: "Failed to clear history" });
      }
    });

    // API: Clear patterns
    app.post("/api/patterns/clear", (_req: Request, res: Response) => {
      const emptyPatterns: PatternStore = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        patterns: {},
      };
      try {
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify(emptyPatterns, null, 2));
        res.json({ success: true, message: "Patterns cleared" });
      } catch (error) {
        res.status(500).json({ success: false, error: "Failed to clear patterns" });
      }
    });

    // API: Get all rules and insights
    app.get("/api/rules", (_req: Request, res: Response) => {
      const rulesData = readRulesFromDisk();

      // Handle both new format (globalRules/domainRules) and old format (rules array)
      let globalRules: Rule[] = [];
      let rulesByDomain: Record<string, Rule[]> = {};

      if (rulesData.globalRules) {
        // New format from rules-store.ts
        globalRules = rulesData.globalRules;
        rulesByDomain = rulesData.domainRules || {};
      } else if (rulesData.rules) {
        // Old flat format
        globalRules = rulesData.rules.filter((r) => r.scope === "global");
        const domainRulesList = rulesData.rules.filter((r) => r.scope === "domain");
        for (const rule of domainRulesList) {
          const domain = rule.domain || "unknown";
          if (!rulesByDomain[domain]) {
            rulesByDomain[domain] = [];
          }
          rulesByDomain[domain].push(rule);
        }
      }

      // Handle domainInsights - could be Record or Array
      let insightsList: DomainInsight[] = [];
      if (rulesData.domainInsights) {
        if (Array.isArray(rulesData.domainInsights)) {
          insightsList = rulesData.domainInsights;
        } else {
          // Convert Record to Array
          insightsList = Object.values(rulesData.domainInsights);
        }
      }

      const domainRulesCount = Object.values(rulesByDomain).reduce(
        (sum, rules) => sum + rules.length,
        0
      );

      res.json({
        globalRules: globalRules.map((r) => ({
          id: r.id,
          trigger: r.trigger,
          action: r.action,
          actionParams: r.actionParams,
          reason: r.reason,
          priority: r.priority,
          enabled: r.enabled,
          successCount: r.successCount,
          failureCount: r.failureCount,
          createdAt: r.createdAt,
        })),
        domainRules: rulesByDomain,
        domainInsights: insightsList,
        summary: {
          totalRules: globalRules.length + domainRulesCount,
          globalCount: globalRules.length,
          domainCount: domainRulesCount,
          insightsCount: insightsList.length,
        },
      });
    });

    // API: Toggle rule enabled status
    app.post("/api/rules/:id/toggle", (req: Request, res: Response) => {
      const rulesData = readRulesFromDisk();
      const ruleId = req.params.id;
      let found = false;
      let newEnabled = false;

      // Search in globalRules
      if (rulesData.globalRules) {
        const idx = rulesData.globalRules.findIndex((r) => r.id === ruleId);
        if (idx !== -1) {
          rulesData.globalRules[idx].enabled = !rulesData.globalRules[idx].enabled;
          rulesData.globalRules[idx].updatedAt = new Date().toISOString();
          newEnabled = rulesData.globalRules[idx].enabled;
          found = true;
        }
      }

      // Search in domainRules
      if (!found && rulesData.domainRules) {
        for (const domain of Object.keys(rulesData.domainRules)) {
          const idx = rulesData.domainRules[domain].findIndex((r) => r.id === ruleId);
          if (idx !== -1) {
            rulesData.domainRules[domain][idx].enabled = !rulesData.domainRules[domain][idx].enabled;
            rulesData.domainRules[domain][idx].updatedAt = new Date().toISOString();
            newEnabled = rulesData.domainRules[domain][idx].enabled;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        res.status(404).json({ success: false, error: "Rule not found" });
        return;
      }

      rulesData.lastUpdated = new Date().toISOString();

      try {
        fs.writeFileSync(RULES_FILE, JSON.stringify(rulesData, null, 2));
        res.json({
          success: true,
          enabled: newEnabled,
          message: `Rule ${newEnabled ? "enabled" : "disabled"}`,
        });
      } catch (error) {
        res.status(500).json({ success: false, error: "Failed to toggle rule" });
      }
    });

    // API: Delete a rule
    app.delete("/api/rules/:id", (req: Request, res: Response) => {
      const rulesData = readRulesFromDisk();
      const ruleId = req.params.id;
      let found = false;

      // Search in globalRules
      if (rulesData.globalRules) {
        const idx = rulesData.globalRules.findIndex((r) => r.id === ruleId);
        if (idx !== -1) {
          rulesData.globalRules.splice(idx, 1);
          found = true;
        }
      }

      // Search in domainRules
      if (!found && rulesData.domainRules) {
        for (const domain of Object.keys(rulesData.domainRules)) {
          const idx = rulesData.domainRules[domain].findIndex((r) => r.id === ruleId);
          if (idx !== -1) {
            rulesData.domainRules[domain].splice(idx, 1);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        res.status(404).json({ success: false, error: "Rule not found" });
        return;
      }

      rulesData.lastUpdated = new Date().toISOString();

      try {
        fs.writeFileSync(RULES_FILE, JSON.stringify(rulesData, null, 2));
        res.json({ success: true, message: "Rule deleted" });
      } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete rule" });
      }
    });

    // API: Clear all rules (keeps default global rules)
    app.post("/api/rules/clear", (_req: Request, res: Response) => {
      const emptyRules = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        globalRules: [],
        domainRules: {},
        domainInsights: {},
      };
      try {
        fs.writeFileSync(RULES_FILE, JSON.stringify(emptyRules, null, 2));
        res.json({ success: true, message: "Rules cleared (default rules will be recreated on next MCP server start)" });
      } catch (error) {
        res.status(500).json({ success: false, error: "Failed to clear rules" });
      }
    });

    // API: Debug data dump
    app.get("/api/debug/raw", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const patterns = readPatternsFromDisk();
      const rules = readRulesFromDisk();

      res.json({
        timestamp: new Date().toISOString(),
        loginHistory: history,
        patterns: patterns,
        rules: rules,
        paths: {
          historyFile: HISTORY_FILE,
          patternsFile: PATTERNS_FILE,
          rulesFile: RULES_FILE,
        },
      });
    });

    // Serve index.html for all other routes (SPA)
    app.use((_req: Request, res: Response) => {
      res.sendFile(join(__dirname, "public", "index.html"));
    });

    const server = app.listen(port, () => {
      console.log(`VaultRunner Dashboard running at http://localhost:${port}`);
      resolve();
    });

    server.on("error", (err: Error & { code?: string }) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Try a different port with --port.`);
      }
      reject(err);
    });
  });
}
