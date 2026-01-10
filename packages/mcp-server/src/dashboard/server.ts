import express, { Request, Response } from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// File paths for direct reading (to get fresh data on each request)
const VAULTRUNNER_DIR = path.join(os.homedir(), ".vaultrunner");
const HISTORY_FILE = path.join(VAULTRUNNER_DIR, "login-history.json");
const RULES_FILE = path.join(VAULTRUNNER_DIR, "learned-rules.json");

/**
 * Read login history directly from disk (fresh data on each request)
 */
function readHistoryFromDisk() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to read login history:", error);
  }
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    attempts: [],
  };
}

/**
 * Read learned rules directly from disk (fresh data on each request)
 */
function readRulesFromDisk() {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const data = fs.readFileSync(RULES_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to read learned rules:", error);
  }
  return {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    generalRules: {
      socialLoginKeywords: ["google", "apple", "facebook", "twitter", "microsoft", "github", "linkedin"],
      waitBetweenSteps: 2000,
      waitAfterSubmit: 3000,
    },
    sites: {},
  };
}

/**
 * Calculate stats from history
 */
function calculateStats(history: { attempts: any[] }) {
  const completed = history.attempts.filter((a: any) => a.outcome !== "in_progress");
  const successful = completed.filter((a: any) => a.outcome === "success");
  const domains = new Set(history.attempts.map((a: any) => a.domain));
  const flowTypes = completed.map((a: any) => a.flowType).filter(Boolean);
  const flowCounts = flowTypes.reduce((acc: Record<string, number>, ft: string) => {
    acc[ft] = (acc[ft] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalAttempts: completed.length,
    successRate: completed.length > 0 ? successful.length / completed.length : 0,
    uniqueDomains: domains.size,
    mostCommonFlowType: Object.entries(flowCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || "unknown",
  };
}

/**
 * Get contributable rules (rules with enough successful logins)
 */
function getContributableRules(rules: { sites: Record<string, any> }) {
  return Object.entries(rules.sites)
    .filter(([_, rule]) => {
      return (
        rule.learnedFrom === "local" &&
        rule.successCount >= 3 &&
        rule.confidence >= 0.8
      );
    })
    .map(([domain, rule]) => ({ domain, ...rule }));
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

    // API: Get overall stats (reads fresh from disk)
    app.get("/api/stats", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const rules = readRulesFromDisk();
      const stats = calculateStats(history);
      const siteCount = Object.keys(rules.sites).length;
      const localRules = Object.values(rules.sites).filter((r: any) => r.learnedFrom === "local").length;
      const bundledRules = Object.values(rules.sites).filter((r: any) => r.learnedFrom === "bundled").length;
      const communityRules = Object.values(rules.sites).filter((r: any) => r.learnedFrom === "community").length;
      const contributable = getContributableRules(rules);

      res.json({
        attempts: {
          total: stats.totalAttempts,
          successRate: stats.successRate,
          uniqueSites: stats.uniqueDomains,
          mostCommonFlow: stats.mostCommonFlowType,
        },
        rules: {
          total: siteCount,
          bundled: bundledRules,
          local: localRules,
          community: communityRules,
          contributable: contributable.length,
        },
      });
    });

    // API: Get login history (reads fresh from disk)
    app.get("/api/history", (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const domain = req.query.domain as string;

      const history = readHistoryFromDisk();
      let attempts = history.attempts;

      if (domain) {
        attempts = attempts.filter((a: any) => a.domain.includes(domain));
      }

      res.json({
        attempts: attempts.slice(0, limit).map((a: any) => ({
          id: a.id,
          domain: a.domain,
          loginUrl: a.loginUrl,
          outcome: a.outcome,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
          stepCount: a.steps?.length || 0,
          flowType: a.flowType,
          twoFactorSource: a.twoFactorSource,
          errorMessage: a.errorMessage,
          username: a.username,
          itemTitle: a.itemTitle,
        })),
        total: attempts.length,
      });
    });

    // API: Get single attempt details (reads fresh from disk)
    app.get("/api/history/:id", (req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const attempt = history.attempts.find((a: any) => a.id === req.params.id);

      if (!attempt) {
        res.status(404).json({ error: "Attempt not found" });
        return;
      }

      res.json(attempt);
    });

    // API: Get all rules (reads fresh from disk)
    app.get("/api/rules", (_req: Request, res: Response) => {
      const rules = readRulesFromDisk();

      const siteRules = Object.entries(rules.sites).map(([domain, rule]: [string, any]) => ({
        domain,
        name: rule.name,
        loginUrl: rule.loginUrl,
        flowType: rule.flowType,
        steps: rule.steps || [], // Include full step details
        stepCount: rule.steps?.length || 0,
        twoFactorSource: rule.twoFactorSource,
        twoFactorSender: rule.twoFactorSender,
        confidence: rule.confidence,
        learnedFrom: rule.learnedFrom,
        successCount: rule.successCount,
        failureCount: rule.failureCount,
        lastUpdated: rule.lastUpdated,
        // Adaptive learning fields
        learningNotes: rule.learningNotes || [],
        adaptations: rule.adaptations || [],
        consecutiveFailures: rule.consecutiveFailures || 0,
        lastFailureReason: rule.lastFailureReason,
        alternativeButtonTexts: rule.alternativeButtonTexts || [],
      }));

      res.json({
        generalRules: rules.generalRules,
        sites: siteRules,
      });
    });

    // API: Get single rule details (reads fresh from disk)
    app.get("/api/rules/:domain", (req: Request, res: Response) => {
      const rules = readRulesFromDisk();
      const rule = rules.sites[req.params.domain];

      if (!rule) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }

      res.json({ domain: req.params.domain, ...rule });
    });

    // API: Get contributable rules (reads fresh from disk)
    app.get("/api/contributable", (_req: Request, res: Response) => {
      const rules = readRulesFromDisk();
      const contributable = getContributableRules(rules);

      res.json({
        count: contributable.length,
        rules: contributable.map((r: any) => ({
          domain: r.domain,
          confidence: r.confidence,
          successCount: r.successCount,
          flowType: r.flowType,
          twoFactorSource: r.twoFactorSource,
        })),
      });
    });

    // API: Export patterns for contribution (reads fresh from disk)
    app.get("/api/export", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      // Simple export - just return successful patterns
      const patterns = history.attempts
        .filter((a: any) => a.outcome === "success")
        .map((a: any) => ({
          domain: a.domain,
          loginUrl: a.loginUrl,
          flowType: a.flowType,
          steps: a.steps,
        }));
      res.json({ patterns });
    });

    // API: Clear history (writes to disk)
    app.post("/api/history/clear", (_req: Request, res: Response) => {
      const emptyHistory = {
        version: "1.0",
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

    // API: Get active sessions (reads fresh from disk)
    app.get("/api/sessions", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const sessionsByDomain = new Map<string, any>();

      // Get most recent successful login for each domain
      for (const attempt of history.attempts) {
        if (attempt.outcome === "success" && !sessionsByDomain.has(attempt.domain)) {
          sessionsByDomain.set(attempt.domain, attempt);
        }
      }

      const sessions = Array.from(sessionsByDomain.values()).map((attempt: any) => {
        const assistedBy: string[] = [];
        for (const step of (attempt.steps || [])) {
          if (step.result === "success" || step.result === "partial") {
            if (step.action === "fill_credentials") {
              assistedBy.push("Credentials");
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
          username: attempt.username,
          itemTitle: attempt.itemTitle,
          loggedInAt: attempt.completedAt || attempt.startedAt,
          assistedBy: [...new Set(assistedBy)],
          twoFactorUsed: attempt.twoFactorSource !== "none" && attempt.twoFactorSource !== undefined,
          attemptId: attempt.id,
        };
      });

      res.json({
        count: sessions.length,
        sessions,
      });
    });

    // API: Raw data dump for debugging (reads fresh from disk)
    app.get("/api/debug/raw", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const rules = readRulesFromDisk();

      res.json({
        timestamp: new Date().toISOString(),
        loginHistory: {
          version: history.version,
          lastUpdated: history.lastUpdated,
          totalAttempts: history.attempts.length,
          attempts: history.attempts, // Full raw attempts with all steps
        },
        rules: {
          version: rules.version,
          lastUpdated: rules.lastUpdated,
          generalRules: rules.generalRules,
          sites: rules.sites, // Full raw site rules
        },
        currentAttempt: null, // Can't track in-progress from separate process
        paths: {
          historyFile: HISTORY_FILE,
          rulesFile: RULES_FILE,
        },
      });
    });

    // Serve index.html for all other routes (SPA)
    app.get("/{*path}", (_req: Request, res: Response) => {
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
