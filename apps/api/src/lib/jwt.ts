import { type JWTPayload, jwtVerify, SignJWT } from "jose";

const ISSUER = "g3leads-api";

/**
 * Each portal has its own secret AND its own audience. A token minted for one
 * audience fails verification for every other, even if the secrets leaked
 * into the wrong service.
 */
export const AUDIENCE = {
  tenant: "g3leads:tenant",
  admin: "g3leads:platform-admin",
  adminMfa: "g3leads:platform-admin:mfa",
} as const;
type Audience = (typeof AUDIENCE)[keyof typeof AUDIENCE];

const keyCache = new Map<string, Uint8Array>();
const key = (secret: string) => {
  let k = keyCache.get(secret);
  if (!k) {
    k = new TextEncoder().encode(secret);
    keyCache.set(secret, k);
  }
  return k;
};

export function signJwt(secret: string, audience: Audience, claims: JWTPayload & { sub: string }, ttl: string) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key(secret));
}

export async function verifyJwt<T extends JWTPayload>(secret: string, audience: Audience, token: string) {
  const { payload } = await jwtVerify<T>(token, key(secret), {
    issuer: ISSUER,
    audience,
    algorithms: ["HS256"],
  });
  return payload;
}

export interface TenantClaims extends JWTPayload {
  sub: string; // user_id
  org: string; // org_id
  role: string; // role_id
  pos: string | null; // position label
}
