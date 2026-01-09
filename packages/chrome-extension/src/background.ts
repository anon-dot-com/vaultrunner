/**
 * VaultRunner Chrome Extension - Background Service Worker
 *
 * Connects to the VaultRunner MCP server via WebSocket and
 * coordinates credential filling in content scripts.
 */

const BRIDGE_URL = "ws://localhost:19876";
const RECONNECT_INTERVAL = 5000;

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

type BridgeRequest = FillRequest | ClickSubmitRequest | FillTotpRequest;

interface BridgeResponse {
  type: "fill_result" | "click_result" | "totp_result";
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

    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: "fill_credentials",
      credentials,
    });

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

    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: "click_submit",
    });

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

    const response = await chrome.tabs.sendMessage(targetTabId, {
      type: "fill_totp",
      code,
    });

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
