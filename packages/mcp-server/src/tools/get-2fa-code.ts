/**
 * Get 2FA Code Tool
 * Unified MCP tool for retrieving verification codes from SMS and email sources
 */

import { z } from "zod";
import { logger } from "../utils/logger.js";
import { isMessagesConfigured, searchMessagesForCode } from "../sources/messages-reader.js";
import { searchGmailForCode, getGmailStatus } from "../sources/gmail-reader.js";
import { loginHistory } from "../learning/login-history.js";

export const get2faCodeTool = {
  name: "get_2fa_code",
  description: "Search for 2FA verification codes in SMS (Messages) and email (Gmail). Searches configured sources automatically.",
  inputSchema: z.object({
    sender: z.string().optional().describe("Filter by sender name or address (e.g., 'Chase', 'verify@github.com')"),
    max_age_seconds: z.number().optional().default(300).describe("Maximum age of messages to search (default: 300 = 5 minutes)"),
    source: z.enum(["messages", "gmail", "all"]).optional().default("all").describe("Which source to search: 'messages' (SMS/iMessage), 'gmail' (email), or 'all' (both)"),
  }),

  handler: async (input: {
    sender?: string;
    max_age_seconds?: number;
    source?: "messages" | "gmail" | "all";
  }) => {
    const { sender, max_age_seconds = 300, source = "all" } = input;

    logger.banner();
    logger.action("2FA Code", "Searching for verification codes");

    // Determine which sources are configured
    const messagesConfigured = isMessagesConfigured();
    const gmailStatus = getGmailStatus();
    const gmailConfigured = gmailStatus.configured;

    const configuredSources: string[] = [];
    if (messagesConfigured) configuredSources.push("messages");
    if (gmailConfigured) configuredSources.push("gmail");

    logger.step(`Configured sources: ${configuredSources.length > 0 ? configuredSources.join(", ") : "none"}`);

    if (configuredSources.length === 0) {
      logger.actionEnd(false, "No 2FA sources configured");
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            found: false,
            configured_sources: [],
            error: "No 2FA sources configured. For Messages: grant Full Disk Access. For Gmail: run 'vaultrunner setup-gmail'.",
          }),
        }],
      };
    }

    const searchOptions = { sender, maxAgeSeconds: max_age_seconds };

    // Search Messages first (faster, local)
    if ((source === "all" || source === "messages") && messagesConfigured) {
      logger.step("Searching Messages (SMS/iMessage)...");
      const messagesResult = searchMessagesForCode(searchOptions);

      if (messagesResult.found && messagesResult.code) {
        logger.actionEnd(true, `Found code ${messagesResult.code} from Messages`);

        // Auto-log to active session if one exists
        const activeSession = loginHistory.getCurrentAttempt();
        if (activeSession) {
          loginHistory.logStep(
            "get_2fa_code",
            "success",
            { source: "messages", sender: messagesResult.sender },
            `Found code from ${messagesResult.sender || "Messages"}`
          );
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              found: true,
              code: messagesResult.code,
              confidence: messagesResult.confidence,
              source: "messages",
              sender: messagesResult.sender,
              received_at: messagesResult.receivedAt,
              message_preview: messagesResult.messagePreview,
              configured_sources: configuredSources,
            }),
          }],
        };
      }

      if (messagesResult.error) {
        logger.step(`Messages error: ${messagesResult.error}`);
      } else {
        logger.step("No code found in Messages");
      }
    }

    // Search Gmail
    if ((source === "all" || source === "gmail") && gmailConfigured) {
      logger.step(`Searching Gmail (${gmailStatus.email})...`);
      const gmailResult = await searchGmailForCode(searchOptions);

      if (gmailResult.found && gmailResult.code) {
        logger.actionEnd(true, `Found code ${gmailResult.code} from Gmail`);

        // Auto-log to active session if one exists
        const activeSession = loginHistory.getCurrentAttempt();
        if (activeSession) {
          loginHistory.logStep(
            "get_2fa_code",
            "success",
            { source: "gmail", sender: gmailResult.sender },
            `Found code from ${gmailResult.sender || "Gmail"}`
          );
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              found: true,
              code: gmailResult.code,
              confidence: gmailResult.confidence,
              source: "gmail",
              sender: gmailResult.sender,
              subject: gmailResult.subject,
              received_at: gmailResult.receivedAt,
              message_preview: gmailResult.messagePreview,
              configured_sources: configuredSources,
            }),
          }],
        };
      }

      if (gmailResult.error) {
        logger.step(`Gmail error: ${gmailResult.error}`);
      } else {
        logger.step("No code found in Gmail");
      }
    }

    // No code found in any source
    logger.actionEnd(false, "No verification code found");

    // Auto-log to active session if one exists
    const activeSession = loginHistory.getCurrentAttempt();
    if (activeSession) {
      loginHistory.logStep(
        "get_2fa_code",
        "failed",
        { source, configuredSources },
        "No code found"
      );
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          found: false,
          configured_sources: configuredSources,
          searched_sources: source === "all" ? configuredSources : [source].filter(s => configuredSources.includes(s)),
        }),
      }],
    };
  },
};
