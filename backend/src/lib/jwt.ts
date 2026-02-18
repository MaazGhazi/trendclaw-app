import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type TokenPayload = {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
};

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}
