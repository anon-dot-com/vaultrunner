import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

const BRIDGE_PORT = 19876;

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
      this.connectedExtension = ws;

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as Response;
          this.handleMessage(message);
        } catch (error) {
          console.error("[VaultRunner] Failed to parse message:", error);
        }
      });

      ws.on("close", () => {
        console.error("[VaultRunner] Chrome extension disconnected");
        if (this.connectedExtension === ws) {
          this.connectedExtension = null;
        }
      });

      ws.on("error", (error) => {
        console.error("[VaultRunner] WebSocket error:", error);
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
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.isStarted = false;
    }
  }

  /**
   * Check if extension is connected
   */
  isConnected(): boolean {
    return (
      this.connectedExtension !== null &&
      this.connectedExtension.readyState === WebSocket.OPEN
    );
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
      this.connectedExtension!.send(JSON.stringify(request));
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
