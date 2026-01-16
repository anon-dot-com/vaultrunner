/**
 * MCP Tools for Rules Management
 * Allows adding, retrieving, and managing automation rules
 */

import { z } from "zod";
import {
  rulesStore,
  type Rule,
  type RuleTrigger,
  type RuleAction,
} from "../rules/rules-store.js";

// Schema for rule triggers
const RuleTriggerSchema = z.enum([
  "before_fill_field",
  "after_click_field",
  "before_click_button",
  "before_login",
  "after_login",
  "on_2fa_prompt",
  "on_error",
  "always",
]);

// Schema for rule actions
const RuleActionSchema = z.enum([
  "press_escape",
  "wait",
  "click_elsewhere",
  "use_password_login",
  "use_sms_2fa",
  "use_totp_2fa",
  "dismiss_popup",
  "navigate_to_url",
  "custom",
]);

// Tool definitions
export const rulesTools = {
  add_rule: {
    name: "add_rule",
    description: `Add a new automation rule (global or domain-specific).

Rules help VaultRunner learn and improve login automation over time.

**Triggers** (when the rule fires):
- before_fill_field: Before filling any input field
- after_click_field: After clicking on a field (before typing)
- before_click_button: Before clicking any button
- before_login: At the start of login flow
- after_login: After login completes
- on_2fa_prompt: When 2FA is detected
- on_error: When an error occurs
- always: Always apply

**Actions** (what to do):
- press_escape: Press Escape key (dismiss popups)
- wait: Wait for specified duration (ms)
- click_elsewhere: Click outside the element first
- use_password_login: Prefer password over magic link
- use_sms_2fa: Prefer SMS for 2FA
- use_totp_2fa: Prefer TOTP for 2FA
- dismiss_popup: Try to dismiss any popup
- navigate_to_url: Navigate to a specific URL
- custom: Custom instruction for Claude

Example: Add global rule to press Escape after clicking fields:
{
  "scope": "global",
  "trigger": "after_click_field",
  "action": "press_escape",
  "reason": "Dismiss 1Password autofill dropdown"
}

Example: Add domain rule for specific login URL:
{
  "scope": "domain",
  "domain": "venture.angellist.com",
  "trigger": "before_login",
  "action": "navigate_to_url",
  "action_params": { "url": "https://venture.angellist.com/v/login" },
  "reason": "AngelList login is at /v/login, not /login"
}`,
    inputSchema: z.object({
      scope: z.enum(["global", "domain"]).describe("Whether rule applies globally or to specific domain"),
      domain: z.string().optional().describe("Domain for domain-specific rules (required if scope is 'domain')"),
      trigger: RuleTriggerSchema.describe("When the rule should fire"),
      action: RuleActionSchema.describe("What action to take"),
      action_params: z.object({
        duration: z.number().optional().describe("Wait duration in ms (for 'wait' action)"),
        url: z.string().optional().describe("URL to navigate to (for 'navigate_to_url' action)"),
        instruction: z.string().optional().describe("Custom instruction (for 'custom' action)"),
        fieldType: z.string().optional().describe("Specific field type to apply to (e.g., 'password')"),
      }).optional().describe("Additional parameters for the action"),
      reason: z.string().describe("Why this rule exists (for documentation)"),
      priority: z.number().optional().default(50).describe("Priority (higher = applied first, default 50)"),
      learned_context: z.string().optional().describe("Context about how this rule was learned"),
    }),
    handler: async (params: {
      scope: "global" | "domain";
      domain?: string;
      trigger: RuleTrigger;
      action: RuleAction;
      action_params?: {
        duration?: number;
        url?: string;
        instruction?: string;
        fieldType?: string;
      };
      reason: string;
      priority?: number;
      learned_context?: string;
    }) => {
      // Validate domain is provided for domain-scoped rules
      if (params.scope === "domain" && !params.domain) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Domain is required for domain-scoped rules",
            }, null, 2),
          }],
        };
      }

      const rule = rulesStore.addRule({
        scope: params.scope,
        domain: params.domain,
        trigger: params.trigger,
        action: params.action,
        actionParams: params.action_params,
        reason: params.reason,
        priority: params.priority || 50,
        enabled: true,
        learnedFrom: params.learned_context ? {
          date: new Date().toISOString(),
          context: params.learned_context,
        } : undefined,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            rule: {
              id: rule.id,
              scope: rule.scope,
              domain: rule.domain,
              trigger: rule.trigger,
              action: rule.action,
              reason: rule.reason,
              priority: rule.priority,
            },
            message: `Rule added: ${rule.action} on ${rule.trigger}${rule.domain ? ` for ${rule.domain}` : " (global)"}`,
          }, null, 2),
        }],
      };
    },
  },

  get_rules: {
    name: "get_rules",
    description: `Get automation rules for a domain (includes global rules + domain-specific rules).

Returns all applicable rules sorted by priority. Use this before starting a login
to know what automation behaviors to apply.

If no domain is specified, returns all global rules.`,
    inputSchema: z.object({
      domain: z.string().optional().describe("Domain to get rules for (optional, returns global rules if not specified)"),
      trigger: RuleTriggerSchema.optional().describe("Filter by specific trigger"),
    }),
    handler: async (params: { domain?: string; trigger?: RuleTrigger }) => {
      let rules: Rule[];

      if (params.domain) {
        if (params.trigger) {
          rules = rulesStore.getRulesForTrigger(params.domain, params.trigger);
        } else {
          rules = rulesStore.getRulesForDomain(params.domain);
        }
      } else {
        rules = rulesStore.getGlobalRules();
      }

      // Get domain insights if available
      const insights = params.domain ? rulesStore.getDomainInsights(params.domain) : null;

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            domain: params.domain || "global",
            rules: rules.map(r => ({
              id: r.id,
              scope: r.scope,
              trigger: r.trigger,
              action: r.action,
              actionParams: r.actionParams,
              reason: r.reason,
              priority: r.priority,
              enabled: r.enabled,
              successCount: r.successCount,
              failureCount: r.failureCount,
            })),
            insights: insights ? {
              loginUrl: insights.loginUrl,
              notes: insights.notes,
              quirks: insights.quirks,
            } : null,
            summary: rulesStore.getRulesSummary(),
          }, null, 2),
        }],
      };
    },
  },

  remove_rule: {
    name: "remove_rule",
    description: "Remove a rule by its ID.",
    inputSchema: z.object({
      rule_id: z.string().describe("The ID of the rule to remove"),
    }),
    handler: async (params: { rule_id: string }) => {
      const deleted = rulesStore.deleteRule(params.rule_id);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(deleted ? {
            success: true,
            message: `Rule ${params.rule_id} deleted`,
          } : {
            success: false,
            error: `Rule ${params.rule_id} not found`,
          }, null, 2),
        }],
      };
    },
  },

  toggle_rule: {
    name: "toggle_rule",
    description: "Enable or disable a rule.",
    inputSchema: z.object({
      rule_id: z.string().describe("The ID of the rule to toggle"),
      enabled: z.boolean().describe("Whether to enable (true) or disable (false) the rule"),
    }),
    handler: async (params: { rule_id: string; enabled: boolean }) => {
      const success = rulesStore.setRuleEnabled(params.rule_id, params.enabled);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(success ? {
            success: true,
            message: `Rule ${params.rule_id} ${params.enabled ? "enabled" : "disabled"}`,
          } : {
            success: false,
            error: `Rule ${params.rule_id} not found`,
          }, null, 2),
        }],
      };
    },
  },

  add_domain_insight: {
    name: "add_domain_insight",
    description: `Add a learned insight about a domain.

Use this to record helpful context discovered during login attempts:
- Login URL if different from expected
- UI quirks or workarounds
- 2FA preferences
- Any other useful information

This helps future login attempts to the same domain.`,
    inputSchema: z.object({
      domain: z.string().describe("The domain this insight applies to"),
      insight: z.string().describe("The insight or note to record"),
      is_quirk: z.boolean().optional().default(false).describe("Whether this is a quirk/workaround (vs general note)"),
      login_url: z.string().optional().describe("The correct login URL for this domain (if discovered)"),
    }),
    handler: async (params: {
      domain: string;
      insight: string;
      is_quirk?: boolean;
      login_url?: string;
    }) => {
      rulesStore.addDomainInsight(params.domain, params.insight, params.is_quirk);

      if (params.login_url) {
        rulesStore.setDomainLoginUrl(params.domain, params.login_url);
      }

      const insights = rulesStore.getDomainInsights(params.domain);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            domain: params.domain,
            insights: {
              loginUrl: insights?.loginUrl,
              notes: insights?.notes || [],
              quirks: insights?.quirks || [],
            },
            message: `Insight added for ${params.domain}`,
          }, null, 2),
        }],
      };
    },
  },

  record_rule_outcome: {
    name: "record_rule_outcome",
    description: `Record whether a rule helped or hurt during a login attempt.

Call this after applying a rule to track its effectiveness.
This helps VaultRunner learn which rules are actually useful.`,
    inputSchema: z.object({
      rule_id: z.string().describe("The ID of the rule"),
      helped: z.boolean().describe("Whether the rule helped (true) or caused issues (false)"),
    }),
    handler: async (params: { rule_id: string; helped: boolean }) => {
      if (params.helped) {
        rulesStore.recordRuleSuccess(params.rule_id);
      } else {
        rulesStore.recordRuleFailure(params.rule_id);
      }

      const rule = rulesStore.getRule(params.rule_id);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            rule_id: params.rule_id,
            recorded: params.helped ? "success" : "failure",
            stats: rule ? {
              successCount: rule.successCount,
              failureCount: rule.failureCount,
              effectiveness: rule.successCount + rule.failureCount > 0
                ? rule.successCount / (rule.successCount + rule.failureCount)
                : 0,
            } : null,
          }, null, 2),
        }],
      };
    },
  },

  get_rules_summary: {
    name: "get_rules_summary",
    description: "Get a summary of all rules and domain insights.",
    inputSchema: z.object({}),
    handler: async () => {
      const summary = rulesStore.getRulesSummary();
      const allInsights = rulesStore.getAllDomainInsights();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            rules: summary,
            domainInsights: allInsights.map(i => ({
              domain: i.domain,
              loginUrl: i.loginUrl,
              notesCount: i.notes.length,
              quirksCount: i.quirks.length,
            })),
          }, null, 2),
        }],
      };
    },
  },
};

// Export tool handlers for registration
export function getRulesToolDefinitions() {
  return Object.values(rulesTools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function getRulesToolHandler(name: string) {
  const tool = Object.values(rulesTools).find(t => t.name === name);
  return tool?.handler;
}
