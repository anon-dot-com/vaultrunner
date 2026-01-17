/**
 * Code Extractor
 * Extracts verification codes from message/email text
 *
 * Flexible approach: looks for digit sequences in messages that appear
 * to be verification-related, with varying confidence levels.
 */

export interface ExtractedCode {
  code: string;
  confidence: "high" | "medium" | "low";
  pattern: string;
}

// High-confidence keywords that strongly indicate a verification code
const HIGH_CONFIDENCE_KEYWORDS = [
  "code", "verify", "verification", "otp", "passcode",
  "confirm", "authenticate", "2fa", "two-factor", "one-time",
  "security code", "login code", "authentication code"
];

// Medium-confidence keywords (might be verification-related)
const MEDIUM_CONFIDENCE_KEYWORDS = [
  "password", "login", "sign in", "sign-in", "signin",
  "access", "token", "pin", "security", "temporary"
];

// Common 2FA sender patterns (phone numbers, short codes, services)
const LIKELY_2FA_SENDERS = [
  /^\d{5,6}$/,           // Short codes (e.g., 40404, 12345)
  /^\+\d{10,}/,          // Phone numbers with country code
  /verify|auth|secure|noreply|alert/i,  // Common verification sender names
];

// Pattern to find 4-8 digit sequences (standalone numbers)
const DIGIT_PATTERN = /\b(\d{4,8})\b/g;

// Pattern for codes with separators (e.g., "123-456" or "123 456")
const CODE_WITH_SEPARATOR = /\b(\d{3}[-\s]?\d{3})\b/g;

/**
 * Check if sender looks like a 2FA source
 */
function isLikely2FASender(sender: string): boolean {
  if (!sender) return false;
  return LIKELY_2FA_SENDERS.some(pattern => pattern.test(sender));
}

/**
 * Extract verification code from text
 * @param text The message or email text to search
 * @param sender Optional sender for additional context
 * @returns Extracted code info or null if no code found
 */
export function extractCode(text: string, sender?: string): ExtractedCode | null {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  // Check for high-confidence keywords
  const hasHighKeyword = HIGH_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));

  // Check for medium-confidence keywords
  const hasMediumKeyword = MEDIUM_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));

  // Check if sender looks like a 2FA source
  const is2FASender = sender ? isLikely2FASender(sender) : false;

  // Find codes with separators first (e.g., "123-456")
  const separatedMatches = [...text.matchAll(CODE_WITH_SEPARATOR)];
  if (separatedMatches.length > 0) {
    const code = separatedMatches[0][1].replace(/[-\s]/g, "");
    return {
      code,
      confidence: hasHighKeyword ? "high" : (hasMediumKeyword || is2FASender) ? "medium" : "low",
      pattern: "code with separator",
    };
  }

  // Find all digit sequences
  const matches = [...text.matchAll(DIGIT_PATTERN)];
  if (matches.length === 0) return null;

  // Prefer 6-digit codes (most common for 2FA)
  const sixDigitMatch = matches.find(m => m[1].length === 6);
  const code = sixDigitMatch ? sixDigitMatch[1] : matches[0][1];

  // Determine confidence
  let confidence: "high" | "medium" | "low";
  if (hasHighKeyword) {
    confidence = "high";
  } else if (hasMediumKeyword || is2FASender) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    code,
    confidence,
    pattern: hasHighKeyword ? "high-confidence keyword + digits" :
             hasMediumKeyword ? "medium-confidence keyword + digits" :
             is2FASender ? "2FA sender + digits" : "digits only",
  };
}

/**
 * Check if text likely contains a verification code
 * More permissive than before - accepts messages from likely 2FA senders
 * even without explicit keywords
 */
export function likelyContainsCode(text: string, sender?: string): boolean {
  if (!text) return false;

  const lowerText = text.toLowerCase();
  const hasHighKeyword = HIGH_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasMediumKeyword = MEDIUM_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasDigits = /\d{4,8}/.test(text) || CODE_WITH_SEPARATOR.test(text);
  const is2FASender = sender ? isLikely2FASender(sender) : false;

  // Accept if: (has any keyword AND digits) OR (is 2FA sender AND has digits)
  // This is more permissive than requiring both keywords and digits
  return hasDigits && (hasHighKeyword || hasMediumKeyword || is2FASender);
}

/**
 * Extract all potential codes from text (for debugging/testing)
 */
export function extractAllCodes(text: string, sender?: string): ExtractedCode[] {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const hasHighKeyword = HIGH_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasMediumKeyword = MEDIUM_CONFIDENCE_KEYWORDS.some(kw => lowerText.includes(kw));
  const is2FASender = sender ? isLikely2FASender(sender) : false;

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
      confidence: hasHighKeyword ? "high" as const : (hasMediumKeyword || is2FASender) ? "medium" as const : "low" as const,
      pattern: hasHighKeyword ? "high-confidence keyword + digits" :
               hasMediumKeyword ? "medium-confidence keyword + digits" :
               is2FASender ? "2FA sender + digits" : "digits only",
    }));
}
