/**
 * Get 2FA Code Tool
 * Unified MCP tool for retrieving verification codes from SMS and email sources
 */

import { z } from "zod";
import { isMessagesConfigured, searchMessagesForCode } from "../sources/messages-reader.js";
import { searchGmailForCode, getGmailStatus } from "../sources/gmail-reader.js";
import { loginHistory } from "../history/login-history.js";

export const get2faCodeTool = {
  name: "get_2fa_code",
  description: "Get 2FA verification code from SMS (Messages) or email (Gmail). Use when the site sends a code via text or email. Searches recent messages automatically. Requires setup: run 'vaultrunner setup-gmail' for email codes.",
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

    // Determine which sources are configured
    const messagesConfigured = isMessagesConfigured();
    const gmailStatus = getGmailStatus();
    const gmailConfigured = gmailStatus.configured;

    const configuredSources: string[] = [];
    if (messagesConfigured) configuredSources.push("messages");
    if (gmailConfigured) configuredSources.push("gmail");

    if (configuredSources.length === 0) {
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
      const messagesResult = searchMessagesForCode(searchOptions);

      if (messagesResult.found && messagesResult.code) {
        // Auto-log and set 2FA type (works for auto-started sessions too)
        if (loginHistory.hasActiveSession()) {
          loginHistory.logToolStep("get_2fa_code", { source: "messages", sender: messagesResult.sender }, "success");
          loginHistory.setTwoFactorType("sms");
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
    }

    // Search Gmail
    if ((source === "all" || source === "gmail") && gmailConfigured) {
      const gmailResult = await searchGmailForCode(searchOptions);

      if (gmailResult.found && gmailResult.code) {
        // Auto-log and set 2FA type (works for auto-started sessions too)
        if (loginHistory.hasActiveSession()) {
          loginHistory.logToolStep("get_2fa_code", { source: "gmail", sender: gmailResult.sender }, "success");
          loginHistory.setTwoFactorType("email");
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
    }

    // No code found in any source
    // Auto-log failure if session is active
    if (loginHistory.hasActiveSession()) {
      loginHistory.logToolStep("get_2fa_code", { source, configuredSources }, "failed");
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
