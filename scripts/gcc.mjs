export const GCC_SOURCE = "https://www.microsoft.com/releasecommunications/api/v2/m365";
export const ROADMAP_HOME = "https://www.microsoft.com/en-us/microsoft-365/roadmap";
export const MESSAGE_CENTER = "https://admin.microsoft.com/adminportal/home#/MessageCenter";
export const GCC_SCOPES = Object.freeze({
  gcc: "Applies to GCC Moderate",
  "gcc-only": "GCC-only rollout records",
});

const cloudNames = new Map([
  ["gcc", "GCC"], ["gcc moderate", "GCC"], ["gcc-moderate", "GCC"], ["gcc-m", "GCC"],
  ["gcc high", "GCC High"], ["gcc-high", "GCC High"], ["gcc-h", "GCC High"],
  ["dod", "DoD"], ["worldwide (standard multi-tenant)", "Worldwide (Standard Multi-Tenant)"],
  ["worldwide", "Worldwide (Standard Multi-Tenant)"], ["ww", "Worldwide (Standard Multi-Tenant)"],
]);

export function normalizeCloudTags(values) {
  if (!Array.isArray(values) || values.some(tag => typeof tag !== "string" || !tag.trim())) return [];
  const tags = new Map();
  for (const value of values) {
    const tag = value.trim().replace(/\s+/g, " ");
    const canonical = cloudNames.get(tag.toLowerCase()) || tag;
    tags.set(canonical.toLowerCase(), canonical);
  }
  return [...tags.values()];
}

export function matchesGcc(tags, scope) {
  return Array.isArray(tags) && tags.includes("GCC") &&
    (scope === "gcc" || (scope === "gcc-only" && tags.length === 1));
}

export function roadmapLink(id) {
  return /^\d+$/.test(id) ? `${ROADMAP_HOME}?searchterms=${id}` : null;
}

export function agencyReference(id, scope, confirmed) {
  id = id.trim().toUpperCase();
  if (!/^MC[1-9]\d{4,11}$/.test(id)) throw new Error("Enter a Message Center ID such as MC123456, not a URL.");
  if (!Object.hasOwn(GCC_SCOPES, scope)) throw new Error("Choose the GCC scope stated in the notice.");
  if (!confirmed) throw new Error("Confirm that you checked the notice in your GCC Moderate tenant.");
  return { id, scope, url: `${MESSAGE_CENTER}/:/messages/${id}` };
}

export function matchingAgencyReferences(references, scope) {
  if (scope === "gcc") return references.slice();
  if (scope === "gcc-only") return references.filter(ref => ref.scope === "gcc-only");
  return [];
}

export function gccSpecificNote(id, description) {
  // Require the current source text before carrying this manually reviewed detail forward.
  if (String(id) === "578868" &&
      /GCC only:\s*Adoption by app for Edge and the Microsoft 365 Copilot app\b/i.test(description)) {
    return "GCC only within this government rollout: adoption reporting by app for Edge and the Microsoft 365 Copilot app.";
  }
  return "";
}
