/**
 * VaultRunner Chrome Extension - Background Service Worker
 *
 * Connects to the VaultRunner MCP server via WebSocket and
 * coordinates credential filling in content scripts.
 */

const BRIDGE_URL = "ws://localhost:19876";
const RECONNECT_INTERVAL = 5000;
const KEEPALIVE_ALARM_NAME = "vaultrunner-keepalive";
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds (must be > 0.33 for Chrome)

interface FillRequest {
  type: "fill_credentials";
  id: string;
  payload: {
    tabId?: number;
    credentials: {
      username: string;
      password: string;
    };
  };
}

interface ClickSubmitRequest {
  type: "click_submit";
  id: string;
  payload: {
    tabId?: number;
  };
}

interface FillTotpRequest {
  type: "fill_totp";
  id: string;
  payload: {
    tabId?: number;
    code: string;
  };
}

interface ClickButtonRequest {
  type: "click_button";
  id: string;
  payload: {
    tabId?: number;
    buttonText: string;
    excludeTexts?: string[];
  };
}

type BridgeRequest = FillRequest | ClickSubmitRequest | FillTotpRequest | ClickButtonRequest;

interface BridgeResponse {
  type: "fill_result" | "click_result" | "totp_result" | "button_click_result";
  id: string;
  payload: {
    success: boolean;
    filledFields?: string[];
    clicked?: string;
    error?: string;
  };
}

let socket: WebSocket | null = null;
let isConnecting = false;

const MAX_CONTENT_SCRIPT_RETRIES = 3;
const RETRY_DELAY_MS = 500;

/**
 * Ensure content script is loaded in the tab
 * Returns true if content script is ready, false otherwise
 */
async function ensureContentScriptLoaded(tabId: number): Promise<boolean> {
  try {
    // First check if content script is already loaded by sending a ping
    const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return response?.pong === true;
  } catch {
    // Content script not loaded - try to inject it
    console.log(`[VaultRunner] Content script not loaded in tab ${tabId}, injecting...`);

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content.js"],
      });
      console.log(`[VaultRunner] Content script injected into tab ${tabId}`);

      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (injectError) {
      console.error(`[VaultRunner] Failed to inject content script:`, injectError);
      return false;
    }
  }
}

/**
 * Send a message to a tab with automatic content script injection and retry
 */
async function sendMessageWithRetry<T>(
  tabId: number,
  message: unknown,
  retries = MAX_CONTENT_SCRIPT_RETRIES
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Try to send the message
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a "receiving end does not exist" error
      if (errorMessage.includes("Receiving end does not exist") ||
          errorMessage.includes("Could not establish connection")) {

        if (attempt < retries) {
          console.log(`[VaultRunner] Content script not ready (attempt ${attempt + 1}/${retries + 1}), retrying...`);

          // Try to inject content script
          await ensureContentScriptLoaded(tabId);

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
      }

      // If we've exhausted retries or it's a different error, throw
      throw error;
    }
  }

  throw new Error("Failed to send message after all retries");
}

/**
 * Connect to the MCP server's WebSocket bridge
 */
function connect(): void {
  if (socket?.readyState === WebSocket.OPEN || isConnecting) {
    return;
  }

  isConnecting = true;
  console.log("[VaultRunner] Connecting to MCP server...");

  socket = new WebSocket(BRIDGE_URL);

  socket.onopen = () => {
    isConnecting = false;
    console.log("[VaultRunner] Connected to MCP server");
    updateIcon(true);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data) as BridgeRequest;
      let response: BridgeResponse;

      switch (message.type) {
        case "fill_credentials":
          response = await handleFillRequest(message);
          break;
        case "click_submit":
          response = await handleClickSubmitRequest(message);
          break;
        case "fill_totp":
          response = await handleFillTotpRequest(message);
          break;
        case "click_button":
          response = await handleClickButtonRequest(message);
          break;
        default:
          console.error("[VaultRunner] Unknown message type:", message);
          return;
      }

      socket?.send(JSON.stringify(response));
    } catch (error) {
      console.error("[VaultRunner] Error handling message:", error);
    }
  };

  socket.onclose = () => {
    isConnecting = false;
    console.log("[VaultRunner] Disconnected from MCP server");
    updateIcon(false);
    // Attempt to reconnect
    setTimeout(connect, RECONNECT_INTERVAL);
  };

  socket.onerror = (error) => {
    isConnecting = false;
    console.error("[VaultRunner] WebSocket error:", error);
    updateIcon(false);
  };
}

/**
 * Get target tab ID (specified or active)
 */
async function getTargetTabId(tabId?: number): Promise<number | null> {
  if (tabId !== undefined) {
    return tabId;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return activeTab?.id || null;
}

/**
 * Handle a fill credentials request from the MCP server
 */
async function handleFillRequest(request: FillRequest): Promise<BridgeResponse> {
  const { id, payload } = request;
  const { tabId, credentials } = payload;

  try {
    const targetTabId = await getTargetTabId(tabId);
    if (!targetTabId) {
      return {
        type: "fill_result",
        id,
        payload: {
          success: false,
          filledFields: [],
          error: "No active tab found",
        },
      };
    }

    const response = await sendMessageWithRetry<{ success: boolean; filledFields?: string[]; error?: string }>(
      targetTabId,
      { type: "fill_credentials", credentials }
    );

    return {
      type: "fill_result",
      id,
      payload: {
        success: response.success,
        filledFields: response.filledFields || [],
        error: response.error,
      },
    };
  } catch (error) {
    return {
      type: "fill_result",
      id,
      payload: {
        success: false,
        filledFields: [],
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Handle a click submit request from the MCP server
 */
async function handleClickSubmitRequest(request: ClickSubmitRequest): Promise<BridgeResponse> {
  const { id, payload } = request;
  const { tabId } = payload;

  try {
    const targetTabId = await getTargetTabId(tabId);
    if (!targetTabId) {
      return {
        type: "click_result",
        id,
        payload: {
          success: false,
          error: "No active tab found",
        },
      };
    }

    const response = await sendMessageWithRetry<{ success: boolean; clicked?: string; error?: string }>(
      targetTabId,
      { type: "click_submit" }
    );

    return {
      type: "click_result",
      id,
      payload: {
        success: response.success,
        clicked: response.clicked,
        error: response.error,
      },
    };
  } catch (error) {
    return {
      type: "click_result",
      id,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Handle a fill TOTP request from the MCP server
 */
async function handleFillTotpRequest(request: FillTotpRequest): Promise<BridgeResponse> {
  const { id, payload } = request;
  const { tabId, code } = payload;

  try {
    const targetTabId = await getTargetTabId(tabId);
    if (!targetTabId) {
      return {
        type: "totp_result",
        id,
        payload: {
          success: false,
          error: "No active tab found",
        },
      };
    }

    const response = await sendMessageWithRetry<{ success: boolean; filledFields?: string[]; error?: string }>(
      targetTabId,
      { type: "fill_totp", code }
    );

    return {
      type: "totp_result",
      id,
      payload: {
        success: response.success,
        filledFields: response.filledFields || [],
        error: response.error,
      },
    };
  } catch (error) {
    return {
      type: "totp_result",
      id,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Handle a click button request from the MCP server
 */
async function handleClickButtonRequest(request: ClickButtonRequest): Promise<BridgeResponse> {
  const { id, payload } = request;
  const { tabId, buttonText, excludeTexts } = payload;

  try {
    const targetTabId = await getTargetTabId(tabId);
    if (!targetTabId) {
      return {
        type: "button_click_result",
        id,
        payload: {
          success: false,
          error: "No active tab found",
        },
      };
    }

    const response = await sendMessageWithRetry<{ success: boolean; clicked?: string; error?: string }>(
      targetTabId,
      { type: "click_button", buttonText, excludeTexts }
    );

    return {
      type: "button_click_result",
      id,
      payload: {
        success: response.success,
        clicked: response.clicked,
        error: response.error,
      },
    };
  } catch (error) {
    return {
      type: "button_click_result",
      id,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * Update the extension icon based on connection status
 */
function updateIcon(connected: boolean): void {
  // Just update the title since we don't have icons yet
  chrome.action.setTitle({
    title: connected
      ? "VaultRunner - Connected"
      : "VaultRunner - Disconnected",
  });
}

// Connect on startup
connect();

// Also try to connect when the service worker wakes up
chrome.runtime.onStartup.addListener(connect);

// Handle extension icon click - show connection status
chrome.action.onClicked.addListener(() => {
  const status = socket?.readyState === WebSocket.OPEN ? "Connected" : "Disconnected";
  console.log(`[VaultRunner] Status: ${status}`);
});

/**
 * Keep-alive mechanism using Chrome Alarms API
 * This prevents the service worker from going dormant
 */
async function setupKeepAlive(): Promise<void> {
  // Create a recurring alarm to keep the service worker alive
  await chrome.alarms.create(KEEPALIVE_ALARM_NAME, {
    periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
  });
  console.log("[VaultRunner] Keep-alive alarm set up");
}

// Handle the keep-alive alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM_NAME) {
    // Check connection and reconnect if needed
    if (socket?.readyState !== WebSocket.OPEN) {
      console.log("[VaultRunner] Keep-alive: reconnecting...");
      connect();
    } else {
      console.log("[VaultRunner] Keep-alive: connection healthy");
    }
  }
});

// Set up keep-alive on install/update
chrome.runtime.onInstalled.addListener(setupKeepAlive);

// Also set up keep-alive now (in case service worker restarted)
setupKeepAlive();
