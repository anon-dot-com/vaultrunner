import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

const BRIDGE_PORT = 19876;
const PING_INTERVAL_MS = 10000; // Ping every 10 seconds
const PONG_TIMEOUT_MS = 5000; // Consider dead if no pong within 5 seconds

interface ResponsePayload {
  success: boolean;
  filledFields?: string[];
  clicked?: string;
  error?: string;
}

interface Response {
  type: string;
  id: string;
  payload: ResponsePayload;
}

type PendingRequest = {
  resolve: (response: ResponsePayload) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * Bridge for communicating with the Chrome extension via WebSocket
 */
export class ExtensionBridge {
  private wss: WebSocketServer | null = null;
  private connectedExtension: WebSocket | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private isStarted = false;
  private _isConnected = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;

  /**
   * Start the WebSocket server
   */
  start(): void {
    if (this.isStarted) return;

    this.wss = new WebSocketServer({ port: BRIDGE_PORT });
    this.isStarted = true;

    console.error(`[VaultRunner] WebSocket bridge listening on port ${BRIDGE_PORT}`);

    this.wss.on("connection", (ws) => {
      console.error("[VaultRunner] Chrome extension connected");

      // Clean up any existing connection
      this.cleanupConnection();

      this.connectedExtension = ws;
      this._isConnected = true;

      // Set up ping/pong heartbeat
      this.startHeartbeat(ws);

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as Response;
          this.handleMessage(message);
        } catch (error) {
          console.error("[VaultRunner] Failed to parse message:", error);
        }
      });

      ws.on("pong", () => {
        // Connection is alive, clear the pong timeout
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
      });

      ws.on("close", () => {
        console.error("[VaultRunner] Chrome extension disconnected");
        if (this.connectedExtension === ws) {
          this.cleanupConnection();
        }
      });

      ws.on("error", (error) => {
        console.error("[VaultRunner] WebSocket error:", error);
        if (this.connectedExtension === ws) {
          this.cleanupConnection();
        }
      });
    });

    this.wss.on("error", (error) => {
      console.error("[VaultRunner] WebSocket server error:", error);
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    this.cleanupConnection();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.isStarted = false;
    }
  }

  /**
   * Clean up connection state and timers
   */
  private cleanupConnection(): void {
    this._isConnected = false;
    this.connectedExtension = null;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Start heartbeat ping/pong to detect dead connections
   */
  private startHeartbeat(ws: WebSocket): void {
    this.pingInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.cleanupConnection();
        return;
      }

      // Send ping
      ws.ping();

      // Set timeout for pong response
      this.pongTimeout = setTimeout(() => {
        console.error("[VaultRunner] No pong received, connection dead");
        this.cleanupConnection();
        ws.terminate();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  /**
   * Check if extension is connected
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Send a request to the extension and wait for response
   */
  private async sendRequest(
    type: string,
    payload: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<ResponsePayload> {
    if (!this.isConnected()) {
      return {
        success: false,
        error: "Chrome extension not connected. Please ensure VaultRunner extension is installed and running.",
      };
    }

    const requestId = randomUUID();
    const request = {
      type,
      id: requestId,
      payload,
    };

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          success: false,
          error: "Request timed out waiting for extension response",
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject: () => {},
        timeout
      });

      try {
        this.connectedExtension!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        this.cleanupConnection();
        resolve({
          success: false,
          error: "Failed to send request: connection lost",
        });
      }
    });
  }

  /**
   * Send credentials to the extension for filling
   */
  async fillCredentials(
    credentials: { username: string; password: string },
    tabId?: number
  ): Promise<ResponsePayload> {
    return this.sendRequest("fill_credentials", { tabId, credentials });
  }

  /**
   * Click the submit button on the page
   */
  async clickSubmit(tabId?: number): Promise<ResponsePayload> {
    return this.sendRequest("click_submit", { tabId });
  }

  /**
   * Fill a TOTP code on the page
   */
  async fillTotp(code: string, tabId?: number): Promise<ResponsePayload> {
    return this.sendRequest("fill_totp", { tabId, code });
  }

  /**
   * Click a button by its text content
   */
  async clickButton(buttonText: string, excludeTexts?: string[], tabId?: number): Promise<ResponsePayload> {
    return this.sendRequest("click_button", { tabId, buttonText, excludeTexts });
  }

  /**
   * Handle incoming messages from the extension
   */
  private handleMessage(message: Response): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);
      pending.resolve(message.payload);
    }
  }
}

// Singleton instance
export const extensionBridge = new ExtensionBridge();
