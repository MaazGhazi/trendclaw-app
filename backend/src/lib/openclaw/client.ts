import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";

const PROTOCOL_VERSION = 3;

// --- Device identity helpers ---

type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" }) as Buffer;
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function signPayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, "utf8"), key);
  return base64UrlEncode(sig);
}

const IDENTITY_PATH = path.join(process.cwd(), ".device-identity.json");

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  try {
    if (fs.existsSync(IDENTITY_PATH)) {
      const raw = fs.readFileSync(IDENTITY_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.deviceId && parsed.publicKeyPem && parsed.privateKeyPem) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const deviceId = fingerprintPublicKey(publicKeyPem);
  const identity = { deviceId, publicKeyPem, privateKeyPem };

  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2) + "\n", { mode: 0o600 });
  return identity;
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
}): string {
  return [
    "v1",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
  ].join("|");
}

// --- Client ---

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
  private deviceIdentity: DeviceIdentity;

  constructor() {
    this.deviceIdentity = loadOrCreateDeviceIdentity();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(config.openclawGatewayUrl);
      const handshakeId = uuid();

      this.ws.on("open", () => {
        this.sendHandshake(handshakeId);
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());

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

          // Ignore event frames (ticks, etc.)
          if (msg.type === "evt") {
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

      // Wait for handshake response
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
    });
  }

  private sendHandshake(handshakeId: string) {
    if (!this.ws) return;

    const role = "operator";
    const scopes = ["operator.admin"];
    const clientId = "gateway-client";
    const clientMode = "backend";
    const token = config.openclawGatewayToken || undefined;
    const signedAtMs = Date.now();

    const payload = buildDeviceAuthPayload({
      deviceId: this.deviceIdentity.deviceId,
      clientId,
      clientMode,
      role,
      scopes,
      signedAtMs,
      token: token ?? null,
    });
    const signature = signPayload(this.deviceIdentity.privateKeyPem, payload);

    this.ws.send(JSON.stringify({
      type: "req",
      id: handshakeId,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: clientId,
          displayName: "TrendClaw Backend",
          version: "1.0.0",
          platform: "linux",
          mode: clientMode,
        },
        caps: [],
        role,
        scopes,
        auth: token ? { token } : undefined,
        device: {
          id: this.deviceIdentity.deviceId,
          publicKey: publicKeyRawBase64Url(this.deviceIdentity.publicKeyPem),
          signature,
          signedAt: signedAtMs,
        },
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
