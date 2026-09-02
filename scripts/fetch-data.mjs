/**
 * fetch-data.mjs
 *
 * Pulls the full Microsoft 365 Roadmap + Message Center dataset from the public
 * DeltaPulse unified API, normalises it, and writes data/roadmap.json.
 *
 * This runs in GitHub Actions (server side), NOT in the browser -- the upstream
 * APIs send no CORS headers, so a static page cannot call them directly. The
 * page reads the committed JSON from its own origin instead.
 *
 * Usage: node scripts/fetch-data.mjs
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "data", "roadmap.json");

const BASE = "https://deltapulse.app/api/unified/items";
const PAGE_SIZE = 100;
const MAX_PAGES = 80; // safety valve
const DESC_MAX = 420; // deck renders ~175 chars; keep some headroom, cap payload

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Roadmap "releaseDate" values are human strings like "September CY2026",
 * "Q1 CY2026", "H2 CY2025". Convert to a comparable YYYY-MM string so the page
 * can filter by target release window.
 */
function parseReleaseMonth(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  const yearMatch = s.match(/(?:CY)?(20\d{2})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  const monthName = s.toLowerCase().match(/[a-z]+/g)?.find((w) => MONTHS[w]);
  if (monthName) return `${year}-${String(MONTHS[monthName]).padStart(2, "0")}`;

  const q = s.match(/Q([1-4])/i);
  if (q) return `${year}-${String((Number(q[1]) - 1) * 3 + 1).padStart(2, "0")}`;

  const h = s.match(/H([12])/i);
  if (h) return `${year}-${h[1] === "1" ? "01" : "07"}`;

  return `${year}-01`;
}

function clean(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  const c = clean(text);
  return c.length > max ? c.slice(0, max - 1).trimEnd() + "\u2026" : c;
}

function messageStatus(tags) {
  const t = Array.isArray(tags) ? tags : [];
  if (t.includes("Retirement")) return "Retirement";
  if (t.includes("Major change")) return "Major Change";
  if (t.includes("New feature")) return "New Feature";
  return "Update";
}

async function fetchPage(page) {
  const url = `${BASE}?page=${page}&limit=${PAGE_SIZE}&sortField=activity&sortDirection=desc&sources=roadmap,messages`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`  page ${page} attempt ${attempt} failed (${err.message}), retrying...`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function main() {
  const raw = [];
  let totalPages = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await fetchPage(page);
    const items = body?.items ?? [];
    if (items.length === 0) break;
    raw.push(...items);

    if (totalPages === null && body.totalPages) {
      totalPages = body.totalPages;
      console.log(`Upstream reports ${body.total ?? "?"} items across ${totalPages} pages.`);
    }
    console.log(`  fetched page ${page}${totalPages ? `/${totalPages}` : ""} (${raw.length} items so far)`);
    if (totalPages && page >= totalPages) break;
  }

  const seen = new Set();
  const items = [];

  for (const it of raw) {
    const isRoadmap = it.source === "roadmap";
    const refId = isRoadmap ? it.itemId : it.messageId;
    if (!refId) continue;

    const key = isRoadmap ? `RM-${refId}` : `MC-${refId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const product = isRoadmap
      ? clean(it.product)
      : clean(Array.isArray(it.service) ? it.service.join(", ") : it.service);

    const created = isRoadmap ? it.createdDate : it.publishedDate;
    const modified = isRoadmap ? it.modifiedDate : it.lastUpdatedDate;

    items.push({
      key,
      kind: isRoadmap ? "Roadmap" : "Message Center",
      referenceId: String(refId),
      title: clean(it.title),
      product,
      status: isRoadmap ? clean(it.status) || "Update" : messageStatus(it.tags),
      description: truncate(isRoadmap ? it.description : it.summary, DESC_MAX),
      releaseDate: isRoadmap ? clean(it.releaseDate) || null : null,
      releaseMonth: isRoadmap ? parseReleaseMonth(it.releaseDate) : null,
      createdDate: created || null,
      modifiedDate: modified || null,
      cloudInstances: isRoadmap ? clean(it.cloudInstances) || null : null,
      platforms: isRoadmap ? clean(it.platforms) || null : null,
      link: isRoadmap
        ? `https://www.microsoft.com/microsoft-365/roadmap?filters=&searchterms=${refId}`
        : `https://admin.microsoft.com/adminportal/home#/MessageCenter/:/messages/${refId}`,
    });
  }

  items.sort((a, b) => String(b.modifiedDate ?? "").localeCompare(String(a.modifiedDate ?? "")));

  const payload = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    roadmapCount: items.filter((i) => i.kind === "Roadmap").length,
    messageCount: items.filter((i) => i.kind === "Message Center").length,
    sources: [
      "DeltaPulse unified API (deltapulse.app) - aggregates Microsoft 365 Roadmap + Message Center",
      "Microsoft 365 public Roadmap (microsoft.com/releasecommunications) - underlying roadmap feed",
    ],
    items,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(payload), "utf8");

  console.log(
    `\nWrote ${items.length} items (${payload.roadmapCount} roadmap, ${payload.messageCount} message center) to ${OUT_PATH}`
  );
}

main().catch((err) => {
  console.error("Fetch failed:", err);
  process.exit(1);
});
