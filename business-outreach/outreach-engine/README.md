# Outreach Engine

Finds small businesses in a niche, reads their websites, has Claude score each one and draft a personalized 4-email sequence, then exports a CSV ready for Instantly or Smartlead, plus a review sheet for you to read first.

```
find / import  →  enrich (crawl site)  →  research (Claude)  →  export (CSV + review.md)
 Google Places      about/team/careers     fit score, pains,      one row per recipient,
 or Apollo/Clay     emails, tech stack,    owner name, angle,     {{first_name}} filled,
 CSV                hiring signals         4 emails, LinkedIn,    compliance footer added
                                           mystery-shop plan
```

It does **not** send email. Sending from your own inbox gets domains burned. Upload the CSV to a sending tool that handles warmup, inbox rotation, throttling and unsubscribes (Instantly, Smartlead, lemlist).

## Setup (10 minutes)

```sh
cd business-outreach/outreach-engine
npm install
cp sender.example.json sender.json        # fill in your real details
export ANTHROPIC_API_KEY=sk-ant-...        # console.anthropic.com
export GOOGLE_PLACES_API_KEY=...           # optional, only for `find`
```

- **sender.json**: your name, company, site, US phone, calendar link, demo video link and a **real postal address**. US law (CAN-SPAM) requires the address in commercial email, so export refuses to run without this file. A virtual mailbox or registered-agent address works.
- **Google Places key**: in Google Cloud console, enable *Places API (New)* and create an API key. Google bills per request (check current pricing and the monthly free credit). Skip this if you use Apollo/Clay CSVs.

## Daily workflow

```sh
# 1. Get leads: from Google Maps (several cities, max 60 results per query)...
npm run outreach -- find --niche freight-brokers \
  --query "freight broker Dallas TX" --query "freight broker Atlanta GA" --query "3PL Chicago IL"

#    ...or from an Apollo / Clay / Apify export (owner names + emails = better results)
npm run outreach -- import --niche insurance-agencies --file ~/Downloads/apollo.csv

# 2. Crawl websites (polite: robots.txt, max 5 pages per site)
npm run outreach -- enrich

# 3. Research + write emails (start small and read the output before scaling)
npm run outreach -- research --niche freight-brokers --limit 10
npm run outreach -- show "lone star"        # inspect one lead in full

# 4. Export the good ones
npm run outreach -- export --niche freight-brokers --min-score 65
#    → out/freight-brokers-campaign.csv  (upload to Instantly/Smartlead)
#    → out/freight-brokers-review.md     (read this first)

npm run outreach -- stats
```

Or do it all at once: `npm run outreach -- run --niche home-services --query "hvac company Phoenix AZ"`.

Every step is resumable. Leads are stored in `data/leads.json` and deduplicated by domain, Google place id, or name + phone. Re-running a step only processes what's missing. Use `--force` to redo work.

## Using the CSV in Instantly / Smartlead

Columns: `email, first_name, last_name, title, company_name, website, phone, location, niche, fit_score, role_inbox, personalization, subject_1..4, body_1..4, day_1..4, linkedin_note, whatsapp_message`.

Create a 4-step campaign where each step's subject is `{{subject_N}}` and body is `{{body_N}}` (Smartlead/Instantly treat extra CSV columns as custom variables). Space steps by the `day_N` values (0 / 3 / 7 / 14 by default). Each body already includes your signature and the compliance footer.

`role_inbox = yes` means it's an info@/office@ address. Those reply less, so find the owner on LinkedIn or Apollo for your best leads.

## Niches

| id | market | target |
|----|--------|--------|
| `freight-brokers` | US | Brokerages/3PLs, 3–50 staff: tender entry, check calls, POD → invoice |
| `insurance-agencies` | US | Independent P&C agencies: COIs, renewals, quote intake |
| `home-services` | US | HVAC/plumbing/roofing: missed calls, estimate follow-up, reviews |
| `hotels-indian-owners` | US | Limited-service hotels/motels: overnight guest messaging, reviews, owner reports |
| `india-d2c` | IN | Shopify D2C: COD confirmation/RTO, WhatsApp support, cart recovery |
| `india-ca-firms` | IN | CA firms: GST reconciliation, document chasing, notice replies |

Add your own by copying any file in `niches/`. The pains, `evidence_to_look_for`, disqualifiers and tone fields shape the scoring and copy. After your first 10–20 discovery calls, put your prospects' **exact words** into the pain descriptions. That improves the emails more than anything else.

## Cost

Research uses `claude-opus-5-5` at `--effort medium` by default (override with `--model` / `OUTREACH_MODEL` / `--effort`). As a rough estimate, each lead uses about 5–8k input tokens and 2–4k output tokens, so budget **roughly $0.05–0.10 per lead**. The niche system prompt is cached across leads. Run `--limit 10` first and check the real numbers in the Anthropic console.

Server-side refusal fallback is on (`fallbacks: "default"`). If a safety classifier declines a request, the API retries it on a fallback model instead of failing.

## Guardrails built in

- The prompt forbids invented facts, fake case studies, made-up results and flattery. Every pain must cite evidence from the site. Scraped text is passed as untrusted data, so instructions hidden in a website are ignored.
- Export never picks no-reply/HR/billing addresses or addresses on other domains, and sends to 1 person per company by default (`--per-company`).
- Every email gets your postal address and an opt-out line.
- The crawler respects robots.txt, identifies itself, times out after 15s, and fetches at most 5 pages per site.

**You are still the last check.** Read `review.md` before uploading, delete anything that looks wrong, and keep volume low while domains warm up (around 30 emails/day/inbox). For India, don't cold-message on WhatsApp. The `whatsapp_message` column is for after someone has engaged.

## Development

```sh
npm test          # vitest: parsing, crawl against a local server, research with a fake client, export
npm run typecheck
```

Code map: `src/sources` (Places, CSV) → `src/enrich` (crawler, HTML extraction) → `src/research` (prompt, schema, Claude call) → `src/export.ts` → `src/cli.ts`.
