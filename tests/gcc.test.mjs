import assert from "node:assert/strict";
import { test } from "node:test";
import { agencyReference, matchingAgencyReferences, matchesGcc, normalizeCloudTags } from "../scripts/gcc.mjs";
import { normalizeGccRoadmap } from "../scripts/fetch-gcc-roadmap.mjs";

const cloudCases = [
  [["GCC"], true, true],
  [["GCC Moderate", "gcc-m", "gcc"], true, true],
  [["Worldwide (Standard Multi-Tenant)", "GCC"], true, false],
  [["GCC High", "DoD", "GCC"], true, false],
  [["GCC", "Other sovereign cloud"], true, false],
  [["GCC High", "DoD"], false, false],
  [["GCC-H"], false, false],
  [["Worldwide"], false, false],
  [["GCC", null], false, false],
  [[], false, false],
  ["GCC", false, false],
];

test("GCC filters match known exact tags without discarding other clouds", () => {
  for (const [raw, applies, strict] of cloudCases) {
    const tags = normalizeCloudTags(raw);
    assert.equal(matchesGcc(tags, "gcc"), applies, JSON.stringify(raw));
    assert.equal(matchesGcc(tags, "gcc-only"), strict, JSON.stringify(raw));
  }
});

test("agency references require an ID, explicit scope and admin confirmation", () => {
  assert.throws(() => agencyReference("https://example.org/MC123456", "gcc-only", true), /ID/);
  assert.throws(() => agencyReference("MC123456", "", true), /scope/);
  assert.throws(() => agencyReference("MC123456", "gcc-only", false), /Confirm/);
  const only = agencyReference(" mc123456 ", "gcc-only", true);
  const shared = agencyReference("MC123457", "gcc", true);
  assert.equal(new URL(only.url).hostname, "admin.microsoft.com");
  assert.deepEqual(matchingAgencyReferences([only, shared], "gcc"), [only, shared]);
  assert.deepEqual(matchingAgencyReferences([only, shared], "gcc-only"), [only]);
  assert.deepEqual(matchingAgencyReferences([only, shared], "all"), []);
});

const record = {
  id: 578868, title: "Analytics", products: ["Viva"], cloudInstances: ["GCC", "GCC High"],
  status: "In development", created: "2026-10-01T00:00:00Z", modified: "2026-11-01T00:00:00Z",
  generalAvailabilityDate: "2026-11", platforms: ["Web"],
  description: "<p>GCC only: Adoption by app for Edge and the Microsoft 365 Copilot app.</p>",
};

test("snapshot keeps structured dates, excludes non-GCC and checks the source for the Viva detail", () => {
  const { count, items: [item] } = normalizeGccRoadmap([
    record, { ...record, id: 123, cloudInstances: ["GCC High"] },
  ]);
  assert.equal(count, 1);
  assert.equal(item.releaseMonth, "2026-11");
  assert.equal(item.copilotMention, true);
  assert.equal("description" in item, false);
  assert.deepEqual(item.platforms, ["Web"]);
  assert.match(item.gccNote, /adoption reporting/);
  assert.equal(normalizeGccRoadmap([{ ...record, description: "Old detail removed" }]).items[0].gccNote, "");
  assert.throws(() => normalizeGccRoadmap([{ ...record, generalAvailabilityDate: "December" }]), /Unexpected/);
  assert.throws(() => normalizeGccRoadmap([record, record]), /Duplicate/);
});
