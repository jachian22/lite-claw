import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashSecret(secret: string, pepper: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret + pepper, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, pepper: string, encodedHash: string): boolean {
  const [salt, stored] = encodedHash.split(":");
  if (!salt || !stored) {
    return false;
  }

  const calculated = scryptSync(secret + pepper, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(stored, "hex");
  if (storedBuffer.length !== calculated.length) {
    return false;
  }

  return timingSafeEqual(calculated, storedBuffer);
}
