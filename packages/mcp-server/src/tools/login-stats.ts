import { z } from "zod";
import { loginHistory } from "../learning/login-history.js";
import { ruleEngine } from "../learning/rule-engine.js";
import { logger } from "../utils/logger.js";

export const loginStatsTool = {
  name: "login_stats",
  description: `Get login statistics and learned patterns. Shows:
- Total login attempts and success rate
- Learned rules per domain
- Recent login history
- Rules ready for community contribution`,
  inputSchema: z.object({
    domain: z
      .string()
      .optional()
      .describe("Optional: filter stats for a specific domain"),
  }),
  handler: async ({ domain }: { domain?: string }) => {
    logger.info("Getting login statistics...");

    const stats = loginHistory.getStats();
    const history = loginHistory.getHistory();
    const rules = ruleEngine.getAllRules();

    let result: Record<string, unknown> = {};

    if (domain) {
      // Domain-specific stats
      const domainAttempts = loginHistory.getAttemptsForDomain(domain);
      const domainRule = ruleEngine.getRuleForDomain(domain);

      result = {
        domain,
        attempts: domainAttempts.length,
        successful: domainAttempts.filter((a) => a.outcome === "success").length,
        failed: domainAttempts.filter((a) => a.outcome === "failed").length,
        rule: domainRule
          ? {
              flowType: domainRule.flowType,
              steps: domainRule.steps.length,
              twoFactorSource: domainRule.twoFactorSource,
              confidence: domainRule.confidence,
              learnedFrom: domainRule.learnedFrom,
              successCount: domainRule.successCount,
            }
          : null,
        recentAttempts: domainAttempts.slice(0, 5).map((a) => ({
          outcome: a.outcome,
          startedAt: a.startedAt,
          stepCount: a.steps.length,
        })),
      };
    } else {
      // Overall stats
      const siteCount = Object.keys(rules.sites).length;
      const localRules = Object.values(rules.sites).filter((r) => r.learnedFrom === "local");
      const bundledRules = Object.values(rules.sites).filter((r) => r.learnedFrom === "bundled");
      const contributable = ruleEngine.getContributableRules();

      result = {
        overall: {
          totalAttempts: stats.totalAttempts,
          successRate: `${(stats.successRate * 100).toFixed(1)}%`,
          uniqueSites: stats.uniqueDomains,
          mostCommonFlowType: stats.mostCommonFlowType,
        },
        rules: {
          total: siteCount,
          bundled: bundledRules.length,
          locallyLearned: localRules.length,
          readyToContribute: contributable.length,
        },
        learnedSites: localRules.map((r) => ({
          domain: r.domain,
          confidence: `${(r.confidence * 100).toFixed(0)}%`,
          successCount: r.successCount,
          flowType: r.flowType,
        })),
        recentAttempts: history.attempts.slice(0, 10).map((a) => ({
          domain: a.domain,
          outcome: a.outcome,
          startedAt: a.startedAt,
        })),
        contributionTip:
          contributable.length > 0
            ? `You have ${contributable.length} rules ready to share! Run 'vaultrunner contribute-rules' to help the community.`
            : "Keep logging in to build up patterns for community contribution!",
      };
    }

    logger.success("Stats retrieved");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
};
