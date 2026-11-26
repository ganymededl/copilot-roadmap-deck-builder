import assert from "node:assert/strict";
import { test } from "node:test";
import { certThumbprint, buildClientAssertion } from "../scripts/graph-cba.mjs";
import { htmlToText, isCopilotRelevant, normalizeMessages } from "../scripts/gcc-messagecenter.mjs";

test("htmlToText strips tags, decodes entities, and preserves line breaks", () => {
  const html = "<p>Rolling out <b>Copilot</b> &amp; Teams.</p><ul><li>Step one</li><li>Step two</li></ul>";
  const text = htmlToText(html);
  assert.match(text, /Rolling out Copilot & Teams\./);
  assert.match(text, /\u2022 Step one/);
  assert.match(text, /\u2022 Step two/);
  assert.equal(htmlToText(""), "");
  assert.equal(htmlToText(null), "");
});

test("isCopilotRelevant matches title, services, tags, or body", () => {
  assert.equal(isCopilotRelevant({ title: "New Copilot feature" }), true);
  assert.equal(isCopilotRelevant({ title: "Update", services: ["Microsoft 365 Copilot"] }), true);
  assert.equal(isCopilotRelevant({ title: "Update", tags: ["Copilot"] }), true);
  assert.equal(isCopilotRelevant({ title: "Update", body: { content: "mentions copilot inline" } }), true);
  assert.equal(isCopilotRelevant({ title: "Exchange Online update" }), false);
  assert.equal(isCopilotRelevant({}), false);
});

const record = {
  id: "MC123456",
  title: "Microsoft 365 Copilot: new summarization feature",
  category: "New feature",
  severity: "normal",
  services: ["Microsoft 365 Copilot"],
  tags: ["New feature"],
  isMajorChange: false,
  actionRequiredByDateTime: null,
  startDateTime: "2026-11-01T00:00:00Z",
  lastModifiedDateTime: "2026-11-10T00:00:00Z",
  body: { content: "<p>We are rolling out a new Copilot summarization feature.</p>" },
};

test("normalizeMessages keeps only Copilot-relevant, well-formed records and dedupes", () => {
  const { count, items, tenantLabel, fetchedCount } = normalizeMessages([
    record,
    {
      ...record, id: "MC999999", title: "Unrelated Exchange change", services: ["Exchange Online"], tags: [],
      body: { content: "<p>Routine Exchange Online mailbox quota change.</p>" },
    },
    record, // duplicate id, should be dropped
  ], "2026-11-26T00:00:00.000Z", { tenantLabel: "Gov47", fetchedCount: 123 });
  assert.equal(count, 1);
  assert.equal(tenantLabel, "Gov47");
  assert.equal(fetchedCount, 123);
  assert.equal(items[0].key, "MC123456");
  assert.equal(items[0].referenceId, "123456");
  assert.match(items[0].body, /rolling out a new Copilot summarization feature/);
  assert.equal(items[0].link, "https://admin.microsoft.com/adminportal/home#/MessageCenter/:/messages/MC123456");
});

test("normalizeMessages rejects malformed input and ignores records without a valid MC id", () => {
  assert.throws(() => normalizeMessages(null), /value array/);
  const { count } = normalizeMessages([{ ...record, id: "not-an-mc-id" }]);
  assert.equal(count, 0);
});

test("buildClientAssertion requires all four credential fields", () => {
  assert.throws(() => buildClientAssertion({}), /tenantId, clientId, certPem and privateKeyPem/);
});

test("certThumbprint throws a clear error on malformed PEM instead of crashing silently", () => {
  assert.throws(() => certThumbprint("not a real certificate"));
});
