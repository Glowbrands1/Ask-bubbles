import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { GOOGLE_TOKEN_ENCRYPTION_KEY_ENV, type EnvSource } from "./config";

/**
 * SEALING THE GOOGLE REFRESH TOKEN AT REST.
 *
 * A refresh token is a long-lived credential for a Google account. It is stored
 * sealed — AES-256-GCM with a fresh random 96-bit nonce per seal and an
 * "additional authenticated data" label — so a database dump or a read-only SQL
 * leak does not yield a usable token, and a sealed value cannot be swapped into
 * a different field (the label is part of the authentication).
 *
 * The key is `GOOGLE_TOKEN_ENCRYPTION_KEY`: 32 random bytes, base64. It lives in
 * the server environment and never reaches the database, a log line or a
 * browser. Errors here name the variable and nothing else — never the key, a
 * token, a nonce or a ciphertext.
 *
 * Format: `v1.<nonce>.<tag>.<ciphertext>`, each part base64url. The leading
 * version lets a later key rotation tell old and new seals apart.
 */

export class SealError extends Error {
  readonly code: "key_missing" | "key_invalid" | "format" | "authentication";
  constructor(code: SealError["code"]) {
    super(
      code === "key_missing"
        ? `${GOOGLE_TOKEN_ENCRYPTION_KEY_ENV} is not set.`
        : code === "key_invalid"
          ? `${GOOGLE_TOKEN_ENCRYPTION_KEY_ENV} must be 32 random bytes, base64 encoded.`
          : code === "format"
            ? "The sealed value is not in a recognised format."
            : "The sealed value could not be authenticated (wrong key, wrong label, or tampering).",
    );
    this.name = "SealError";
    this.code = code;
  }
}

/** Reads and validates the key. Returns a Buffer; never logs or returns the text. */
export function readEncryptionKey(env: EnvSource = process.env): Buffer {
  const raw = env[GOOGLE_TOKEN_ENCRYPTION_KEY_ENV]?.trim();
  if (!raw) throw new SealError("key_missing");
  const key = Buffer.from(raw, "base64");
  // base64 of 32 bytes is 44 characters with one '=' (or 43 without); reject anything that does not decode to exactly 32 bytes.
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) throw new SealError("key_invalid");
  return key;
}

export const REFRESH_TOKEN_LABEL = "google-business-refresh-token";
export const OAUTH_STATE_LABEL = "google-business-oauth-state";

export function seal(plaintext: string, label: string, key: Buffer = readEncryptionKey()): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(label, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", nonce.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function open(sealed: string, label: string, key: Buffer = readEncryptionKey()): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) {
    throw new SealError("format");
  }
  try {
    const nonce = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw new SealError("format");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(Buffer.from(label, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof SealError) throw error;
    throw new SealError("authentication");
  }
}

/** Constant-time string comparison (for the OAuth `state`). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
