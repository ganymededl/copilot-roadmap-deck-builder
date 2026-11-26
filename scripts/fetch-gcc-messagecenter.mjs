/**
 * fetch-gcc-messagecenter.mjs
 *
 * Pulls REAL Message Center notices from the operator's own GCC Moderate
 * tenant via Microsoft Graph, filters to Copilot-relevant notices, and writes
 * data/gcc-messagecenter.json with full notice content.
 *
 * Unlike every other data source in this repo, this script reads tenant-
 * specific, admin-only content. It authenticates app-only with a certificate
 * (no interactive sign-in, no stored password) using the standard Microsoft
 * Entra ID "client credentials with certificate" flow (see graph-cba.mjs),
 * implemented with Node's built-in crypto module -- no extra dependencies.
 *
 * Required repository secrets (GitHub Actions):
 *   GCC_MC_TENANT_ID        Directory (tenant) ID of the GCC Moderate tenant
 *   GCC_MC_CLIENT_ID        Application (client) ID of the Entra app registration
 *   GCC_MC_CERT_PEM         Public certificate (PEM) uploaded to the app registration
 *   GCC_MC_PRIVATE_KEY_PEM  Matching private key (PEM) -- never uploaded to Entra
 *
 * The app registration needs the Microsoft Graph APPLICATION permission
 * ServiceMessage.Read.All, admin-consented. See README.md for the full setup
 * runbook. If the secrets are not configured yet, this script logs a notice
 * and exits 0 without writing anything, so the rest of the daily refresh
 * still succeeds.
 *
 * IMPORTANT: this intentionally publishes full Message Center notice text
 * (not just metadata) to data/gcc-messagecenter.json, which is committed to
 * this public repository and served by GitHub Pages. Only enable this for
 * notices you are comfortable publishing in full. See README.md.
 *
 * Usage: node scripts/fetch-gcc-messagecenter.mjs
 */

import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireGraphToken } from "./graph-cba.mjs";
import { normalizeMessages } from "./gcc-messagecenter.mjs";

const OUTPUT = new URL("../data/gcc-messagecenter.json", import.meta.url);
const GRAPH_BASE = "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages";
const SELECT = [
  "id", "title", "category", "severity", "services", "tags",
  "isMajorChange", "actionRequiredByDateTime", "startDateTime",
  "lastModifiedDateTime", "body",
].join(",");

function readSecrets() {
  const {
    GCC_MC_TENANT_ID: tenantId,
    GCC_MC_CLIENT_ID: clientId,
    GCC_MC_CERT_PEM: certPem,
    GCC_MC_PRIVATE_KEY_PEM: privateKeyPem,
  } = process.env;
  return { tenantId, clientId, certPem, privateKeyPem };
}

async function fetchAllMessages(token) {
  const records = [];
  let next = `${GRAPH_BASE}?$top=50&$select=${SELECT}&$orderby=lastModifiedDateTime desc`;
  for (let page = 1; next && page <= 40; page++) {
    const response = await fetch(next, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Microsoft Graph returned HTTP ${response.status} for ${next}. ${detail.slice(0, 300)}`);
    }
    const body = await response.json();
    if (!Array.isArray(body.value)) throw new Error("Microsoft Graph response lacks a value array.");
    records.push(...body.value);
    next = body["@odata.nextLink"] || null;
  }
  return records;
}

async function main() {
  const { tenantId, clientId, certPem, privateKeyPem } = readSecrets();
  if (!tenantId || !clientId || !certPem || !privateKeyPem) {
    console.log("GCC_MC_* secrets are not configured yet; skipping real Message Center fetch.");
    return;
  }

  const token = await acquireGraphToken({ tenantId, clientId, certPem, privateKeyPem });
  const records = await fetchAllMessages(token);
  const payload = normalizeMessages(records);

  await mkdir(dirname(fileURLToPath(OUTPUT)), { recursive: true });
  const temp = new URL("./gcc-messagecenter.json.tmp", OUTPUT);
  await writeFile(temp, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(temp, OUTPUT);
  console.log(`Wrote ${payload.count} Copilot-relevant Message Center notice(s) (${records.length} total fetched).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
