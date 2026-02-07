import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { AppEnv } from "../config/env.js";

const VERSION = "v1";

export class TokenCrypto {
  constructor(private readonly key: Buffer) {}

  static fromEnv(env: AppEnv): TokenCrypto {
    const rawKey = env.TOKEN_ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error("Missing TOKEN_ENCRYPTION_KEY");
    }

    const key = decodeKey(rawKey);
    if (key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
    }

    return new TokenCrypto(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      toBase64Url(iv),
      toBase64Url(tag),
      toBase64Url(ciphertext)
    ].join(".");
  }

  decrypt(token: string): string {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error("Invalid encrypted token format");
    }

    const iv = fromBase64Url(parts[1] ?? "");
    const tag = fromBase64Url(parts[2] ?? "");
    const ciphertext = fromBase64Url(parts[3] ?? "");

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext.toString("utf8");
  }
}

function decodeKey(raw: string): Buffer {
  try {
    return fromBase64Url(raw);
  } catch {
    return createHash("sha256").update(raw, "utf8").digest();
  }
}

function toBase64Url(input: Buffer): string {
  return input.toString("base64url");
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}
