/**
 * Code Extractor
 * Extracts verification codes from message/email text using regex patterns
 */

export interface ExtractedCode {
  code: string;
  confidence: "high" | "medium" | "low";
  pattern: string;
}

/**
 * Patterns for extracting verification codes, ordered by confidence
 * High confidence: Explicit mentions of "code", "verification", etc.
 * Medium confidence: Standalone digit sequences in typical code formats
 * Low confidence: Any digit sequence that could be a code
 */
const CODE_PATTERNS: Array<{ pattern: RegExp; confidence: "high" | "medium" | "low"; name: string }> = [
  // High confidence - explicit code mentions
  { pattern: /(?:verification|verify|security)\s*code[:\s]+(\d{4,8})/i, confidence: "high", name: "verification code" },
  { pattern: /(?:your|the)\s*code\s*(?:is)?[:\s]+(\d{4,8})/i, confidence: "high", name: "your code is" },
  { pattern: /code[:\s]+(\d{4,8})/i, confidence: "high", name: "code:" },
  { pattern: /OTP[:\s]+(\d{4,8})/i, confidence: "high", name: "OTP" },
  { pattern: /one.?time\s*(?:password|code|pin)[:\s]+(\d{4,8})/i, confidence: "high", name: "one-time password" },
  { pattern: /PIN[:\s]+(\d{4,8})/i, confidence: "high", name: "PIN" },
  { pattern: /passcode[:\s]+(\d{4,8})/i, confidence: "high", name: "passcode" },
  { pattern: /(\d{4,8})\s*is\s*your\s*(?:verification|security|login)?\s*code/i, confidence: "high", name: "X is your code" },
  { pattern: /use\s*(\d{4,8})\s*(?:to|as|for)/i, confidence: "high", name: "use X to" },

  // Medium confidence - common patterns without explicit "code" mention
  { pattern: /(\d{6})\s*[-–]\s*\w+/i, confidence: "medium", name: "6-digit with suffix" },
  { pattern: /enter[:\s]+(\d{4,8})/i, confidence: "medium", name: "enter X" },
  { pattern: /confirm[:\s]+(\d{4,8})/i, confidence: "medium", name: "confirm X" },

  // Low confidence - standalone digit sequences (only 6 digits, most common for 2FA)
  { pattern: /\b(\d{6})\b/, confidence: "low", name: "standalone 6-digit" },
];

/**
 * Extract verification code from text
 * @param text The message or email text to search
 * @returns Extracted code info or null if no code found
 */
export function extractCode(text: string): ExtractedCode | null {
  if (!text) return null;

  // Normalize whitespace
  const normalizedText = text.replace(/\s+/g, " ").trim();

  for (const { pattern, confidence, name } of CODE_PATTERNS) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      return {
        code: match[1],
        confidence,
        pattern: name,
      };
    }
  }

  return null;
}

/**
 * Check if text likely contains a verification code
 * Faster than extractCode for filtering
 */
export function likelyContainsCode(text: string): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();

  // Quick keyword check
  const keywords = ["code", "verify", "verification", "otp", "pin", "passcode", "confirm", "login"];
  const hasKeyword = keywords.some(kw => lowerText.includes(kw));

  // Has a digit sequence
  const hasDigits = /\d{4,8}/.test(text);

  return hasKeyword && hasDigits;
}

/**
 * Extract all potential codes from text (for debugging/testing)
 */
export function extractAllCodes(text: string): ExtractedCode[] {
  if (!text) return [];

  const normalizedText = text.replace(/\s+/g, " ").trim();
  const results: ExtractedCode[] = [];
  const seenCodes = new Set<string>();

  for (const { pattern, confidence, name } of CODE_PATTERNS) {
    // Use matchAll for patterns that could match multiple times
    const globalPattern = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g"));
    const matches = normalizedText.matchAll(globalPattern);

    for (const match of matches) {
      if (match[1] && !seenCodes.has(match[1])) {
        seenCodes.add(match[1]);
        results.push({
          code: match[1],
          confidence,
          pattern: name,
        });
      }
    }
  }

  // Sort by confidence
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  return results;
}
