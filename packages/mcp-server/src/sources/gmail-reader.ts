/**
 * Gmail Reader
 * Searches Gmail for verification codes using the Gmail API
 */

import { getGmailClient, isGmailConfigured, getConfiguredEmail } from "./gmail-oauth.js";
import { extractCode, likelyContainsCode } from "./code-extractor.js";

export interface GmailSearchResult {
  found: boolean;
  code?: string;
  confidence?: "high" | "medium" | "low";
  sender?: string;
  subject?: string;
  receivedAt?: string;
  messagePreview?: string;
  error?: string;
}

/**
 * Check if Gmail source is available
 */
export function checkGmailAccess(): string | null {
  if (!isGmailConfigured()) {
    return "Gmail not configured. Run 'vaultrunner setup-gmail' to connect your Gmail account.";
  }
  return null;
}

/**
 * Build Gmail search query for verification emails
 */
function buildSearchQuery(options: {
  sender?: string;
  maxAgeSeconds?: number;
}): string {
  const { sender, maxAgeSeconds = 300 } = options;

  const parts: string[] = [];

  // Time filter - Gmail uses newer_than with minutes/hours/days
  if (maxAgeSeconds <= 60) {
    parts.push("newer_than:1m");
  } else if (maxAgeSeconds <= 3600) {
    const minutes = Math.ceil(maxAgeSeconds / 60);
    parts.push(`newer_than:${minutes}m`);
  } else {
    const hours = Math.ceil(maxAgeSeconds / 3600);
    parts.push(`newer_than:${hours}h`);
  }

  // Sender filter
  if (sender) {
    parts.push(`from:${sender}`);
  }

  // Keywords that typically appear in verification emails
  parts.push("(subject:verification OR subject:code OR subject:verify OR subject:OTP OR subject:confirm OR subject:login OR subject:security OR from:noreply OR from:no-reply OR from:verify OR from:security)");

  return parts.join(" ");
}

/**
 * Decode email body from base64url encoding
 */
function decodeBody(data: string): string {
  // Gmail uses base64url encoding
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Extract text content from email parts (handles multipart messages)
 */
function extractTextFromParts(parts: any[]): string {
  let text = "";

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      text += decodeBody(part.body.data) + "\n";
    } else if (part.mimeType === "text/html" && part.body?.data && !text) {
      // Fall back to HTML if no plain text, strip tags
      const html = decodeBody(part.body.data);
      text += html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") + "\n";
    } else if (part.parts) {
      // Recursively handle nested parts
      text += extractTextFromParts(part.parts);
    }
  }

  return text;
}

/**
 * Search Gmail for verification codes
 */
export async function searchGmailForCode(options: {
  sender?: string;
  maxAgeSeconds?: number;
} = {}): Promise<GmailSearchResult> {
  const accessError = checkGmailAccess();
  if (accessError) {
    return { found: false, error: accessError };
  }

  const gmail = getGmailClient();
  if (!gmail) {
    return { found: false, error: "Failed to create Gmail client" };
  }

  try {
    const query = buildSearchQuery(options);

    // Search for matching emails
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });

    const messages = listResponse.data.messages || [];

    if (messages.length === 0) {
      return { found: false };
    }

    // Check each message for verification codes
    for (const msg of messages) {
      if (!msg.id) continue;

      const fullMessage = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = fullMessage.data.payload?.headers || [];
      const fromHeader = headers.find(h => h.name?.toLowerCase() === "from");
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === "subject");
      const dateHeader = headers.find(h => h.name?.toLowerCase() === "date");

      // Extract text content
      let textContent = "";
      const payload = fullMessage.data.payload;

      if (payload?.body?.data) {
        textContent = decodeBody(payload.body.data);
      } else if (payload?.parts) {
        textContent = extractTextFromParts(payload.parts);
      }

      // Also check subject line for codes
      const subject = subjectHeader?.value || "";
      const fullText = subject + " " + textContent;

      // Quick filter
      if (!likelyContainsCode(fullText)) {
        continue;
      }

      // Try to extract code
      const extracted = extractCode(fullText);
      if (extracted) {
        return {
          found: true,
          code: extracted.code,
          confidence: extracted.confidence,
          sender: fromHeader?.value || "Unknown",
          subject: subject,
          receivedAt: dateHeader?.value || new Date().toISOString(),
          messagePreview: textContent.substring(0, 100).trim() + (textContent.length > 100 ? "..." : ""),
        };
      }
    }

    return { found: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error searching Gmail";

    // Check for auth errors
    if (errorMessage.includes("invalid_grant") || errorMessage.includes("Token has been expired")) {
      return {
        found: false,
        error: "Gmail authorization expired. Run 'vaultrunner setup-gmail' to reconnect.",
      };
    }

    return { found: false, error: errorMessage };
  }
}

/**
 * Get Gmail configuration status
 */
export function getGmailStatus(): {
  configured: boolean;
  email?: string;
  error?: string;
} {
  if (!isGmailConfigured()) {
    return { configured: false };
  }

  const email = getConfiguredEmail();
  return {
    configured: true,
    email: email || undefined,
  };
}
