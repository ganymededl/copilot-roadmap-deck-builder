import { writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GCC_SOURCE, gccSpecificNote, matchesGcc, normalizeCloudTags } from "./gcc.mjs";

const OUTPUT = new URL("../data/gcc-roadmap.json", import.meta.url);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUSES = new Set(["In development", "Rolling out", "Launched", "Cancelled"]);

function plain(value) {
  return String(value || "").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, entity =>
      ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" })[entity])
    .replace(/\s+/g, " ").trim();
}

export function normalizeGccRoadmap(records, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(records)) throw new Error("Microsoft Roadmap response lacks a value array.");
  const seen = new Set();
  const items = [];
  for (const record of records) {
    const clouds = normalizeCloudTags(record?.cloudInstances);
    if (!matchesGcc(clouds, "gcc")) continue;
    const { id, created, modified, status, generalAvailabilityDate } = record;
    const title = plain(record.title);
    if (!Number.isSafeInteger(id) || id < 1 || !title || !STATUSES.has(status) ||
        !Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(modified)) ||
        (generalAvailabilityDate != null && !MONTH.test(generalAvailabilityDate))) {
      throw new Error(`Unexpected Microsoft Roadmap fields on GCC record ${id ?? "(missing ID)"}.`);
    }
    if (seen.has(id)) throw new Error(`Duplicate Microsoft Roadmap record ${id}.`);
    seen.add(id);
    const description = plain(record.description);
    const platforms = (Array.isArray(record.platforms) ? record.platforms : []).map(plain).filter(Boolean);
    items.push({
      key: `RM-${id}`, kind: "Roadmap", referenceId: String(id), title,
      product: (Array.isArray(record.products) ? record.products : []).map(plain).join(", "),
      status, cloudInstances: clouds,
      releaseMonth: generalAvailabilityDate || null,
      createdDate: created, modifiedDate: modified,
      copilotMention: /\bcopilot\b/i.test(description),
      platforms,
      gccNote: gccSpecificNote(id, description),
    });
  }
  items.sort((a, b) => Number(b.referenceId) - Number(a.referenceId));
  return { generatedAt, count: items.length, items };
}

async function fetchRecords() {
  const records = [];
  const endpoint = new URL(GCC_SOURCE);
  let next = endpoint;
  for (let page = 1; next && page <= 25; page++) {
    if (next.origin !== endpoint.origin || next.pathname !== endpoint.pathname) {
      throw new Error(`Unexpected Microsoft Roadmap pagination URL: ${next.href}`);
    }
    const response = await fetch(next, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Microsoft Roadmap returned HTTP ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.value)) throw new Error("Microsoft Roadmap response lacks a value array.");
    records.push(...data.value);
    next = data["@odata.nextLink"] ? new URL(data["@odata.nextLink"], next) : null;
  }
  if (next) throw new Error("Microsoft Roadmap pagination limit reached.");
  if (records.length < 500) throw new Error(`Unexpectedly small Microsoft Roadmap response (${records.length} records).`);
  return records;
}

async function main() {
  const records = await fetchRecords();
  const payload = normalizeGccRoadmap(records);
  if (payload.count < 25 || !payload.items.some(item => matchesGcc(item.cloudInstances, "gcc-only"))) {
    throw new Error(`Unexpected Microsoft GCC coverage (${payload.count} records); retaining the prior snapshot.`);
  }
  const temp = new URL("./gcc-roadmap.json.tmp", OUTPUT);
  await writeFile(temp, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(temp, OUTPUT);
  console.log(`Wrote ${payload.count} GCC records from Microsoft Roadmap (${records.length} total).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
