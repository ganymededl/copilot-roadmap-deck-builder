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
3. Narrow by keyword (defaults to `Copilot`) and by source.
4. Review the section breakdown, then generate the deck.

The browser asks where to save the file. Deck generation runs entirely on your
device &mdash; nothing is uploaded.

## Not an official Microsoft deliverable

This is assembled from public feeds. It is an independent summary of published
information, not an official Microsoft roadmap deck. Verify anything
customer-facing against the official source before sending it.

## How the data gets here

The upstream APIs send no CORS headers, so a static page cannot call them
directly. Instead, `.github/workflows/refresh-data.yml` runs `scripts/fetch-data.mjs`
on a daily schedule, which fetches and normalises the full dataset and commits
`data/roadmap.json`. The page reads that file from its own origin.

To refresh manually, run the workflow from the **Actions** tab, or locally:

```bash
node scripts/fetch-data.mjs
```

## Sources

- DeltaPulse unified API (`deltapulse.app`) &mdash; aggregates Microsoft 365 Roadmap and Message Center
- Microsoft 365 public Roadmap (`microsoft.com/releasecommunications`) &mdash; the underlying roadmap feed

## Browser support

Save-location prompting uses the File System Access API, available in Edge and
Chrome. Other browsers fall back to a normal download.
