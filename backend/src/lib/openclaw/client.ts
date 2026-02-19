import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";

const PROTOCOL_VERSION = 3;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(config.openclawGatewayUrl);

      this.ws.on("open", () => {
        // Send the required connect handshake
        this.sendHandshake();
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Handle response frames (type: "res")
          if (msg.type === "res" && msg.id && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            clearTimeout(p.timeout);
            this.pending.delete(msg.id);
            if (!msg.ok) {
              p.reject(new Error(msg.error?.message || "OpenClaw request failed"));
            } else {
              p.resolve(msg.result);
            }
            return;
          }

          // Handle event frames (type: "evt") like ticks
          if (msg.type === "evt") {
            // Ignore tick events, shutdown events, etc.
            return;
          }
        } catch (err) {
          console.error("Failed to parse OpenClaw message:", err);
        }
      });

      this.ws.on("close", () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (wasConnected) {
          console.log("Disconnected from OpenClaw gateway");
        }
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        console.error("OpenClaw WebSocket error:", err.message);
        if (!this.connected) reject(err);
      });

      // The connect handshake response will resolve this promise
      const handshakeId = "handshake-" + uuid();
      const handshakeTimeout = setTimeout(() => {
        this.pending.delete(handshakeId);
        reject(new Error("OpenClaw handshake timed out"));
      }, 15000);

      this.pending.set(handshakeId, {
        resolve: () => {
          clearTimeout(handshakeTimeout);
          console.log("Connected to OpenClaw gateway");
          this.connected = true;
          resolve();
        },
        reject: (err) => {
          clearTimeout(handshakeTimeout);
          reject(err);
        },
        timeout: handshakeTimeout,
      });

      // Store the handshake ID so sendHandshake can use it
      this._handshakeId = handshakeId;
    });
  }

  private _handshakeId: string | null = null;

  private sendHandshake() {
    if (!this.ws || !this._handshakeId) return;

    const auth = config.openclawGatewayToken
      ? { token: config.openclawGatewayToken }
      : undefined;

    this.ws.send(JSON.stringify({
      type: "req",
      id: this._handshakeId,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: "gateway-client",
          displayName: "TrendClaw Backend",
          version: "1.0.0",
          platform: "linux",
          mode: "backend",
        },
        caps: [],
        role: "operator",
        scopes: ["operator.admin"],
        auth,
      },
    }));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        console.error("OpenClaw reconnect failed, will retry...");
        this.scheduleReconnect();
      }
    }, 5000);
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected to OpenClaw gateway");
    }

    const id = uuid();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw request timed out: ${method}`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timeout });

      this.ws!.send(JSON.stringify({
        type: "req",
        id,
        method,
        params,
      }));
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export const openclawClient = new OpenClawClient();
