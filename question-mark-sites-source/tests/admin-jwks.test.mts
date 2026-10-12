import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair } from "jose";
import { keysOverlap, parseOfficialJwks, updateMessage, verifyAdminSignature } from "../lib/admin-jwks.ts";

test("only an enrolled administrator signature can approve a public-key update", async () => {
  const admin = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", admin.publicKey));
  const { publicKey } = await generateKeyPair("RS256");
  const jwks = JSON.stringify({ keys: [{ ...await exportJWK(publicKey), use: "sig", kid: "test", alg: "RS256" }] });
  const message = await updateMessage("challenge", "nonce", jwks);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, admin.privateKey, new Uint8Array(message));
  const encoded = Buffer.from(signature).toString("base64url");
  assert.equal(await verifyAdminSignature(publicJwk, message, encoded), true);
  assert.equal(await verifyAdminSignature(publicJwk,
    await updateMessage("challenge", "nonce", jwks + " "), encoded), false);
  assert.equal(await verifyAdminSignature(publicJwk, message, Buffer.alloc(64).toString("base64url")), false);
  const keys = await parseOfficialJwks(jwks);
  assert.equal(keysOverlap(keys, keys), true);
  assert.equal(keysOverlap(keys, [{ ...keys[0], n: "different" }]), false);
  await assert.rejects(parseOfficialJwks(JSON.stringify({ keys: [{ ...keys[0], d: "private" }] })));
});
