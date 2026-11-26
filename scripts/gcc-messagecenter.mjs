/**
 * gcc-messagecenter.mjs
 *
 * Pure, testable helpers for normalizing real Microsoft 365 Message Center
 * notices pulled from a GCC Moderate tenant via Microsoft Graph
 * (/admin/serviceAnnouncement/messages). Separated from fetch-gcc-
 * messagecenter.mjs so the filtering/normalization logic can be unit tested
 * without any network or credentials.
 */

const COPILOT_RE = /\bcopilot\b/i;
const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

function decodeEntities(text) {
  return text.replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity]);
}

/** Converts a Message Center HTML body to readable plain text, keeping line breaks. */
export function htmlToText(html) {
  if (!html) return "";
  return decodeEntities(
    String(html)
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\u2022 ")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** True when a raw Graph serviceUpdateMessage record is Copilot-relevant. */
export function isCopilotRelevant(message) {
  const services = Array.isArray(message?.services) ? message.services.join(" ") : "";
  const tags = Array.isArray(message?.tags) ? message.tags.join(" ") : "";
  const haystack = `${message?.title || ""} ${services} ${tags} ${message?.body?.content || ""}`;
  return COPILOT_RE.test(haystack);
}

/**
 * Normalizes raw Graph serviceAnnouncement/messages records into the shape
 * this repo publishes. Only Copilot-relevant notices are kept -- this is a
 * deliberate scope reduction (not every Message Center post in the tenant),
 * matching the "Copilot first" intent of this feature and limiting how much
 * tenant-specific content gets published.
 */
export function normalizeMessages(records, generatedAt = new Date().toISOString()) {
  if (!Array.isArray(records)) throw new Error("Microsoft Graph response lacks a value array.");
  const seen = new Set();
  const items = [];
  for (const record of records) {
    if (!isCopilotRelevant(record)) continue;
    const id = record?.id;
    if (!id || typeof id !== "string" || !/^MC\d+$/i.test(id) || seen.has(id)) continue;
    seen.add(id);
    items.push({
      key: id,
      referenceId: id.replace(/^MC/i, ""),
      title: String(record?.title || "").trim(),
      category: record?.category || null,
      severity: record?.severity || null,
      services: Array.isArray(record?.services) ? record.services : [],
      tags: Array.isArray(record?.tags) ? record.tags : [],
      isMajorChange: Boolean(record?.isMajorChange),
      actionRequiredByDateTime: record?.actionRequiredByDateTime || null,
      startDateTime: record?.startDateTime || null,
      lastModifiedDateTime: record?.lastModifiedDateTime || null,
      body: htmlToText(record?.body?.content),
      link: `https://admin.microsoft.com/adminportal/home#/MessageCenter/:/messages/${id}`,
    });
  }
  items.sort((a, b) => String(b.lastModifiedDateTime ?? "").localeCompare(String(a.lastModifiedDateTime ?? "")));
  return { generatedAt, count: items.length, items };
}
