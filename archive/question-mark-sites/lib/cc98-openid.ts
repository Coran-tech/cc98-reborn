import { createLocalJWKSet, createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";

export const CC98_ISSUER = "https://openid.cc98.org";
export const CC98_CLIENT_ID = "9ca359c2-4112-44de-6177-08debd80dfb1";
const CC98_JWKS_FALLBACK_URL = `${CC98_ISSUER}/.well-known/openid-configuration/jwks`;

let jwksPromise: Promise<JWTVerifyGetKey> | undefined;

class OpenIdCheckError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export function classifyOpenIdError(error: unknown): string {
  if (error instanceof OpenIdCheckError) return error.reason;
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "ERR_JWKS_TIMEOUT") return "jwks_timeout";
  if (code === "ERR_JWKS_NO_MATCHING_KEY") return "jwks_key_missing";
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return "signature";
  if (code === "ERR_JWT_EXPIRED") return "expired";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    const claim = error && typeof error === "object" && "claim" in error ? error.claim : null;
    return claim === "iss" || claim === "aud" || claim === "iat" || claim === "nbf"
      ? `claim_${claim}` : "claims";
  }
  if (code === "ERR_JOSE_ALG_NOT_ALLOWED") return "algorithm";
  return "validation_unknown";
}

async function officialJwks(): Promise<JWTVerifyGetKey> {
  jwksPromise ??= (async () => {
    let response: Response;
    try {
      response = await fetch(`${CC98_ISSUER}/.well-known/openid-configuration`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new OpenIdCheckError("discovery_unavailable");
    }
    if (response.status === 403) return remoteJwks(new URL(CC98_JWKS_FALLBACK_URL));
    if (!response.ok) throw new OpenIdCheckError(`discovery_http_${response.status}`);
    const metadata = await response.json() as { issuer?: string; jwks_uri?: string };
    if (metadata.issuer !== CC98_ISSUER || !metadata.jwks_uri) {
      throw new OpenIdCheckError("discovery_issuer");
    }
    const url = new URL(metadata.jwks_uri);
    if (url.origin !== CC98_ISSUER) {
      throw new OpenIdCheckError("discovery_jwks_uri");
    }
    return remoteJwks(url);
  })().catch((error) => {
    jwksPromise = undefined;
    throw error;
  });
  return jwksPromise;
}

function remoteJwks(url: URL): JWTVerifyGetKey {
  return createRemoteJWKSet(url, {
    [customFetch]: async (resource, options) => {
      let response: Response;
      try {
        response = await fetch(resource, options);
      } catch {
        throw new OpenIdCheckError("jwks_unavailable");
      }
      if (!response.ok) throw new OpenIdCheckError(`jwks_http_${response.status}`);
      return response;
    },
  });
}

export function pinnedOfficialJwks(value: string): JWTVerifyGetKey {
  let parsed: unknown;
  try {
    if (value.length > 12000) throw new Error();
    parsed = JSON.parse(value);
  } catch {
    throw new OpenIdCheckError("pinned_key_invalid");
  }
  const keys = parsed && typeof parsed === "object" && "keys" in parsed ? parsed.keys : null;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 8) {
    throw new OpenIdCheckError("pinned_key_invalid");
  }
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || typeof key !== "object" || Array.isArray(key)
      || Object.keys(key).some((field) => !["kty", "use", "kid", "e", "n", "alg"].includes(field))
      || key.kty !== "RSA" || key.use !== "sig" || key.alg !== "RS256"
      || typeof key.kid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(key.kid)
      || typeof key.e !== "string" || !/^[A-Za-z0-9_-]{2,16}$/.test(key.e)
      || typeof key.n !== "string" || !/^[A-Za-z0-9_-]{340,1400}$/.test(key.n)
      || seen.has(key.kid)) {
      throw new OpenIdCheckError("pinned_key_invalid");
    }
    seen.add(key.kid);
  }
  return createLocalJWKSet({ keys });
}

export async function verifyCc98IdToken(
  idToken: unknown,
  nonce: string,
  getKey?: JWTVerifyGetKey,
  pinnedJwks?: string,
): Promise<string> {
  if (typeof idToken !== "string" || idToken.length > 6000 || !nonce) {
    throw new OpenIdCheckError("token_shape");
  }
  const resolver = getKey ?? (pinnedJwks ? pinnedOfficialJwks(pinnedJwks) : await officialJwks());
  const { payload } = await jwtVerify(idToken, resolver, {
    issuer: CC98_ISSUER,
    audience: CC98_CLIENT_ID,
    algorithms: ["RS256", "PS256", "ES256"],
    maxTokenAge: "10m",
    clockTolerance: "30s",
  });
  if (!Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat)) {
    throw new OpenIdCheckError("lifetime_missing");
  }
  if (payload.nonce !== nonce || typeof payload.sub !== "string" || !payload.sub) {
    throw new OpenIdCheckError("nonce_or_subject");
  }
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== CC98_CLIENT_ID) {
    throw new OpenIdCheckError("authorized_party");
  }
  return payload.sub;
}
