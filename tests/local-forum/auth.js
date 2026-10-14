const crypto = require("crypto");

const PASSWORD_SCHEME = "scrypt-v1";
const PASSWORD_KEY_BYTES = 32;
const TOKEN_BYTES = 32;

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const normalized = String(password ?? "");
  const derived = crypto.scryptSync(normalized, salt, PASSWORD_KEY_BYTES, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });
  return `${PASSWORD_SCHEME}$${base64Url(salt)}$${base64Url(derived)}`;
}

function verifyPassword(password, encoded) {
  const [scheme, saltValue, hashValue] = String(encoded || "").split("$");
  if (scheme !== PASSWORD_SCHEME || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, "base64url");
    const actual = crypto.scryptSync(String(password ?? ""), Buffer.from(saltValue, "base64url"), expected.length, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function createOpaqueToken(prefix = "cc98-local") {
  return `${prefix}-${base64Url(crypto.randomBytes(TOKEN_BYTES))}`;
}

function digestToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function extractBearerToken(req) {
  const authorization = String(req?.headers?.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  // The standalone local account shell may restore a strict-mode page from
  // its HttpOnly session cookie. This sentinel keeps the upstream frontend's
  // login checks satisfied while authentication still comes from the cookie.
  if (match && match[1].trim() !== "cc98-local-cookie-session") return match[1].trim();
  const cookie = String(req?.headers?.cookie || "");
  const cookieMatch = /(?:^|;\s*)cc98_local_session=([^;]+)/.exec(cookie);
  if (!cookieMatch) return "";
  try {
    return decodeURIComponent(cookieMatch[1]);
  } catch {
    return "";
  }
}

function validateUserName(value) {
  const userName = String(value ?? "").normalize("NFKC").trim();
  if (userName.length < 2 || userName.length > 32) return { ok: false, error: "username_length" };
  if (/\s|[\u0000-\u001f\u007f]/.test(userName)) return { ok: false, error: "username_characters" };
  if (!/^[\p{L}\p{N}_-]+$/u.test(userName)) return { ok: false, error: "username_characters" };
  return { ok: true, value: userName };
}

function validatePassword(value) {
  const password = String(value ?? "");
  if (password.length < 8) return { ok: false, error: "password_too_short" };
  if (password.length > 128) return { ok: false, error: "password_too_long" };
  if (/\u0000/.test(password)) return { ok: false, error: "password_characters" };
  return { ok: true, value: password };
}

function normalizeRoles(value, fallback = ["member"]) {
  const allowed = new Set(["member", "boardModerator", "siteAdmin"]);
  const roles = [...new Set((Array.isArray(value) ? value : fallback).map(String).filter((role) => allowed.has(role)))];
  if (!roles.includes("member")) roles.unshift("member");
  return roles;
}

function isSiteAdmin(user) {
  return Boolean(user && normalizeRoles(user.roles).includes("siteAdmin"));
}

function isBoardModerator(user, board) {
  if (!user || !board) return false;
  if (isSiteAdmin(user)) return true;
  const roles = normalizeRoles(user.roles);
  const moderatorIds = new Set([
    ...(Array.isArray(board.moderatorUserIds) ? board.moderatorUserIds : []),
    ...(Array.isArray(board.boardMasterIds) ? board.boardMasterIds : [])
  ].map(Number));
  const moderatorNames = new Set([
    ...(Array.isArray(board.boardMasters) ? board.boardMasters : []),
    ...(Array.isArray(board.masters) ? board.masters : [])
  ].map((name) => String(name).toLowerCase()));
  return roles.includes("boardModerator")
    && (moderatorIds.has(Number(user.id)) || moderatorNames.has(String(user.name).toLowerCase()));
}

function sanitizeUser(user, options = {}) {
  if (!user) return null;
  const {
    passwordHash,
    passwordChangedAt,
    failedLoginCount,
    lockedUntil,
    ...safe
  } = user;
  if (!options.includeRoles) delete safe.roles;
  return safe;
}

module.exports = {
  createOpaqueToken,
  digestToken,
  extractBearerToken,
  hashPassword,
  isBoardModerator,
  isSiteAdmin,
  normalizeRoles,
  sanitizeUser,
  validatePassword,
  validateUserName,
  verifyPassword
};
