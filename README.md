# Copilot Roadmap Deck Builder

A static web page that turns the public Microsoft 365 Roadmap and Message Center
feeds into a PowerPoint deck for any date range you pick.

**Live page:** https://ganymededl.github.io/copilot-roadmap-deck-builder/

## What it does

1. Pick a date range from a calendar (January 2023 through two years ahead).
2. Choose what the deck covers:
   - **Activity in the range** &mdash; items published or updated between your dates.
     This is the usual choice for a monthly look-back update.
   - **Releases in the range** &mdash; roadmap items whose target release month falls
     between your dates. Use this for a forward-looking view.
3. Narrow by keyword (defaults to `Copilot`), source, and cloud.
4. Review the section breakdown, then generate the deck.

The browser asks where to save the file. Deck generation runs entirely on your
device &mdash; nothing is uploaded.

## For GCC Moderate administrators

Use **Cloud → Applies to GCC Moderate** for a state or local government briefing:
any public Roadmap record that explicitly lists GCC qualifies, even if other
clouds are also listed. Use **GCC-only rollout records** for the stricter
shortlist. It requires GCC to be the only cloud listed on that record; this
does not establish that the same capability is unavailable in other clouds.
Neither mode includes records labeled only for Commercial, GCC High, DoD, or
other clouds. **All clouds** remains the default.

- [Open the GCC Moderate view](https://ganymededl.github.io/copilot-roadmap-deck-builder/?cloud=gcc)
  or [open the GCC-only records view](https://ganymededl.github.io/copilot-roadmap-deck-builder/?cloud=gcc-only).
- Use **Releases in the range** for published general availability target
  months (not specific days or tenant release dates); cancelled records are
  excluded in GCC release mode. **Activity in the range** uses publication
  and modification dates. Public Roadmap coverage is not a complete archive.
- For tenant-specific timing, sign in to the
  [Microsoft 365 admin center](https://admin.microsoft.com/adminportal/home#/MessageCenter)
  with your agency account. Under **Health → Message center**, open the
  Copilot notice and check **Status for your org** when the field is available.
  Also check licensing and policy prerequisites. The builder doesn't access
  your tenant or treat an announcement as proof of tenant availability.
- To include approved references in an **internal** deck, choose
  **Sources → Roadmap + agency-verified references**. Enter only the notice
  ID, confirm its cloud scope, and check the attestation. IDs stay in page
  memory until reload and are only used in the local deck. The internal appendix
  is separate from the public Roadmap counts and dates. Shared references are
  excluded in strict mode. Remove the appendix before external sharing.

GCC modes don't use the aggregated public Message Center feed. A GCC-specific
detail on a shared record can be noted without treating the entire rollout as
GCC-only (for example, Viva Roadmap #578868). The source document is authoritative.

## Not an official Microsoft deliverable

This is assembled from public feeds. It is an independent summary of published
information, not an official Microsoft roadmap deck. Verify anything
customer-facing against the official source before sending it.

## How the data gets here

The upstream APIs send no CORS headers, so a static page cannot call them
directly. Instead, `.github/workflows/refresh-data.yml` runs `scripts/fetch-data.mjs`
on a daily schedule, which fetches and normalises the full dataset and commits
`data/roadmap.json`. The same workflow refreshes `data/gcc-roadmap.json`
directly from the Microsoft 365 Roadmap for the GCC modes. The page reads the
snapshots from its own origin. A failed GCC refresh leaves the prior snapshot in
place; the page flags GCC snapshots over three days old.

To refresh manually, run the workflow from the **Actions** tab, or locally:

```bash
node scripts/fetch-data.mjs
node scripts/fetch-gcc-roadmap.mjs
node --test tests/gcc.test.mjs
```

## Sources

- DeltaPulse unified API (`deltapulse.app`) &mdash; aggregates Microsoft 365 Roadmap and Message Center
- Microsoft 365 public Roadmap (`microsoft.com/releasecommunications`) &mdash; the underlying roadmap feed

## Browser support

Save-location prompting uses the File System Access API, available in Edge and
Chrome. Other browsers fall back to a normal download.
