import type { Enrichment, Lead } from "../types.js";
import { nowIso } from "../util.js";
import { extractPageFacts, isAllowedByRobots, pickFollowUpLinks } from "./extract.js";

const USER_AGENT = "Mozilla/5.0 (compatible; OutreachResearchBot/1.0; small-business research)";
const TEXT_BUDGET = 14_000;
const PAGE_TEXT_BUDGET = 4_500;

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: string; finalUrl: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("html") || contentType.includes("text") ? await res.text() : "";
  return { ok: res.ok, status: res.status, body, finalUrl: res.url || url, contentType };
}

/** Crawls the homepage plus a few high-signal internal pages and summarizes what it finds. */
export async function enrichLead(lead: Lead, opts: { maxPages: number; timeoutMs: number }): Promise<Enrichment> {
  const empty: Enrichment = {
    fetchedAt: nowIso(),
    pages: [],
    text: "",
    emails: [],
    phones: [],
    socials: {},
    tech: [],
    hiringSignals: [],
    hasContactForm: false,
    hasChatWidget: false,
    hasOnlineBooking: false,
  };
  if (!lead.website) return { ...empty, error: "no website" };

  let robots = "";
  try {
    const r = await fetchText(new URL("/robots.txt", lead.website).href, opts.timeoutMs);
    if (r.ok) robots = r.body;
  } catch {
    // No robots.txt reachable: treat as allowed.
  }

  let home;
  try {
    home = await fetchText(lead.website, opts.timeoutMs);
  } catch (err) {
    return { ...empty, error: `homepage fetch failed: ${describeFetchError(err)}` };
  }
  if (!home.ok || !home.body) return { ...empty, error: `homepage returned ${home.status}` };

  const homeFacts = extractPageFacts(home.body, home.finalUrl);
  const facts = [{ url: home.finalUrl, ...homeFacts }];

  const followUps = pickFollowUpLinks(homeFacts.links, home.finalUrl, opts.maxPages - 1).filter((url) =>
    isAllowedByRobots(robots, new URL(url).pathname),
  );
  for (const url of followUps) {
    try {
      const page = await fetchText(url, opts.timeoutMs);
      if (page.ok && page.body) facts.push({ url: page.finalUrl, ...extractPageFacts(page.body, page.finalUrl) });
    } catch {
      // A dead subpage shouldn't sink the whole lead.
    }
  }

  let text = "";
  for (const f of facts) {
    const chunk = `\n\n=== ${f.title || f.url} (${f.url}) ===\n${f.text.slice(0, PAGE_TEXT_BUDGET)}`;
    if (text.length + chunk.length > TEXT_BUDGET) break;
    text += chunk;
  }

  const union = <T>(pick: (f: (typeof facts)[number]) => T[]) => [...new Set(facts.flatMap(pick))];
  return {
    fetchedAt: nowIso(),
    pages: facts.map((f) => ({ url: f.url, title: f.title })),
    text: text.trim(),
    emails: union((f) => f.emails),
    phones: union((f) => f.phones),
    socials: Object.assign({}, ...facts.map((f) => f.socials).reverse()),
    tech: union((f) => f.tech),
    hiringSignals: union((f) => f.hiringSignals),
    hasContactForm: facts.some((f) => f.hasContactForm),
    hasChatWidget: facts.some((f) => f.hasChatWidget),
    hasOnlineBooking: facts.some((f) => f.hasOnlineBooking),
  };
}

function describeFetchError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e.name === "TimeoutError") return "timed out";
  return e.cause?.code ?? e.cause?.message ?? e.message;
}
