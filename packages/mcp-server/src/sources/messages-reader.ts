/**
 * macOS Messages Reader
 * Reads SMS/iMessage from the local Messages database
 * Requires Full Disk Access permission for the running process
 */

import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";
import { existsSync, accessSync, constants } from "fs";
import { extractCode, likelyContainsCode, type ExtractedCode } from "./code-extractor.js";

const MESSAGES_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

// macOS stores dates as seconds since 2001-01-01 (Core Data timestamp)
// We need to convert to Unix timestamp
const CORE_DATA_EPOCH = 978307200; // seconds between 1970-01-01 and 2001-01-01

export interface Message {
  text: string;
  sender: string;
  date: Date;
  isFromMe: boolean;
}

export interface MessagesSearchResult {
  found: boolean;
  code?: string;
  confidence?: "high" | "medium" | "low";
  sender?: string;
  receivedAt?: string;
  messagePreview?: string;
  error?: string;
}

/**
 * Check if Messages database is accessible
 * Returns error message if not accessible, null if accessible
 */
export function checkMessagesAccess(): string | null {
  if (!existsSync(MESSAGES_DB_PATH)) {
    return "Messages database not found. This feature requires macOS.";
  }

  try {
    accessSync(MESSAGES_DB_PATH, constants.R_OK);
    return null;
  } catch {
    return `Cannot read Messages database. Please grant Full Disk Access to your terminal app in System Settings > Privacy & Security > Full Disk Access.`;
  }
}

/**
 * Check if Messages source is configured and available
 */
export function isMessagesConfigured(): boolean {
  return checkMessagesAccess() === null;
}

/**
 * Convert Core Data timestamp (nanoseconds since 2001-01-01) to JavaScript Date
 */
function coreDataToDate(timestamp: number): Date {
  // Messages timestamps are in nanoseconds since 2001-01-01
  // Divide by 1e9 to get seconds, then add the epoch difference
  const unixSeconds = (timestamp / 1e9) + CORE_DATA_EPOCH;
  return new Date(unixSeconds * 1000);
}

/**
 * Get recent messages from the Messages database
 */
export function getRecentMessages(maxAgeSeconds: number = 300): Message[] {
  const accessError = checkMessagesAccess();
  if (accessError) {
    throw new Error(accessError);
  }

  const db = new Database(MESSAGES_DB_PATH, { readonly: true });

  try {
    // Calculate the cutoff timestamp in Core Data format (nanoseconds since 2001-01-01)
    const cutoffDate = Date.now() - (maxAgeSeconds * 1000);
    const cutoffCoreData = ((cutoffDate / 1000) - CORE_DATA_EPOCH) * 1e9;

    // Query recent messages
    // The schema joins message -> chat_message_join -> chat -> handle for sender info
    const query = `
      SELECT
        m.text,
        m.date,
        m.is_from_me,
        COALESCE(h.id, 'Unknown') as sender
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.date > ?
        AND m.text IS NOT NULL
        AND m.text != ''
      ORDER BY m.date DESC
      LIMIT 50
    `;

    const rows = db.prepare(query).all(cutoffCoreData) as Array<{
      text: string;
      date: number;
      is_from_me: number;
      sender: string;
    }>;

    return rows.map(row => ({
      text: row.text,
      sender: row.sender,
      date: coreDataToDate(row.date),
      isFromMe: row.is_from_me === 1,
    }));
  } finally {
    db.close();
  }
}

/**
 * Search for verification codes in recent messages
 */
export function searchMessagesForCode(options: {
  sender?: string;
  maxAgeSeconds?: number;
} = {}): MessagesSearchResult {
  const { sender, maxAgeSeconds = 300 } = options;

  const accessError = checkMessagesAccess();
  if (accessError) {
    return { found: false, error: accessError };
  }

  try {
    const messages = getRecentMessages(maxAgeSeconds);

    // Filter to incoming messages only (not sent by me)
    let candidates = messages.filter(m => !m.isFromMe);

    // Filter by sender if specified
    if (sender) {
      const senderLower = sender.toLowerCase();
      candidates = candidates.filter(m =>
        m.sender.toLowerCase().includes(senderLower) ||
        m.text.toLowerCase().includes(senderLower)
      );
    }

    // Quick filter for messages that might contain codes
    candidates = candidates.filter(m => likelyContainsCode(m.text));

    // Try to extract code from each candidate
    for (const message of candidates) {
      const extracted = extractCode(message.text);
      if (extracted) {
        return {
          found: true,
          code: extracted.code,
          confidence: extracted.confidence,
          sender: message.sender,
          receivedAt: message.date.toISOString(),
          messagePreview: message.text.substring(0, 100) + (message.text.length > 100 ? "..." : ""),
        };
      }
    }

    return { found: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error reading Messages";
    return { found: false, error: errorMessage };
  }
}
