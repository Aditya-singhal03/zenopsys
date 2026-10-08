import * as cheerio from "cheerio";

/** Script/markup fingerprints of tools a prospect already pays for. */
const TECH_FINGERPRINTS: Record<string, RegExp> = {
  ServiceTitan: /servicetitan/i,
  Jobber: /getjobber|jobber\.com/i,
  "Housecall Pro": /housecallpro/i,
  Podium: /podium\.com|podium-widget/i,
  Birdeye: /birdeye/i,
  HubSpot: /hs-scripts|hubspot/i,
  Intercom: /intercom/i,
  Drift: /drift\.com|js\.driftt/i,
  Tidio: /tidio/i,
  "LiveChat": /livechatinc/i,
  Calendly: /calendly\.com/i,
  Acuity: /acuityscheduling/i,
  Shopify: /cdn\.shopify|myshopify/i,
  WooCommerce: /woocommerce/i,
  WordPress: /wp-content|wp-includes/i,
  Wix: /wixstatic|wix\.com/i,
  Squarespace: /squarespace/i,
  GoDaddy: /godaddy|img1\.wsimg/i,
  "Google Tag Manager": /googletagmanager/i,
  "Meta Pixel": /connect\.facebook\.net\/.*fbevents/i,
  Zendesk: /zendesk|zdassets/i,
  Freshdesk: /freshdesk|freshchat/i,
  "WhatsApp chat": /wa\.me\/|api\.whatsapp\.com/i,
  Zoho: /zoho/i,
  Gorgias: /gorgias/i,
  Klaviyo: /klaviyo/i,
  "Applied Epic": /appliedepic|applied systems/i,
  EZLynx: /ezlynx/i,
  HawkSoft: /hawksoft/i,
  "Cloudbeds": /cloudbeds/i,
  "SiteMinder": /siteminder/i,
};

const CHAT_TECH = new Set(["Intercom", "Drift", "Tidio", "LiveChat", "Podium", "Zendesk", "Freshdesk", "Gorgias", "WhatsApp chat"]);
const BOOKING_TECH = new Set(["Calendly", "Acuity", "ServiceTitan", "Jobber", "Housecall Pro"]);

/** Roles whose hiring suggests manual work we could take over. */
const HIRING_ROLES = [
  "dispatcher",
  "customer service",
  "csr",
  "receptionist",
  "front desk",
  "office manager",
  "office assistant",
  "administrative assistant",
  "admin assistant",
  "data entry",
  "account manager",
  "account coordinator",
  "operations coordinator",
  "logistics coordinator",
  "billing specialist",
  "accounts receivable",
  "bookkeeper",
  "intake specialist",
  "scheduler",
  "call center",
  "virtual assistant",
  "support executive",
  "telecaller",
];

const SOCIAL_HOSTS: Record<string, RegExp> = {
  linkedin: /linkedin\.com\/(company|in)\//i,
  facebook: /facebook\.com\//i,
  instagram: /instagram\.com\//i,
  x: /(twitter|x)\.com\//i,
  youtube: /youtube\.com\//i,
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL = /(example\.|sentry|wixpress|\.png$|\.jpg$|\.jpeg$|\.gif$|\.webp$|\.svg$|domain\.com|email\.com|yourname|@2x)/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|\+91[\s-]?\d{5}[\s-]?\d{5}/g;

export interface PageFacts {
  title: string;
  text: string;
  links: string[];
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  tech: string[];
  hiringSignals: string[];
  hasContactForm: boolean;
  hasChatWidget: boolean;
  hasOnlineBooking: boolean;
}

export function extractPageFacts(html: string, pageUrl: string): PageFacts {
  const $ = cheerio.load(html);

  const links: string[] = [];
  const socials: Record<string, string> = {};
  const emails = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    if (href.toLowerCase().startsWith("mailto:")) {
      const email = decodeURIComponent(href.slice(7).split("?")[0]).toLowerCase();
      if (isUsableEmail(email)) emails.add(email);
      return;
    }
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(abs.protocol)) return;
    for (const [network, re] of Object.entries(SOCIAL_HOSTS)) {
      if (re.test(abs.href) && !socials[network]) socials[network] = abs.href;
    }
    abs.hash = "";
    links.push(abs.href);
  });

  const tech = Object.entries(TECH_FINGERPRINTS)
    .filter(([, re]) => re.test(html))
    .map(([name]) => name);

  const hasContactForm =
    $("form").filter((_, form) => {
      const f = $(form);
      return f.find("textarea").length > 0 || f.find('input[type="email"], input[name*="email" i]').length > 0;
    }).length > 0;

  $("script, style, noscript, svg, iframe, template").remove();
  const title = $("title").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  for (const match of text.match(EMAIL_RE) ?? []) {
    const email = match.toLowerCase();
    if (isUsableEmail(email)) emails.add(email);
  }

  const lower = text.toLowerCase();
  const hiringContext = /hiring|careers|join our team|job opening|apply now|we're growing|position/i.test(text);
  const hiringSignals = hiringContext ? HIRING_ROLES.filter((role) => wordMatch(lower, role)) : [];

  return {
    title,
    text,
    links,
    emails: [...emails],
    phones: [...new Set(text.match(PHONE_RE) ?? [])].slice(0, 5),
    socials,
    tech,
    hiringSignals,
    hasContactForm,
    hasChatWidget: tech.some((t) => CHAT_TECH.has(t)),
    hasOnlineBooking: tech.some((t) => BOOKING_TECH.has(t)) || /book (online|now)|schedule (online|service)/i.test(text),
  };
}

function wordMatch(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(haystack);
}

export function isUsableEmail(email: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) && !JUNK_EMAIL.test(email);
}

/** Picks which internal links are worth crawling after the homepage, best first. */
export function pickFollowUpLinks(links: string[], homeUrl: string, max: number): string[] {
  const home = new URL(homeUrl);
  const host = home.hostname.replace(/^www\./, "");
  const priority: [RegExp, number][] = [
    [/about|our-story|who-we-are|company/i, 5],
    [/team|leadership|staff|people|owner/i, 5],
    [/careers|jobs|hiring|join/i, 4],
    [/contact/i, 4],
    [/services|solutions|what-we-do|industries/i, 3],
    [/pricing|quote|estimate|book|schedule/i, 3],
  ];
  const scored = new Map<string, number>();
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== host) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4)$/i.test(url.pathname)) continue;
    url.search = "";
    const normalized = url.href.replace(/\/$/, "");
    if (normalized === home.href.replace(/\/$/, "")) continue;
    const score = priority.reduce((best, [re, s]) => (re.test(url.pathname) ? Math.max(best, s) : best), 0);
    if (score > 0) scored.set(normalized, Math.max(score, scored.get(normalized) ?? 0));
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, max)
    .map(([url]) => url);
}

/** Simple robots.txt check for the "*" user-agent group. */
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  let applies = false;
  const disallows: string[] = [];
  const allows: string[] = [];
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!field) continue;
    const name = field.trim().toLowerCase();
    if (name === "user-agent") applies = value === "*";
    else if (applies && name === "disallow" && value) disallows.push(value);
    else if (applies && name === "allow" && value) allows.push(value);
  }
  const longest = (rules: string[]) =>
    Math.max(-1, ...rules.filter((r) => path.startsWith(r.replace(/\*.*$/, ""))).map((r) => r.length));
  return longest(allows) >= longest(disallows);
}
