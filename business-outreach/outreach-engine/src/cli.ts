import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { DATA_FILE, OUT_DIR, listNiches, loadNiche, loadSender } from "./config.js";
import { enrichLead } from "./enrich/crawl.js";
import { buildExport } from "./export.js";
import { DEFAULT_MODEL, researchLead } from "./research/research.js";
import { leadsFromCsv } from "./sources/csv.js";
import { searchPlaces } from "./sources/places.js";
import { LeadStore } from "./store.js";
import type { Contact, Lead } from "./types.js";
import { mapLimit } from "./util.js";

const HELP = `outreach: find leads, research them with Claude, export personalized cold-email campaigns

Usage: npm run outreach -- <command> [options]

Commands
  niches                                  List niche configs in ./niches
  find     --niche <id> --query <text>    Pull businesses from Google Places (repeat --query for several cities)
           [--limit 60]                   Needs GOOGLE_PLACES_API_KEY
  import   --niche <id> --file <csv>      Import leads from an Apollo / Clay / Google Maps CSV export
  enrich   [--niche <id>] [--force]       Crawl each lead's website (homepage + about/team/careers/contact)
           [--concurrency 5] [--max-pages 5]
  research [--niche <id>] [--limit N]     Score fit, find pains, draft a 4-email sequence per lead with Claude
           [--effort low|medium|high]     Needs ANTHROPIC_API_KEY (or an \`ant auth login\` profile)
           [--model ${DEFAULT_MODEL}] [--concurrency 3] [--force]
  export   --niche <id> [--min-score 60]  Write out/<niche>-campaign.csv (Instantly/Smartlead) + out/<niche>-review.md
           [--per-company 1] [--no-footer] [--include-exported]
  run      --niche <id> --query <text>    find + enrich + research + export in one go
  stats                                   Pipeline counts per niche and status
  show     <name or domain>               Print everything known about one lead

Examples
  npm run outreach -- find --niche freight-brokers --query "freight broker Dallas TX" --query "freight broker Atlanta GA"
  npm run outreach -- import --niche insurance-agencies --file ~/Downloads/apollo-export.csv
  npm run outreach -- enrich && npm run outreach -- research --limit 20
  npm run outreach -- export --niche freight-brokers --min-score 65
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      niche: { type: "string" },
      query: { type: "string", multiple: true },
      file: { type: "string" },
      limit: { type: "string" },
      concurrency: { type: "string" },
      "max-pages": { type: "string" },
      effort: { type: "string" },
      model: { type: "string" },
      force: { type: "boolean" },
      "min-score": { type: "string" },
      "per-company": { type: "string" },
      "no-footer": { type: "boolean" },
      "include-exported": { type: "boolean" },
    },
  });
  const num = (v: string | undefined, d: number) => (v === undefined ? d : Number.parseInt(v, 10));
  const store = new LeadStore(DATA_FILE);

  switch (command) {
    case "niches":
      for (const id of listNiches()) {
        const n = loadNiche(id);
        console.log(`${id.padEnd(22)} ${n.market}  ${n.name}`);
      }
      return;
    case "find":
      await find(store, requireNiche(values.niche), values.query ?? [], num(values.limit, 60));
      return;
    case "import":
      importCsv(store, requireNiche(values.niche), values.file);
      return;
    case "enrich":
      await enrich(store, values.niche, {
        force: !!values.force,
        concurrency: num(values.concurrency, 5),
        maxPages: num(values["max-pages"], 5),
      });
      return;
    case "research":
      await research(store, values.niche, {
        limit: num(values.limit, Infinity),
        concurrency: num(values.concurrency, 3),
        effort: parseEffort(values.effort),
        model: values.model ?? process.env.OUTREACH_MODEL ?? DEFAULT_MODEL,
        force: !!values.force,
      });
      return;
    case "export":
      exportCampaign(store, requireNiche(values.niche), {
        minScore: num(values["min-score"], 60),
        perCompany: num(values["per-company"], 1),
        includeFooter: !values["no-footer"],
        includeExported: !!values["include-exported"],
      });
      return;
    case "run": {
      const niche = requireNiche(values.niche);
      await find(store, niche, values.query ?? [], num(values.limit, 60));
      await enrich(store, niche, { force: false, concurrency: 5, maxPages: 5 });
      await research(store, niche, {
        limit: num(values.limit, Infinity),
        concurrency: 3,
        effort: parseEffort(values.effort),
        model: values.model ?? process.env.OUTREACH_MODEL ?? DEFAULT_MODEL,
        force: false,
      });
      exportCampaign(store, niche, { minScore: num(values["min-score"], 60), perCompany: 1, includeFooter: true, includeExported: false });
      return;
    }
    case "stats":
      stats(store);
      return;
    case "show":
      show(store, positionals.join(" "));
      return;
    default:
      console.log(HELP);
  }
}

function requireNiche(id: string | undefined): string {
  if (!id) throw new Error(`--niche is required. Available: ${listNiches().join(", ")}`);
  loadNiche(id);
  return id;
}

function parseEffort(v: string | undefined): "low" | "medium" | "high" {
  if (v === undefined) return "medium";
  if (v === "low" || v === "medium" || v === "high") return v;
  throw new Error(`--effort must be low, medium or high`);
}

function selectLeads(store: LeadStore, niche: string | undefined): Lead[] {
  if (niche) loadNiche(niche);
  return store.all().filter((l) => !niche || l.niche === niche);
}

async function find(store: LeadStore, niche: string, queries: string[], limit: number): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("Set GOOGLE_PLACES_API_KEY (Google Cloud console → enable Places API (New)).");
  if (queries.length === 0) throw new Error('Pass at least one --query, e.g. --query "freight broker Dallas TX"');
  for (const query of queries) {
    const found = await searchPlaces({ apiKey, query, niche, limit });
    const added = found.filter((lead) => store.add(lead)).length;
    store.save();
    const noSite = found.filter((l) => !l.website).length;
    console.log(`"${query}": ${found.length} found, ${added} new, ${noSite} without a website`);
  }
}

function importCsv(store: LeadStore, niche: string, file: string | undefined): void {
  if (!file) throw new Error("--file is required");
  const leads = leadsFromCsv(fs.readFileSync(file, "utf8"), niche);
  let added = 0;
  let merged = 0;
  for (const lead of leads) {
    const existing = store.findDuplicate(lead);
    if (!existing) {
      store.add(lead);
      added++;
      continue;
    }
    // Same company already known: keep it, but take any new contacts from the import.
    const newContacts: Contact[] = lead.contacts.filter((c) => !existing.contacts.some((e) => e.email === c.email));
    if (newContacts.length) {
      store.update(existing.id, { contacts: [...existing.contacts, ...newContacts] });
      merged++;
    }
  }
  store.save();
  console.log(`${leads.length} companies in file: ${added} added, ${merged} existing leads got new contacts`);
}

async function enrich(
  store: LeadStore,
  niche: string | undefined,
  opts: { force: boolean; concurrency: number; maxPages: number },
): Promise<void> {
  // Failed crawls are retried on the next run; leads without a website are not.
  const todo = selectLeads(store, niche).filter(
    (l) => opts.force || !l.enrichment || (l.enrichment.error && l.enrichment.error !== "no website"),
  );
  console.log(`Enriching ${todo.length} leads...`);
  let done = 0;
  await mapLimit(todo, opts.concurrency, async (lead) => {
    const enrichment = await enrichLead(lead, { maxPages: opts.maxPages, timeoutMs: 15_000 });
    store.update(lead.id, {
      enrichment,
      status: lead.status === "new" || lead.status === "error" ? "enriched" : lead.status,
    });
    store.save();
    done++;
    const note = enrichment.error
      ? `⚠ ${enrichment.error}`
      : `${enrichment.pages.length} pages, ${enrichment.emails.length} emails, tech: ${enrichment.tech.join(", ") || "-"}${enrichment.hiringSignals.length ? `, hiring: ${enrichment.hiringSignals.join(", ")}` : ""}`;
    console.log(`[${done}/${todo.length}] ${lead.name}: ${note}`);
  });
}

async function research(
  store: LeadStore,
  niche: string | undefined,
  opts: { limit: number; concurrency: number; effort: "low" | "medium" | "high"; model: string; force: boolean },
): Promise<void> {
  const { sender, isExample } = loadSender();
  if (isExample) {
    console.warn("⚠ Using sender.example.json. Copy it to sender.json and fill in your details before exporting real campaigns.");
  }
  const todo = selectLeads(store, niche)
    // Without website text or a known contact there is nothing to personalize, so don't pay for a call.
    .filter((l) => l.enrichment && (!l.enrichment.error || l.contacts.length > 0))
    .filter((l) => opts.force || !l.research)
    .slice(0, opts.limit);
  if (todo.length === 0) {
    console.log("Nothing to research (run enrich first, or pass --force to redo).");
    return;
  }
  console.log(`Researching ${todo.length} leads with ${opts.model} (effort ${opts.effort})...`);

  const client = new Anthropic();
  const nicheCache = new Map<string, ReturnType<typeof loadNiche>>();
  let done = 0;
  await mapLimit(todo, opts.concurrency, async (lead) => {
    if (!nicheCache.has(lead.niche)) nicheCache.set(lead.niche, loadNiche(lead.niche));
    try {
      const result = await researchLead(client, lead, nicheCache.get(lead.niche)!, sender, opts);
      store.update(lead.id, {
        research: result,
        researchError: undefined,
        status: result.disqualified ? "disqualified" : "researched",
      });
      done++;
      const verdict = result.disqualified ? `disqualified (${result.disqualify_reason})` : `score ${result.fit_score}: ${result.angle}`;
      console.log(`[${done}/${todo.length}] ${lead.name}: ${verdict}`);
    } catch (err) {
      done++;
      const message = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : (err as Error).message;
      store.update(lead.id, { researchError: message, status: "error" });
      console.log(`[${done}/${todo.length}] ${lead.name}: ✗ ${message}`);
      if (err instanceof Anthropic.AuthenticationError) throw err;
    } finally {
      store.save();
    }
  });
}

function exportCampaign(
  store: LeadStore,
  niche: string,
  opts: { minScore: number; perCompany: number; includeFooter: boolean; includeExported: boolean },
): void {
  const { sender, isExample } = loadSender();
  if (isExample) {
    throw new Error("Create sender.json (copy sender.example.json) with your real name, address and links before exporting.");
  }
  const leads = selectLeads(store, niche).filter((l) => opts.includeExported || l.status !== "exported");
  const result = buildExport(leads, sender, opts);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvPath = path.join(OUT_DIR, `${niche}-campaign.csv`);
  const reviewPath = path.join(OUT_DIR, `${niche}-review.md`);
  fs.writeFileSync(csvPath, result.csv);
  fs.writeFileSync(reviewPath, result.review);
  for (const id of result.exportedLeadIds) store.update(id, { status: "exported" });
  store.save();
  console.log(`Exported ${result.exportedLeadIds.length} companies → ${path.relative(process.cwd(), csvPath)}`);
  console.log(`Review sheet → ${path.relative(process.cwd(), reviewPath)} (read it before uploading)`);
  console.log(`Skipped ${result.skipped.length}. Reasons are listed at the bottom of the review sheet.`);
}

function stats(store: LeadStore): void {
  const table = new Map<string, Record<string, number>>();
  for (const lead of store.all()) {
    const row = table.get(lead.niche) ?? {};
    row[lead.status] = (row[lead.status] ?? 0) + 1;
    row.total = (row.total ?? 0) + 1;
    if ((lead.research?.fit_score ?? 0) >= 70 && !lead.research?.disqualified) row["score70+"] = (row["score70+"] ?? 0) + 1;
    table.set(lead.niche, row);
  }
  if (table.size === 0) {
    console.log("No leads yet. Start with `find` or `import`.");
    return;
  }
  console.table(Object.fromEntries(table));
}

function show(store: LeadStore, needle: string): void {
  const n = needle.toLowerCase();
  const lead = store.all().find((l) => l.domain === n || l.id === needle || l.name.toLowerCase().includes(n));
  if (!lead) {
    console.log(`No lead matching "${needle}"`);
    return;
  }
  const { enrichment, ...restLead } = lead;
  console.log(JSON.stringify({ ...restLead, enrichment: enrichment && { ...enrichment, text: `${enrichment.text.slice(0, 600)}…` } }, null, 2));
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
