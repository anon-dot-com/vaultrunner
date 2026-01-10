import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loginHistory, LoginAttempt, LoginStep } from "./login-history.js";

export interface LearningNote {
  timestamp: string;
  type: "success" | "failure" | "adaptation" | "hypothesis";
  message: string;
  details?: Record<string, unknown>;
}

export interface SiteRule {
  domain: string;
  name?: string;
  loginUrl: string;
  flowType: "single-page" | "multi-step";
  steps: StepRule[];
  twoFactorSource?: "sms" | "email" | "totp" | "none";
  twoFactorSender?: string;
  confidence: number; // 0-1, based on success rate
  learnedFrom: "bundled" | "local" | "community";
  lastUpdated: string;
  successCount: number;
  failureCount: number;
  // Adaptive learning fields
  learningNotes: LearningNote[];
  lastFailureReason?: string;
  adaptations: string[]; // List of adaptations made based on failures
  alternativeButtonTexts?: string[]; // Button texts that have worked in the past
  consecutiveFailures: number;
}

export interface StepRule {
  order: number;
  action: "fill_username" | "fill_password" | "fill_credentials" | "click_button" | "fill_2fa" | "wait";
  buttonText?: string;
  waitMs?: number;
}

export interface RuleSet {
  version: string;
  lastUpdated: string;
  generalRules: {
    avoidSocialLogin: boolean;
    socialLoginKeywords: string[];
    preferredButtonOrder: string[];
    waitBetweenSteps: number;
    waitAfterSubmit: number;
  };
  sites: Record<string, SiteRule>;
}

const BUNDLED_RULES_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "../rules/site-rules.json"
);
const LOCAL_RULES_DIR = path.join(os.homedir(), ".vaultrunner");
const LOCAL_RULES_FILE = path.join(LOCAL_RULES_DIR, "learned-rules.json");

class RuleEngine {
  private rules: RuleSet;

  constructor() {
    this.rules = this.loadRules();
  }

  /**
   * Load rules from bundled + local sources
   */
  private loadRules(): RuleSet {
    // Start with default rules
    let rules: RuleSet = {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      generalRules: {
        avoidSocialLogin: true,
        socialLoginKeywords: ["google", "apple", "facebook", "microsoft", "github", "linkedin", "twitter"],
        preferredButtonOrder: ["next", "continue", "log in", "sign in", "submit"],
        waitBetweenSteps: 2000,
        waitAfterSubmit: 3000,
      },
      sites: {},
    };

    // Load bundled rules
    try {
      if (fs.existsSync(BUNDLED_RULES_PATH)) {
        const bundled = JSON.parse(fs.readFileSync(BUNDLED_RULES_PATH, "utf-8"));
        if (bundled.sites) {
          for (const [domain, siteData] of Object.entries(bundled.sites)) {
            rules.sites[domain] = this.convertBundledRule(domain, siteData as Record<string, unknown>);
          }
        }
        if (bundled.generalRules) {
          rules.generalRules = { ...rules.generalRules, ...bundled.generalRules };
        }
      }
    } catch (error) {
      console.error("Failed to load bundled rules:", error);
    }

    // Load local learned rules (override bundled)
    try {
      if (fs.existsSync(LOCAL_RULES_FILE)) {
        const local = JSON.parse(fs.readFileSync(LOCAL_RULES_FILE, "utf-8"));
        if (local.sites) {
          for (const [domain, siteRule] of Object.entries(local.sites)) {
            const localRule = siteRule as SiteRule;
            const existingRule = rules.sites[domain];

            // Local rules override bundled if they have higher confidence
            if (!existingRule || localRule.confidence > existingRule.confidence) {
              rules.sites[domain] = localRule;
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load local rules:", error);
    }

    return rules;
  }

  /**
   * Convert bundled rule format to SiteRule
   */
  private convertBundledRule(domain: string, data: Record<string, unknown>): SiteRule {
    const steps: StepRule[] = [];
    const bundledSteps = data.steps as Array<Record<string, unknown>> || [];

    for (let i = 0; i < bundledSteps.length; i++) {
      const step = bundledSteps[i];
      let action: StepRule["action"] = "fill_credentials";

      if (step.action === "fill_username") action = "fill_username";
      else if (step.action === "fill_password") action = "fill_password";
      else if (step.action === "fill_credentials") action = "fill_credentials";
      else if (step.action === "fill_2fa") action = "fill_2fa";

      steps.push({
        order: i + 1,
        action,
        buttonText: step.nextButton as string,
      });
    }

    return {
      domain,
      name: data.name as string,
      loginUrl: data.loginUrl as string,
      flowType: (data.flowType as "single-page" | "multi-step") || "single-page",
      steps,
      twoFactorSource: this.determineTwoFactorSource(bundledSteps),
      confidence: 0.7, // Bundled rules start with decent confidence
      learnedFrom: "bundled",
      lastUpdated: new Date().toISOString(),
      successCount: 0,
      failureCount: 0,
      // Initialize adaptive learning fields
      learningNotes: [{
        timestamp: new Date().toISOString(),
        type: "success",
        message: "Bundled rule loaded from VaultRunner distribution",
      }],
      adaptations: [],
      consecutiveFailures: 0,
      alternativeButtonTexts: [],
    };
  }

  private determineTwoFactorSource(steps: Array<Record<string, unknown>>): "sms" | "email" | "totp" | "none" {
    const tfaStep = steps.find(s => s.action === "fill_2fa");
    if (!tfaStep) return "none";
    const source = tfaStep.source as string;
    if (source === "sms") return "sms";
    if (source === "email") return "email";
    if (source === "totp") return "totp";
    return "none";
  }

  /**
   * Save local rules
   */
  private saveLocalRules(): void {
    try {
      if (!fs.existsSync(LOCAL_RULES_DIR)) {
        fs.mkdirSync(LOCAL_RULES_DIR, { recursive: true });
      }

      // Only save locally learned rules
      const localRules: RuleSet = {
        ...this.rules,
        sites: Object.fromEntries(
          Object.entries(this.rules.sites).filter(([_, rule]) => rule.learnedFrom === "local")
        ),
      };

      fs.writeFileSync(LOCAL_RULES_FILE, JSON.stringify(localRules, null, 2));
    } catch (error) {
      console.error("Failed to save local rules:", error);
    }
  }

  /**
   * Get rule for a domain
   */
  getRuleForDomain(domain: string): SiteRule | null {
    // Try exact match first
    if (this.rules.sites[domain]) {
      return this.rules.sites[domain];
    }

    // Try without subdomain
    const parts = domain.split(".");
    if (parts.length > 2) {
      const baseDomain = parts.slice(-2).join(".");
      if (this.rules.sites[baseDomain]) {
        return this.rules.sites[baseDomain];
      }
    }

    return null;
  }

  /**
   * Get general rules
   */
  getGeneralRules(): RuleSet["generalRules"] {
    return this.rules.generalRules;
  }

  /**
   * Learn from a completed login attempt
   */
  learnFromAttempt(attempt: LoginAttempt): void {
    const existingRule = this.getRuleForDomain(attempt.domain);
    const now = new Date().toISOString();

    if (attempt.outcome === "success") {
      if (existingRule) {
        // Update existing rule
        existingRule.successCount++;
        existingRule.consecutiveFailures = 0; // Reset on success
        existingRule.confidence = existingRule.successCount /
          (existingRule.successCount + existingRule.failureCount);
        existingRule.lastUpdated = now;

        // Learn from successful steps - track what worked
        this.learnFromSuccessfulAttempt(existingRule, attempt);

        // If this was a bundled rule and we have local success, upgrade to local
        if (existingRule.learnedFrom === "bundled" && existingRule.successCount >= 2) {
          existingRule.learnedFrom = "local";
          this.addLearningNote(existingRule, "adaptation",
            "Promoted from bundled to locally-verified rule after multiple successes");
        }
      } else {
        // Create new rule from successful attempt
        const newRule = this.createRuleFromAttempt(attempt);
        this.rules.sites[attempt.domain] = newRule;
      }
    } else if (attempt.outcome === "failed") {
      if (existingRule) {
        existingRule.failureCount++;
        existingRule.consecutiveFailures++;
        existingRule.confidence = existingRule.successCount /
          (existingRule.successCount + existingRule.failureCount);
        existingRule.lastUpdated = now;
        existingRule.lastFailureReason = attempt.errorMessage;

        // Analyze the failure and adapt the rule
        this.analyzeFailureAndAdapt(existingRule, attempt);
      } else {
        // Even failures can teach us something - create a tentative rule
        const newRule = this.createRuleFromAttempt(attempt);
        newRule.confidence = 0.1; // Low confidence for failed-only rule
        this.addLearningNote(newRule, "failure",
          `Initial rule created from failed attempt: ${attempt.errorMessage || 'Unknown error'}`,
          { steps: attempt.steps.map(s => ({ action: s.action, result: s.result })) });
        this.rules.sites[attempt.domain] = newRule;
      }
    } else if (attempt.outcome === "pending_2fa") {
      if (existingRule) {
        // 2FA pending isn't really a failure - note it for learning
        this.addLearningNote(existingRule, "hypothesis",
          "Login reached 2FA stage but code wasn't found automatically. May need different 2FA source.",
          { attemptedSource: attempt.twoFactorSource });

        // If we don't have a 2FA source set, try to infer one
        if (!existingRule.twoFactorSource || existingRule.twoFactorSource === "none") {
          existingRule.twoFactorSource = "sms"; // Default hypothesis
          this.addLearningNote(existingRule, "adaptation",
            "Set 2FA source to SMS as a hypothesis - will try email if this fails");
        }
      }
    } else if (attempt.outcome === "already_logged_in") {
      if (existingRule) {
        // Note that we were already logged in - useful context
        this.addLearningNote(existingRule, "success",
          "User was already logged in when attempting login");
      }
    }

    this.saveLocalRules();
  }

  /**
   * Learn from a successful attempt - update rule with what worked
   */
  private learnFromSuccessfulAttempt(rule: SiteRule, attempt: LoginAttempt): void {
    // Track button texts that worked
    for (const step of attempt.steps) {
      if (step.action === "click_button" && step.result === "success" && step.params?.buttonText) {
        const buttonText = step.params.buttonText as string;
        if (!rule.alternativeButtonTexts) {
          rule.alternativeButtonTexts = [];
        }
        if (!rule.alternativeButtonTexts.includes(buttonText)) {
          rule.alternativeButtonTexts.push(buttonText);
          this.addLearningNote(rule, "success",
            `Learned that button "${buttonText}" works for this site`);
        }
      }
    }

    // Update 2FA sender if we found a code
    const tfaStep = attempt.steps.find(s => s.action === "get_2fa_code" && s.result === "success");
    if (tfaStep && tfaStep.details) {
      rule.twoFactorSender = tfaStep.details;
      this.addLearningNote(rule, "success",
        `Learned 2FA codes come from: ${tfaStep.details}`);
    }

    // Check if the flow type matches what we recorded
    if (attempt.flowType && attempt.flowType !== rule.flowType) {
      rule.flowType = attempt.flowType;
      this.addLearningNote(rule, "adaptation",
        `Updated flow type from observation: now "${attempt.flowType}"`);
    }

    this.addLearningNote(rule, "success",
      `Login succeeded with ${attempt.steps.length} steps`,
      { username: attempt.username, stepCount: attempt.steps.length });
  }

  /**
   * Analyze a failure and adapt the rule accordingly
   */
  private analyzeFailureAndAdapt(rule: SiteRule, attempt: LoginAttempt): void {
    const failedSteps = attempt.steps.filter(s => s.result === "failed");
    const partialSteps = attempt.steps.filter(s => s.result === "partial");

    // Find the first failed step to understand what went wrong
    const firstFailure = failedSteps[0] || partialSteps[0];

    if (!firstFailure) {
      this.addLearningNote(rule, "failure",
        `Login failed but no specific step failure identified: ${attempt.errorMessage || 'Unknown'}`,
        { totalSteps: attempt.steps.length });
      return;
    }

    // Analyze based on what type of step failed
    switch (firstFailure.action) {
      case "fill_credentials":
        this.handleCredentialFillFailure(rule, attempt, firstFailure);
        break;
      case "click_button":
        this.handleButtonClickFailure(rule, attempt, firstFailure);
        break;
      case "fill_totp":
      case "get_2fa_code":
        this.handle2FAFailure(rule, attempt, firstFailure);
        break;
      default:
        this.addLearningNote(rule, "failure",
          `Step "${firstFailure.action}" failed: ${firstFailure.details || 'Unknown reason'}`,
          { step: firstFailure });
    }
  }

  /**
   * Handle credential fill failures
   */
  private handleCredentialFillFailure(rule: SiteRule, attempt: LoginAttempt, step: LoginStep): void {
    const details = step.details?.toLowerCase() || "";

    if (details.includes("none") || details.includes("no fields")) {
      // Couldn't find any fields - page might not be ready or login URL changed
      this.addLearningNote(rule, "failure",
        "Could not find credential fields on page. The login page may have changed.",
        { loginUrl: attempt.loginUrl, ruleLoginUrl: rule.loginUrl });

      // If the URLs differ, update the rule
      if (attempt.loginUrl !== rule.loginUrl) {
        const adaptation = `Updated login URL from "${rule.loginUrl}" to "${attempt.loginUrl}"`;
        rule.loginUrl = attempt.loginUrl;
        rule.adaptations.push(adaptation);
        this.addLearningNote(rule, "adaptation", adaptation);
      }
    } else if (details.includes("username") && !details.includes("password")) {
      // Only filled username - might be a multi-step flow
      if (rule.flowType === "single-page") {
        const adaptation = "Changed flow type to multi-step (only username field was found)";
        rule.flowType = "multi-step";
        rule.adaptations.push(adaptation);
        this.addLearningNote(rule, "adaptation", adaptation);
      }
    } else if (details.includes("password") && !details.includes("username")) {
      // Only found password - unusual, might be second step of multi-step
      this.addLearningNote(rule, "hypothesis",
        "Only password field found - page may already be on step 2 of multi-step flow");
    }
  }

  /**
   * Handle button click failures
   */
  private handleButtonClickFailure(rule: SiteRule, attempt: LoginAttempt, step: LoginStep): void {
    const attemptedButton = step.params?.buttonText as string;

    this.addLearningNote(rule, "failure",
      `Could not find or click button "${attemptedButton}"`,
      { attemptedButton, error: step.details });

    // Check if we have alternative button texts to try
    if (rule.alternativeButtonTexts && rule.alternativeButtonTexts.length > 0) {
      const alternatives = rule.alternativeButtonTexts.filter(b => b !== attemptedButton);
      if (alternatives.length > 0) {
        this.addLearningNote(rule, "hypothesis",
          `Will try alternative buttons on next attempt: ${alternatives.join(", ")}`);
      }
    }

    // If we've failed with this button multiple times, try to update the rule
    if (rule.consecutiveFailures >= 2) {
      // Look for a working button in the attempt steps
      const successfulClick = attempt.steps.find(
        s => s.action === "click_button" && s.result === "success"
      );
      if (successfulClick && successfulClick.params?.buttonText) {
        const newButtonText = successfulClick.params.buttonText as string;
        const stepToUpdate = rule.steps.find(
          s => s.action === "click_button" && s.buttonText === attemptedButton
        );
        if (stepToUpdate) {
          const adaptation = `Changed button text from "${attemptedButton}" to "${newButtonText}" after ${rule.consecutiveFailures} failures`;
          stepToUpdate.buttonText = newButtonText;
          rule.adaptations.push(adaptation);
          this.addLearningNote(rule, "adaptation", adaptation);
        }
      }
    }
  }

  /**
   * Handle 2FA failures
   */
  private handle2FAFailure(rule: SiteRule, attempt: LoginAttempt, step: LoginStep): void {
    const source = step.params?.source as string || rule.twoFactorSource;

    this.addLearningNote(rule, "failure",
      `2FA code retrieval failed from ${source}: ${step.details || 'No code found'}`,
      { source, sender: rule.twoFactorSender });

    // Cycle through 2FA sources as hypotheses
    if (rule.consecutiveFailures >= 2) {
      const sources: Array<"sms" | "email" | "totp"> = ["sms", "email", "totp"];
      const currentIndex = sources.indexOf(rule.twoFactorSource as "sms" | "email" | "totp");
      const nextSource = sources[(currentIndex + 1) % sources.length];

      const adaptation = `Changing 2FA source from "${rule.twoFactorSource}" to "${nextSource}" after ${rule.consecutiveFailures} failures`;
      rule.twoFactorSource = nextSource;
      rule.adaptations.push(adaptation);
      this.addLearningNote(rule, "adaptation", adaptation);
    }
  }

  /**
   * Add a learning note to a rule
   */
  private addLearningNote(
    rule: SiteRule,
    type: LearningNote["type"],
    message: string,
    details?: Record<string, unknown>
  ): void {
    if (!rule.learningNotes) {
      rule.learningNotes = [];
    }

    rule.learningNotes.push({
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    });

    // Keep only the last 50 notes to prevent unbounded growth
    if (rule.learningNotes.length > 50) {
      rule.learningNotes = rule.learningNotes.slice(-50);
    }
  }

  /**
   * Create a new rule from a successful login attempt
   */
  private createRuleFromAttempt(attempt: LoginAttempt): SiteRule {
    const steps: StepRule[] = [];
    let stepOrder = 1;

    for (const step of attempt.steps) {
      if (step.result === "success" || step.result === "partial") {
        let action: StepRule["action"];

        switch (step.action) {
          case "fill_credentials":
            // Determine if it was username only, password only, or both
            const details = step.details?.toLowerCase() || "";
            if (details.includes("username") && !details.includes("password")) {
              action = "fill_username";
            } else if (details.includes("password") && !details.includes("username")) {
              action = "fill_password";
            } else {
              action = "fill_credentials";
            }
            break;
          case "click_button":
            action = "click_button";
            break;
          case "fill_totp":
          case "get_2fa_code":
            action = "fill_2fa";
            break;
          case "wait":
            action = "wait";
            break;
          default:
            continue;
        }

        steps.push({
          order: stepOrder++,
          action,
          buttonText: step.params?.buttonText as string,
          waitMs: step.action === "wait" ? (step.params?.duration as number) * 1000 : undefined,
        });
      }
    }

    const rule: SiteRule = {
      domain: attempt.domain,
      loginUrl: attempt.loginUrl,
      flowType: attempt.flowType || "single-page",
      steps,
      twoFactorSource: attempt.twoFactorSource,
      twoFactorSender: attempt.twoFactorSender,
      confidence: attempt.outcome === "success" ? 0.5 : 0.1,
      learnedFrom: "local",
      lastUpdated: new Date().toISOString(),
      successCount: attempt.outcome === "success" ? 1 : 0,
      failureCount: attempt.outcome === "failed" ? 1 : 0,
      // Initialize adaptive learning fields
      learningNotes: [],
      adaptations: [],
      consecutiveFailures: attempt.outcome === "failed" ? 1 : 0,
      alternativeButtonTexts: [],
    };

    // Add initial learning note
    this.addLearningNote(rule, attempt.outcome === "success" ? "success" : "failure",
      `Rule created from ${attempt.outcome} login attempt`,
      {
        username: attempt.username,
        stepCount: attempt.steps.length,
        flowType: attempt.flowType,
        twoFactorSource: attempt.twoFactorSource,
      });

    return rule;
  }

  /**
   * Get all rules (for contribution)
   */
  getAllRules(): RuleSet {
    return this.rules;
  }

  /**
   * Get rules learned locally that are ready for contribution
   */
  getContributableRules(): SiteRule[] {
    return Object.values(this.rules.sites).filter(
      (rule) => rule.learnedFrom === "local" && rule.successCount >= 3 && rule.confidence >= 0.8
    );
  }

  /**
   * Import community rules
   */
  importCommunityRules(rules: SiteRule[]): void {
    for (const rule of rules) {
      rule.learnedFrom = "community";
      const existingRule = this.rules.sites[rule.domain];

      // Only import if we don't have a local rule with higher confidence
      if (!existingRule || existingRule.learnedFrom !== "local" || existingRule.confidence < rule.confidence) {
        this.rules.sites[rule.domain] = rule;
      }
    }
    this.saveLocalRules();
  }

  /**
   * Reload rules from disk
   */
  reload(): void {
    this.rules = this.loadRules();
  }
}

export const ruleEngine = new RuleEngine();
