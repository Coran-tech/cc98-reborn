import { importJWK } from "jose";
import { pinnedOfficialJwks } from "./cc98-openid.ts";

const ADMIN_KEY_FIELDS = new Set(["kty", "crv", "x", "y", "ext", "key_ops", "alg"]);

export async function updateMessage(challengeId: string, nonce: string, jwksJson: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jwksJson));
  const hex = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  return new TextEncoder().encode(`cc98-jwks-update-v1\n${challengeId}\n${nonce}\n${hex}`);
}

export async function adminPublicKey(raw: string): Promise<CryptoKey> {
  let key: Record<string, unknown>;
  try {
    if (raw.length > 1000) throw new Error();
    key = JSON.parse(raw) as Record<string, unknown>;
    if (!key || Array.isArray(key)
      || Object.keys(key).some((field) => !ADMIN_KEY_FIELDS.has(field))
      || key.kty !== "EC" || key.crv !== "P-256"
      || typeof key.x !== "string" || typeof key.y !== "string"
      || !/^[A-Za-z0-9_-]{43}$/.test(key.x)
      || !/^[A-Za-z0-9_-]{43}$/.test(key.y)) throw new Error();
    return await crypto.subtle.importKey("jwk", key as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch {
    throw new Error("Invalid administrator public key");
  }
}

export async function verifyAdminSignature(
  publicKeyJson: string, message: Uint8Array, signature: string,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  const key = await adminPublicKey(publicKeyJson);
  const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "=="),
    (char) => char.charCodeAt(0));
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key,
    new Uint8Array(bytes), new Uint8Array(message));
}

export async function parseOfficialJwks(raw: string): Promise<Array<Record<string, string>>> {
  pinnedOfficialJwks(raw);
  const keys = (JSON.parse(raw) as { keys: Array<Record<string, string>> }).keys;
  await Promise.all(keys.map((key) => importJWK(key, "RS256")));
  return keys;
}

export function keysOverlap(
  current: Array<Record<string, string>>, next: Array<Record<string, string>>,
): boolean {
  return current.some((oldKey) => next.some((newKey) =>
    oldKey.kid === newKey.kid && oldKey.n === newKey.n && oldKey.e === newKey.e));
}
