/**
 * VaultRunner Chrome Extension - Content Script
 *
 * Handles credential injection into login forms.
 * This script runs in the context of web pages.
 */

interface PingMessage {
  type: "ping";
}

interface FillMessage {
  type: "fill_credentials";
  credentials: {
    username: string;
    password: string;
  };
}

interface ClickSubmitMessage {
  type: "click_submit";
}

interface FillTotpMessage {
  type: "fill_totp";
  code: string;
}

interface ClickButtonMessage {
  type: "click_button";
  buttonText: string;
  excludeTexts?: string[];
}

type Message = PingMessage | FillMessage | ClickSubmitMessage | FillTotpMessage | ClickButtonMessage;

interface FillResult {
  success: boolean;
  filledFields: string[];
  error?: string;
}

interface ClickResult {
  success: boolean;
  clicked?: string;
  error?: string;
}

/**
 * Find the username/email input field
 */
function findUsernameField(): HTMLInputElement | null {
  // Common selectors for username/email fields
  const selectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[id="email"]',
    'input[id="username"]',
    'input[id="user"]',
    'input[id="login"]',
    'input[autocomplete="email"]',
    'input[autocomplete="username"]',
    'input[type="text"][name*="email"]',
    'input[type="text"][name*="user"]',
    'input[type="text"][id*="email"]',
    'input[type="text"][id*="user"]',
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field && isVisible(field)) {
      return field;
    }
  }

  // Fallback: find first visible text input that might be a username field
  const textInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="text"], input:not([type])'
  );
  for (const input of textInputs) {
    if (isVisible(input) && !isSearchField(input)) {
      return input;
    }
  }

  return null;
}

/**
 * Find the password input field
 */
function findPasswordField(): HTMLInputElement | null {
  const selectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="pass"]',
    'input[id="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field && isVisible(field)) {
      return field;
    }
  }

  return null;
}

/**
 * Check if an element is visible
 */
function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

/**
 * Check if an input is likely a search field
 */
function isSearchField(input: HTMLInputElement): boolean {
  const name = input.name?.toLowerCase() || "";
  const id = input.id?.toLowerCase() || "";
  const placeholder = input.placeholder?.toLowerCase() || "";
  const type = input.type?.toLowerCase() || "";

  return (
    type === "search" ||
    name.includes("search") ||
    id.includes("search") ||
    placeholder.includes("search")
  );
}

/**
 * Fill a value into an input field with proper event simulation
 */
function fillField(field: HTMLInputElement, value: string): void {
  // Focus the field
  field.focus();

  // Clear existing value
  field.value = "";

  // Set the new value
  field.value = value;

  // Dispatch input events to trigger any listeners
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  // Some frameworks need keydown/keyup events
  field.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

/**
 * Fill credentials into the page
 */
function fillCredentials(credentials: {
  username: string;
  password: string;
}): FillResult {
  const filledFields: string[] = [];
  const errors: string[] = [];

  // Find and fill username field
  const usernameField = findUsernameField();
  if (usernameField) {
    try {
      fillField(usernameField, credentials.username);
      filledFields.push("username");
    } catch (error) {
      errors.push(`Failed to fill username: ${error}`);
    }
  } else {
    errors.push("Could not find username/email field");
  }

  // Find and fill password field
  const passwordField = findPasswordField();
  if (passwordField) {
    try {
      fillField(passwordField, credentials.password);
      filledFields.push("password");
    } catch (error) {
      errors.push(`Failed to fill password: ${error}`);
    }
  } else {
    errors.push("Could not find password field");
  }

  const success = filledFields.length > 0;

  return {
    success,
    filledFields,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/**
 * Check if a button is a social login button (Google, Apple, Facebook, etc.)
 */
function isSocialLoginButton(button: HTMLElement): boolean {
  const text = button.textContent?.toLowerCase() || "";
  const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";
  const combined = text + " " + ariaLabel;

  const socialKeywords = ["google", "apple", "facebook", "twitter", "microsoft", "github", "linkedin"];
  return socialKeywords.some(keyword => combined.includes(keyword));
}

/**
 * Find and click a submit button
 */
function clickSubmit(): ClickResult {
  const buttons = document.querySelectorAll<HTMLButtonElement>("button");

  // Priority 1: Look for "Next" button specifically (for multi-step logins)
  for (const button of buttons) {
    const text = button.textContent?.toLowerCase().trim() || "";
    if (text === "next" && isVisible(button) && !isSocialLoginButton(button)) {
      button.click();
      return {
        success: true,
        clicked: `button with text "Next"`,
      };
    }
  }

  // Priority 2: Try explicit submit buttons (not social login)
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
  ];

  for (const selector of submitSelectors) {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    for (const element of elements) {
      if (isVisible(element) && !isSocialLoginButton(element)) {
        element.click();
        return {
          success: true,
          clicked: selector,
        };
      }
    }
  }

  // Priority 3: Find buttons by text content (excluding social login)
  const submitTexts = ["sign in", "log in", "login", "continue", "submit"];

  for (const button of buttons) {
    const text = button.textContent?.toLowerCase().trim() || "";
    if (submitTexts.some((t) => text.includes(t)) && isVisible(button) && !isSocialLoginButton(button)) {
      button.click();
      return {
        success: true,
        clicked: `button with text "${button.textContent?.trim()}"`,
      };
    }
  }

  // Priority 4: Find any submit button in a form (not social login)
  const forms = document.querySelectorAll("form");
  for (const form of forms) {
    const submitBtn = form.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], button:not([type])'
    );
    if (submitBtn && isVisible(submitBtn) && !isSocialLoginButton(submitBtn)) {
      submitBtn.click();
      return {
        success: true,
        clicked: "form submit button",
      };
    }
  }

  return {
    success: false,
    error: "Could not find a submit button",
  };
}

/**
 * Click a button by its text content
 */
function clickButtonByText(buttonText: string, excludeTexts: string[] = []): ClickResult {
  const buttons = document.querySelectorAll<HTMLButtonElement>("button");
  const targetText = buttonText.toLowerCase().trim();

  for (const button of buttons) {
    const text = button.textContent?.toLowerCase().trim() || "";

    // Check if this button matches the target text
    if (text.includes(targetText) && isVisible(button)) {
      // Check if it should be excluded
      const shouldExclude = excludeTexts.some(excludeText =>
        text.includes(excludeText.toLowerCase())
      );

      if (!shouldExclude) {
        button.click();
        return {
          success: true,
          clicked: `button with text "${button.textContent?.trim()}"`,
        };
      }
    }
  }

  return {
    success: false,
    error: `Could not find button with text "${buttonText}"`,
  };
}

/**
 * Find and fill a TOTP/OTP field
 */
function fillTotp(code: string): FillResult {
  // Common selectors for TOTP fields
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name="totp"]',
    'input[name="otp"]',
    'input[name="code"]',
    'input[name="verification_code"]',
    'input[name="mfa"]',
    'input[id="totp"]',
    'input[id="otp"]',
    'input[id="code"]',
    'input[placeholder*="code"]',
    'input[placeholder*="Code"]',
    'input[type="tel"][maxlength="6"]',
    'input[type="text"][maxlength="6"]',
    'input[inputmode="numeric"]',
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field && isVisible(field)) {
      fillField(field, code);
      return {
        success: true,
        filledFields: ["totp"],
      };
    }
  }

  return {
    success: false,
    filledFields: [],
    error: "Could not find TOTP/verification code field",
  };
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: FillResult | ClickResult | { pong: boolean }) => void
  ) => {
    console.log("[VaultRunner] Received message:", message.type);

    switch (message.type) {
      case "ping": {
        // Respond to ping to indicate content script is loaded
        sendResponse({ pong: true });
        break;
      }
      case "fill_credentials": {
        const result = fillCredentials(message.credentials);
        console.log("[VaultRunner] Fill result:", result);
        sendResponse(result);
        break;
      }
      case "click_submit": {
        const result = clickSubmit();
        console.log("[VaultRunner] Click result:", result);
        sendResponse(result);
        break;
      }
      case "fill_totp": {
        const result = fillTotp(message.code);
        console.log("[VaultRunner] TOTP fill result:", result);
        sendResponse(result);
        break;
      }
      case "click_button": {
        const result = clickButtonByText(message.buttonText, message.excludeTexts);
        console.log("[VaultRunner] Click button result:", result);
        sendResponse(result);
        break;
      }
    }

    return true; // Keep the message channel open for async response
  }
);

console.log("[VaultRunner] Content script loaded");
