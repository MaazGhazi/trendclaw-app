import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "ws://localhost:18789",
  openclawWebhookToken: process.env.OPENCLAW_WEBHOOK_TOKEN || "",
  databaseUrl: process.env.DATABASE_URL || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
};
