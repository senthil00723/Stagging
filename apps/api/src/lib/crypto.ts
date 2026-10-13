import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const hashPassword = (password: string) => hash(password);

// Pre-computed hash so unknown-user logins cost the same as real ones.
const DUMMY_HASH = await hash("timing-equalizer-not-a-real-password");

export async function verifyPassword(hashed: string | undefined, password: string) {
  try {
    return await verify(hashed ?? DUMMY_HASH, password);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
