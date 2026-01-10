import { z } from "zod";
import { extensionBridge } from "../bridge/extension-bridge.js";
import { onePasswordCLI } from "../onepassword/cli.js";
import { loginHistory } from "../learning/login-history.js";
import { ruleEngine } from "../learning/rule-engine.js";
import { logger } from "../utils/logger.js";
import { searchMessagesForCode } from "../sources/messages-reader.js";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const smartLoginTool = {
  name: "smart_login",
  description: `Automatically log into a website using learned rules and patterns. This tool:
1. Looks up known login patterns for the domain
2. Executes the multi-step login flow automatically
3. Handles 2FA via SMS, email, or TOTP
4. Learns from the outcome to improve future logins

Use this for a fully automated login experience.`,
  inputSchema: z.object({
    domain: z.string().describe("The domain to log into (e.g., 'x.com', 'webflow.com')"),
    item_id: z.string().describe("The 1Password item ID for credentials"),
    tab_id: z.number().optional().describe("Browser tab ID (optional)"),
    login_url: z.string().optional().describe("Override login URL if different from standard"),
  }),
  handler: async ({
    domain,
    item_id,
    tab_id,
    login_url,
  }: {
    domain: string;
    item_id: string;
    tab_id?: number;
    login_url?: string;
  }) => {
    logger.info(`Starting smart login for ${domain}...`);

    if (!extensionBridge.isConnected()) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "VaultRunner Chrome extension is not connected.",
            }, null, 2),
          },
        ],
      };
    }

    // Get credentials from 1Password
    logger.step("Fetching credentials from 1Password...");
    const credentials = await onePasswordCLI.getCredentials(item_id);
    if (!credentials) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: `Could not retrieve credentials for item "${item_id}". Vault may be locked.`,
            }, null, 2),
          },
        ],
      };
    }

    // Get item details for username and title
    let username: string | undefined = credentials.username;
    let itemTitle: string | undefined;
    try {
      const itemInfo = await onePasswordCLI.getItemInfo(item_id);
      if (itemInfo) {
        username = itemInfo.username;
        itemTitle = itemInfo.title;
      }
    } catch {
      // Use username from credentials as fallback
    }

    // Get rules for this domain
    const rule = ruleEngine.getRuleForDomain(domain);
    const generalRules = ruleEngine.getGeneralRules();

    // Determine login URL
    const targetUrl = login_url || rule?.loginUrl || `https://${domain}/login`;

    // Start tracking this attempt with user info
    const attemptId = loginHistory.startAttempt(domain, targetUrl, { username, itemTitle });
    logger.step(`Tracking attempt: ${attemptId}${username ? ` for ${username}` : ""}`);

    const results: string[] = [];
    let success = false;
    let errorMessage: string | undefined;

    try {
      // Step 1: Fill credentials (with retry for content script loading)
      logger.step("Filling credentials (attempt 1)...");

      let fill1 = await extensionBridge.fillCredentials(credentials, tab_id);
      let filledFields1 = fill1.filledFields || [];

      // Retry up to 3 times if fill fails (content script may not be ready)
      let retryCount = 0;
      const maxRetries = 3;
      while (!fill1.success && filledFields1.length === 0 && retryCount < maxRetries) {
        retryCount++;
        const waitTime = retryCount * 1000; // 1s, 2s, 3s
        logger.step(`Fill failed, waiting ${waitTime}ms and retrying (${retryCount}/${maxRetries})...`);
        await wait(waitTime);
        fill1 = await extensionBridge.fillCredentials(credentials, tab_id);
        filledFields1 = fill1.filledFields || [];
      }

      loginHistory.logStep(
        "fill_credentials",
        fill1.success ? (filledFields1.length > 1 ? "success" : "partial") : "failed",
        { item_id, retries: retryCount },
        `Filled: ${filledFields1.join(", ") || "none"}${retryCount > 0 ? ` (after ${retryCount} retries)` : ""}`
      );
      results.push(`Fill 1: ${filledFields1.join(", ") || "none"}${retryCount > 0 ? ` (${retryCount} retries)` : ""}`);

      if (!fill1.success && filledFields1.length === 0) {
        throw new Error("Could not fill any credentials. Page may not be ready or login form not found.");
      }

      // Determine if this is a multi-step flow
      const isMultiStep = rule?.flowType === "multi-step" ||
        (filledFields1.length === 1 && filledFields1[0] === "username");

      if (isMultiStep) {
        // Step 2: Click Next/Continue
        const nextButton = rule?.steps?.[0]?.buttonText || "Next";
        logger.step(`Clicking "${nextButton}"...`);

        await wait(500); // Brief wait before clicking
        const click1 = await extensionBridge.clickButton(nextButton, generalRules.socialLoginKeywords, tab_id);

        loginHistory.logStep(
          "click_button",
          click1.success ? "success" : "failed",
          { buttonText: nextButton },
          click1.clicked || click1.error
        );
        results.push(`Click 1: ${click1.clicked || click1.error}`);

        if (!click1.success) {
          // Try alternate buttons
          for (const altButton of ["Continue", "Submit"]) {
            const altClick = await extensionBridge.clickButton(altButton, generalRules.socialLoginKeywords, tab_id);
            if (altClick.success) {
              loginHistory.logStep("click_button", "success", { buttonText: altButton }, altClick.clicked);
              results.push(`Click 1 (alt): ${altClick.clicked}`);
              break;
            }
          }
        }

        // Wait for page transition
        logger.step("Waiting for page transition...");
        await wait(generalRules.waitBetweenSteps);
        loginHistory.logStep("wait", "success", { duration: generalRules.waitBetweenSteps / 1000 });

        // Step 3: Fill password
        logger.step("Filling credentials (attempt 2 - password)...");
        const fill2 = await extensionBridge.fillCredentials(credentials, tab_id);

        const filledFields2 = fill2.filledFields || [];
        loginHistory.logStep(
          "fill_credentials",
          fill2.success ? "success" : "partial",
          { item_id },
          `Filled: ${filledFields2.join(", ") || "none"}`
        );
        results.push(`Fill 2: ${filledFields2.join(", ") || "none"}`);
      }

      // Step 4: Click Log in / Submit
      const loginButton = rule?.steps?.find(s => s.buttonText?.toLowerCase().includes("log"))?.buttonText || "Log in";
      logger.step(`Clicking "${loginButton}"...`);

      await wait(500);
      let loginClick = await extensionBridge.clickButton(loginButton, generalRules.socialLoginKeywords, tab_id);

      if (!loginClick.success) {
        // Try alternate login buttons
        for (const altButton of ["Sign in", "Submit", "Continue"]) {
          loginClick = await extensionBridge.clickButton(altButton, generalRules.socialLoginKeywords, tab_id);
          if (loginClick.success) break;
        }
      }

      loginHistory.logStep(
        "click_button",
        loginClick.success ? "success" : "failed",
        { buttonText: loginButton },
        loginClick.clicked || loginClick.error
      );
      results.push(`Login click: ${loginClick.clicked || loginClick.error}`);

      // Wait for login to process
      logger.step("Waiting for login to process...");
      await wait(generalRules.waitAfterSubmit);
      loginHistory.logStep("wait", "success", { duration: generalRules.waitAfterSubmit / 1000 });

      // Step 5: Handle 2FA if needed
      const tfaSource = rule?.twoFactorSource || "sms";
      const tfaSender = rule?.twoFactorSender;

      if (tfaSource !== "none") {
        logger.step(`Checking for 2FA code (source: ${tfaSource})...`);

        let tfaCode: string | null = null;

        if (tfaSource === "sms") {
          // Try to get code from Messages
          try {
            const searchResult = searchMessagesForCode({
              sender: tfaSender,
              maxAgeSeconds: 300
            });
            if (searchResult.found && searchResult.code) {
              tfaCode = searchResult.code;
              loginHistory.logStep(
                "get_2fa_code",
                "success",
                { source: "messages", sender: tfaSender },
                searchResult.sender
              );
              results.push(`2FA code found: ${tfaCode.substring(0, 2)}****`);
            }
          } catch (e) {
            logger.warn("Could not read Messages for 2FA code");
          }
        } else if (tfaSource === "totp") {
          // Try 1Password TOTP
          try {
            tfaCode = await onePasswordCLI.getTOTP(item_id);
            if (tfaCode) {
              loginHistory.logStep("get_2fa_code", "success", { source: "totp" });
              results.push("2FA code from 1Password TOTP");
            }
          } catch (e) {
            logger.warn("Could not get TOTP from 1Password");
          }
        }

        if (tfaCode) {
          // Fill the 2FA code
          logger.step("Filling 2FA code...");
          const tfaFill = await extensionBridge.fillTotp(tfaCode, tab_id);

          loginHistory.logStep(
            "fill_totp",
            tfaFill.success ? "success" : "failed",
            {},
            tfaFill.error
          );
          results.push(`2FA fill: ${tfaFill.success ? "success" : tfaFill.error}`);

          if (tfaFill.success) {
            // Click confirm/next
            await wait(500);
            let tfaConfirm = await extensionBridge.clickButton("Next", [], tab_id);
            if (!tfaConfirm.success) {
              tfaConfirm = await extensionBridge.clickButton("Verify", [], tab_id);
            }
            if (!tfaConfirm.success) {
              tfaConfirm = await extensionBridge.clickButton("Submit", [], tab_id);
            }

            loginHistory.logStep(
              "click_button",
              tfaConfirm.success ? "success" : "failed",
              { buttonText: "Next/Verify" },
              tfaConfirm.clicked || tfaConfirm.error
            );
            results.push(`2FA confirm: ${tfaConfirm.clicked || tfaConfirm.error}`);

            await wait(generalRules.waitAfterSubmit);
          }
        } else {
          // 2FA was expected but no code found - mark as pending
          results.push("No 2FA code found - login pending 2FA verification");
          loginHistory.logStep("get_2fa_code", "failed", { source: tfaSource }, "No code found");

          // Complete as pending_2fa
          const attempt = loginHistory.completeAttempt(
            "pending_2fa",
            "Waiting for 2FA code",
            "2FA required but no code found automatically"
          );
          if (attempt) {
            ruleEngine.learnFromAttempt(attempt);
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: false,
                  pending_2fa: true,
                  domain,
                  username,
                  attemptId,
                  steps: results,
                  message: "Login requires 2FA. Please enter the code manually or try get_2fa_code.",
                }, null, 2),
              },
            ],
          };
        }
      }

      success = true;
      logger.success("Smart login completed");

    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Smart login failed: ${errorMessage}`);
      results.push(`Error: ${errorMessage}`);
    }

    // Complete the attempt and learn from it
    const attempt = loginHistory.completeAttempt(
      success ? "success" : "failed",
      success ? "Login flow completed" : undefined,
      errorMessage
    );

    // Learn from this attempt
    if (attempt) {
      ruleEngine.learnFromAttempt(attempt);
      logger.step("Learned from this attempt");
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success,
            domain,
            attemptId,
            steps: results,
            ruleUsed: rule ? {
              flowType: rule.flowType,
              confidence: rule.confidence,
              learnedFrom: rule.learnedFrom,
            } : "No existing rule - learning from this attempt",
            error: errorMessage,
          }, null, 2),
        },
      ],
    };
  },
};
