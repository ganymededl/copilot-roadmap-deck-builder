/**
 * graph-cba.mjs
 *
 * Minimal, dependency-free Microsoft Entra ID "client credentials with
 * certificate" (CBA) flow for app-only Microsoft Graph access. No interactive
 * sign-in, no client secret/password -- just a certificate + private key
 * supplied via environment variables (GitHub Actions secrets in CI).
 *
 * Implemented with Node's built-in node:crypto so this repo never needs a
 * package.json / npm install step for authentication.
 */

import { sign, randomUUID, X509Certificate } from "node:crypto";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url-encoded SHA-1 thumbprint ("x5t") Entra expects for the signing cert. */
export function certThumbprint(certPem) {
  const cert = new X509Certificate(certPem);
  const hex = cert.fingerprint.split(":").join("");
  return base64url(Buffer.from(hex, "hex"));
}

/** Builds the signed JWT client assertion used in place of a client secret. */
export function buildClientAssertion({ tenantId, clientId, certPem, privateKeyPem, now = Date.now() }) {
  if (!tenantId || !clientId || !certPem || !privateKeyPem) {
    throw new Error("Certificate-based auth requires tenantId, clientId, certPem and privateKeyPem.");
  }
  const x5t = certThumbprint(certPem);
  const header = { alg: "RS256", typ: "JWT", x5t };
  const nowSec = Math.floor(now / 1000);
  const payload = {
    aud: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    iss: clientId,
    sub: clientId,
    jti: randomUUID(),
    nbf: nowSec - 60,
    exp: nowSec + 600,
  };
  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(payload)))}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/** Exchanges the client assertion for a Microsoft Graph app-only access token. */
export async function acquireGraphToken({ tenantId, clientId, certPem, privateKeyPem }) {
  const clientAssertion = buildClientAssertion({ tenantId, clientId, certPem, privateKeyPem });
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "https://graph.microsoft.com/.default",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) {
    throw new Error(
      `Microsoft Entra token request failed (HTTP ${response.status}): ${body?.error_description || body?.error || "unknown error"}`
    );
  }
  return body.access_token;
}
