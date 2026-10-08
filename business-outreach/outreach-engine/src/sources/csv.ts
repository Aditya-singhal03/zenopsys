import { parse } from "csv-parse/sync";
import type { Contact, Lead } from "../types.js";
import { normalizeDomain, normalizeUrl, nowIso } from "../util.js";

/**
 * Column aliases for common exports (Apollo, Clay, Apify Google Maps, hand-made sheets).
 * Matching is case-insensitive and ignores spaces, dashes and underscores.
 */
const ALIASES = {
  company: ["company", "companyname", "organization", "organizationname", "account", "business", "businessname", "name"],
  website: ["website", "companywebsite", "url", "domain", "companydomain", "websiteurl", "site"],
  email: ["email", "workemail", "emailaddress", "personemail", "contactemail"],
  firstName: ["firstname", "first"],
  lastName: ["lastname", "last"],
  fullName: ["fullname", "contactname", "person", "personname", "owner", "ownername"],
  title: ["title", "jobtitle", "position", "role"],
  phone: ["phone", "companyphone", "phonenumber", "corporatephone", "mobilephone"],
  address: ["address", "fulladdress", "location", "city"],
  state: ["state", "region"],
} as const;

type Field = keyof typeof ALIASES;

function key(header: string): string {
  return header.toLowerCase().replace(/[\s_\-]/g, "");
}

export function resolveColumns(headers: string[]): Partial<Record<Field, string>> {
  const byKey = new Map(headers.map((h) => [key(h), h]));
  const resolved: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const header = byKey.get(alias);
      if (header) {
        resolved[field] = header;
        break;
      }
    }
  }
  return resolved;
}

/** Turns CSV rows into leads, grouping several contacts at one company into one lead. */
export function leadsFromCsv(csvText: string, niche: string): Lead[] {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<
    string,
    string
  >[];
  if (rows.length === 0) return [];
  const cols = resolveColumns(Object.keys(rows[0]));
  if (!cols.company && !cols.website) {
    throw new Error("CSV needs at least a company name or website column");
  }

  const byCompany = new Map<string, Lead>();
  const get = (row: Record<string, string>, field: Field) => (cols[field] ? row[cols[field]!]?.trim() : undefined) || undefined;

  for (const row of rows) {
    const website = get(row, "website");
    const domain = normalizeDomain(website);
    const company = get(row, "company") ?? domain;
    if (!company) continue;
    const groupKey = domain ?? company.toLowerCase();

    let lead = byCompany.get(groupKey);
    if (!lead) {
      const now = nowIso();
      const city = get(row, "address");
      const state = get(row, "state");
      lead = {
        id: domain ? `domain:${domain}` : `name:${company.toLowerCase().replace(/\s+/g, "-")}`,
        niche,
        name: company,
        website: normalizeUrl(website),
        domain,
        phone: get(row, "phone"),
        address: [city, state].filter(Boolean).join(", ") || undefined,
        source: "csv",
        contacts: [],
        status: "new",
        createdAt: now,
        updatedAt: now,
      };
      byCompany.set(groupKey, lead);
    }

    const email = get(row, "email")?.toLowerCase();
    if (email && email.includes("@") && !lead.contacts.some((c) => c.email === email)) {
      const name = get(row, "fullName") ?? ([get(row, "firstName"), get(row, "lastName")].filter(Boolean).join(" ") || undefined);
      const contact: Contact = { email, name, title: get(row, "title"), source: "import" };
      lead.contacts.push(contact);
    }
  }

  return [...byCompany.values()];
}
