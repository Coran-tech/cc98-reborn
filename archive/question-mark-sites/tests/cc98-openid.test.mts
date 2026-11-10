import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalJWKSet, exportJWK, generateKeyPair, SignJWT,
} from "jose";
import { CC98_CLIENT_ID, CC98_ISSUER, classifyOpenIdError, pinnedOfficialJwks, verifyCc98IdToken } from "../lib/cc98-openid.ts";

test("CC98 ID Token validation requires signature, issuer, audience and exact nonce", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), alg: "RS256", kid: "test" }] });
  const sign = (claims: { issuer?: string; audience?: string; nonce?: string; expires?: number }) =>
    new SignJWT({ nonce: claims.nonce ?? "expected" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(claims.issuer ?? CC98_ISSUER)
      .setAudience(claims.audience ?? CC98_CLIENT_ID)
      .setSubject("private-subject")
      .setIssuedAt()
      .setExpirationTime(claims.expires ?? "5m")
      .sign(privateKey);

  assert.equal(await verifyCc98IdToken(await sign({}), "expected", jwks), "private-subject");
  await assert.rejects(verifyCc98IdToken(await sign({ nonce: "wrong" }), "expected", jwks));
  await assert.rejects(verifyCc98IdToken(await sign({ issuer: "https://evil.example" }), "expected", jwks));
  await assert.rejects(verifyCc98IdToken(await sign({ audience: "wrong-client" }), "expected", jwks));
  await assert.rejects(verifyCc98IdToken(await sign({ expires: -10 }), "expected", jwks));
  const withoutExpiry = await new SignJWT({ nonce: "expected" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(CC98_ISSUER).setAudience(CC98_CLIENT_ID)
    .setSubject("private-subject").setIssuedAt().sign(privateKey);
  await assert.rejects(verifyCc98IdToken(withoutExpiry, "expected", jwks));
  const differentKey = await generateKeyPair("RS256");
  const forged = await new SignJWT({ nonce: "expected" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(CC98_ISSUER).setAudience(CC98_CLIENT_ID)
    .setSubject("private-subject").setIssuedAt().setExpirationTime("5m")
    .sign(differentKey.privateKey);
  await assert.rejects(verifyCc98IdToken(forged, "expected", jwks));
  assert.equal(classifyOpenIdError(new Error("never log token text")), "validation_unknown");
});

test("a blocked discovery document falls back only to the fixed CC98 JWKS URL", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (resource) => {
    const url = String(resource);
    urls.push(url);
    if (url === `${CC98_ISSUER}/.well-known/openid-configuration`) {
      return new Response(null, { status: 403 });
    }
    if (url === `${CC98_ISSUER}/.well-known/openid-configuration/jwks`) {
      return Response.json({ keys: [{ ...await exportJWK(publicKey), alg: "RS256", kid: "fallback-test" }] });
    }
    throw new Error("Unexpected remote address");
  };
  try {
    const token = await new SignJWT({ nonce: "expected" })
      .setProtectedHeader({ alg: "RS256", kid: "fallback-test" })
      .setIssuer(CC98_ISSUER).setAudience(CC98_CLIENT_ID)
      .setSubject("private-subject").setIssuedAt().setExpirationTime("5m")
      .sign(privateKey);
    assert.equal(await verifyCc98IdToken(token, "expected"), "private-subject");
    assert.deepEqual(urls, [
      `${CC98_ISSUER}/.well-known/openid-configuration`,
      `${CC98_ISSUER}/.well-known/openid-configuration/jwks`,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an administrator-pinned public key verifies tokens without trusting client keys", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const key = { ...await exportJWK(publicKey), use: "sig", kid: "pinned-test", alg: "RS256" };
  const pinned = JSON.stringify({ keys: [key] });
  const token = await new SignJWT({ nonce: "expected" })
    .setProtectedHeader({ alg: "RS256", kid: key.kid })
    .setIssuer(CC98_ISSUER).setAudience(CC98_CLIENT_ID)
    .setSubject("private-subject").setIssuedAt().setExpirationTime("5m")
    .sign(privateKey);
  assert.equal(await verifyCc98IdToken(token, "expected", undefined, pinned), "private-subject");
  await assert.rejects(verifyCc98IdToken(token, "wrong", undefined, pinned));
  const other = await generateKeyPair("RS256");
  const wrongKey = JSON.stringify({ keys: [{ ...await exportJWK(other.publicKey), use: "sig", kid: key.kid, alg: "RS256" }] });
  await assert.rejects(verifyCc98IdToken(token, "expected", undefined, wrongKey));
  assert.throws(() => pinnedOfficialJwks(JSON.stringify({ keys: [{ ...key, d: "private" }] })));
});
