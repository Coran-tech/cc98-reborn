import { env } from "cloudflare:workers";
import { allowedExtensionOrigin } from "@/lib/extension-origin";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 15 * 60 * 1000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, "Question database is unavailable");
  return env.DB;
}

export function apiResponse(request: Request, body: unknown, status = 200): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  });
  const origin = allowedExtensionOrigin(request.headers.get("Origin"));
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

export function apiOptions(request: Request): Response {
  const origin = allowedExtensionOrigin(request.headers.get("Origin"));
  if (!origin) {
    return apiResponse(request, { error: "Origin not allowed" }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function assertOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && !allowedExtensionOrigin(origin)) throw new ApiError(403, "Origin not allowed");
}

export function apiFailure(request: Request, error: unknown): Response {
  if (error instanceof ApiError) return apiResponse(request, { error: error.message }, error.status);
  return apiResponse(request, { error: "Service temporarily unavailable" }, 503);
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) {
    throw new ApiError(415, "Expected JSON");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new ApiError(413, "Request too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Invalid JSON object");
  }
}

export function onlyFields(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).length === fields.length
    && Object.keys(value).every((key) => fields.includes(key));
}

export function positiveInt(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max
    ? value : null;
}

export function randomToken(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

let hmacKey: Promise<CryptoKey> | undefined;

async function getHmacKey(): Promise<CryptoKey> {
  hmacKey ??= (async () => {
    const encoded = env.QUESTION_HMAC_SECRET;
    if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
      throw new ApiError(503, "Question identity key unavailable");
    }
    const value = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=");
    return crypto.subtle.importKey("raw", Uint8Array.from(value, (char) => char.charCodeAt(0)),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  })().catch((error) => {
    hmacKey = undefined;
    throw error;
  });
  return hmacKey;
}

export async function subjectHash(subject: string): Promise<string> {
  const digest = await crypto.subtle.sign("HMAC", await getHmacKey(),
    new TextEncoder().encode(`cc98-subject:${subject}`));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function rateLimit(request: Request, action: string, limit: number): Promise<void> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const window = Math.floor(Date.now() / 60_000);
  const key = await subjectHash(`rate:${action}:${ip}:${window}`);
  await database().prepare(
    "INSERT INTO question_rate_limits (rate_key, count, expires_at) VALUES (?, 1, ?) "
      + "ON CONFLICT(rate_key) DO UPDATE SET count = count + 1",
  ).bind(key, (window + 2) * 60_000).run();
  const row = await database().prepare(
    "SELECT count FROM question_rate_limits WHERE rate_key = ?",
  ).bind(key).first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new ApiError(429, "Too many requests");
}

export async function requireSession(request: Request): Promise<string> {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("Authorization") || "")?.[1];
  if (!token) throw new ApiError(401, "Session expired");
  const hash = await sha256Hex(token);
  const session = await database().prepare(
    "SELECT subject_hash FROM question_sessions WHERE token_hash = ? AND expires_at > ?",
  ).bind(hash, Date.now()).first<{ subject_hash: string }>();
  if (!session) throw new ApiError(401, "Session expired");
  return session.subject_hash;
}
