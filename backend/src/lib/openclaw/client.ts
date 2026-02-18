import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";

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
        console.log("Connected to OpenClaw gateway");
        this.connected = true;
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            clearTimeout(p.timeout);
            this.pending.delete(msg.id);
            if (msg.error) {
              p.reject(new Error(msg.error.message || "OpenClaw request failed"));
            } else {
              p.resolve(msg.result);
            }
          }
        } catch (err) {
          console.error("Failed to parse OpenClaw message:", err);
        }
      });

      this.ws.on("close", () => {
        console.log("Disconnected from OpenClaw gateway");
        this.connected = false;
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        console.error("OpenClaw WebSocket error:", err.message);
        if (!this.connected) reject(err);
      });
    });
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
        jsonrpc: "2.0",
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
