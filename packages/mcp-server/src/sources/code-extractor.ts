/**
 * Code Extractor
 * Extracts verification codes from message/email text
 *
 * Simple approach: if message contains verification keywords,
 * extract any 4-8 digit sequence found.
 */

export interface ExtractedCode {
  code: string;
  confidence: "high" | "medium" | "low";
  pattern: string;
}

// Keywords that indicate a message is about verification codes
const VERIFICATION_KEYWORDS = [
  "code", "verify", "verification", "otp", "pin", "passcode",
  "password", "confirm", "login", "sign in", "authenticate",
  "security", "2fa", "two-factor", "one-time"
];

// Pattern to find 4-8 digit sequences
const DIGIT_PATTERN = /\b(\d{4,8})\b/g;

/**
 * Extract verification code from text
 * @param text The message or email text to search
 * @returns Extracted code info or null if no code found
 */
export function extractCode(text: string): ExtractedCode | null {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  // Check if message contains verification keywords
  const hasKeyword = VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));

  // Find all digit sequences
  const matches = [...text.matchAll(DIGIT_PATTERN)];
  if (matches.length === 0) return null;

  // If message has verification keywords, return first code with high confidence
  // Otherwise return with low confidence (might be unrelated number)
  const code = matches[0][1];

  return {
    code,
    confidence: hasKeyword ? "high" : "low",
    pattern: hasKeyword ? "keyword + digits" : "digits only",
  };
}

/**
 * Check if text likely contains a verification code
 * Faster than extractCode for filtering
 */
export function likelyContainsCode(text: string): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();
  const hasKeyword = VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasDigits = /\d{4,8}/.test(text);

  return hasKeyword && hasDigits;
}

/**
 * Extract all potential codes from text (for debugging/testing)
 */
export function extractAllCodes(text: string): ExtractedCode[] {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const hasKeyword = VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));

  const matches = [...text.matchAll(DIGIT_PATTERN)];
  const seenCodes = new Set<string>();

  return matches
    .filter(match => {
      if (seenCodes.has(match[1])) return false;
      seenCodes.add(match[1]);
      return true;
    })
    .map(match => ({
      code: match[1],
      confidence: hasKeyword ? "high" as const : "low" as const,
      pattern: hasKeyword ? "keyword + digits" : "digits only",
    }));
}
