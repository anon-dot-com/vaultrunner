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

    // API: Debug data dump
    app.get("/api/debug/raw", (_req: Request, res: Response) => {
      const history = readHistoryFromDisk();
      const patterns = readPatternsFromDisk();

      res.json({
        timestamp: new Date().toISOString(),
        loginHistory: history,
        patterns: patterns,
        paths: {
          historyFile: HISTORY_FILE,
          patternsFile: PATTERNS_FILE,
        },
      });
    });

    // Serve index.html for all other routes (SPA)
    app.get("/*", (_req: Request, res: Response) => {
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
