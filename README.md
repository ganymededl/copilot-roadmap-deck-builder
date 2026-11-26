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

GCC modes don't use the aggregated public Message Center feed for Roadmap
coverage. A GCC-specific detail on a shared record can be noted without
treating the entire rollout as GCC-only (for example, Viva Roadmap #578868).
The source document is authoritative.

## Real Message Center notices (your own GCC Moderate tenant)

This is a separate, opt-in data source, different from everything else on this
page. Choose **Sources → Real Message Center (your GCC Moderate tenant)** after
selecting a GCC cloud to use it.

- **What it is:** the actual Message Center notices from *this* tenant,
  fetched daily straight from Microsoft Graph, filtered to notices that
  mention Copilot (in the title, service name, tags, or body). It is not the
  public Roadmap feed and not another tenant's data.
- **It publishes full notice text.** Unlike the rest of this tool, the
  committed snapshot (`data/gcc-messagecenter.json`) contains the complete
  body of each matching notice, not just a title or metadata, and that file is
  served publicly by GitHub Pages and readable directly from the repository.
  Only turn this on for a tenant/notices you're comfortable publishing in
  full. If you want metadata only, don't enable this feature — there isn't a
  partial-redaction mode.
- **No interactive sign-in, ever.** Authentication is app-only, using a
  certificate (CBA) via an Entra ID app registration — never a username,
  password, or daily login. See the setup runbook below.
- **Scope reduction by design:** the fetch only keeps Copilot-relevant
  notices. The tenant's full Message Center (patching, licensing, every other
  product's notices, etc.) is never fetched into this public repo.

### One-time setup (you must do this yourself — it's your tenant)

1. **Register an app** in your GCC Moderate tenant's Entra ID (Azure AD):
   portal.azure.com → **Microsoft Entra ID** → **App registrations** → **New
   registration**. Single tenant is fine. Note the **Application (client) ID**
   and **Directory (tenant) ID**.
2. **Add the API permission**: **API permissions** → **Add a permission** →
   **Microsoft Graph** → **Application permissions** → search
   `ServiceMessage.Read.All` → add it → **Grant admin consent** (this step
   requires a Global/Privileged Role Administrator; Scout cannot do this for
   you).
3. **Create a certificate** (no CA needed — a self-signed cert is fine for
   app-only auth), e.g. with OpenSSL:
   ```bash
   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 730 -nodes -subj "/CN=copilot-roadmap-deck-builder"
   ```
4. **Upload the public certificate** (`cert.pem`) to the app registration:
   **Certificates & secrets** → **Certificates** → **Upload certificate**.
   Keep `key.pem` private — never upload it anywhere.
5. **Add four repository secrets** (GitHub repo → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**):

   | Secret name | Value |
   |---|---|
   | `GCC_MC_TENANT_ID` | Directory (tenant) ID from step 1 |
   | `GCC_MC_CLIENT_ID` | Application (client) ID from step 1 |
   | `GCC_MC_CERT_PEM` | Contents of `cert.pem` |
   | `GCC_MC_PRIVATE_KEY_PEM` | Contents of `key.pem` |

6. Re-run the **Refresh roadmap data** workflow (Actions tab →
   **Run workflow**). If the secrets aren't set yet, the job logs a notice and
   skips this step without failing the rest of the daily refresh.

The script authenticates with the standard Microsoft Entra "client
credentials with certificate" flow, implemented in
`scripts/graph-cba.mjs` using only Node's built-in `crypto` module (no new
dependencies). It signs a short-lived JWT with your private key, trades it for
a Graph app-only token, and calls
`GET /admin/serviceAnnouncement/messages`.

## Not an official Microsoft deliverable

This is assembled from public feeds. It is an independent summary of published
information, not an official Microsoft roadmap deck. Verify anything
customer-facing against the official source before sending it.

## How the data gets here

The upstream APIs send no CORS headers, so a static page cannot call them
directly. Instead, `.github/workflows/refresh-data.yml` runs `scripts/fetch-data.mjs`
on a daily schedule, which fetches and normalises the full dataset and commits
`data/roadmap.json`. The same workflow refreshes `data/gcc-roadmap.json`
directly from the Microsoft 365 Roadmap for the GCC modes, and
`data/gcc-messagecenter.json` from your own GCC Moderate tenant's Message
Center (see above — requires one-time setup). The page reads the snapshots
from its own origin. A failed GCC refresh leaves the prior snapshot in place;
the page flags GCC snapshots over three days old.

To refresh manually, run the workflow from the **Actions** tab, or locally:

```bash
node scripts/fetch-data.mjs
node scripts/fetch-gcc-roadmap.mjs
node scripts/fetch-gcc-messagecenter.mjs   # requires GCC_MC_* env vars; see above
node --test tests/gcc.test.mjs tests/gcc-messagecenter.test.mjs
```

## Sources

- DeltaPulse unified API (`deltapulse.app`) &mdash; aggregates Microsoft 365 Roadmap and Message Center
- Microsoft 365 public Roadmap (`microsoft.com/releasecommunications`) &mdash; the underlying roadmap feed

## Browser support

Save-location prompting uses the File System Access API, available in Edge and
Chrome. Other browsers fall back to a normal download.
