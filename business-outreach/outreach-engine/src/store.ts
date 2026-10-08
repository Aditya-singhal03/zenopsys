import fs from "node:fs";
import path from "node:path";
import type { Lead } from "./types.js";
import { nowIso } from "./util.js";

/**
 * A JSON-file lead store. Thousands of leads fit comfortably, the file is easy
 * to inspect, and writes go through a temp file so a crash never corrupts it.
 */
export class LeadStore {
  private leads = new Map<string, Lead>();

  constructor(private readonly file: string) {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Lead[];
      for (const lead of parsed) this.leads.set(lead.id, lead);
    }
  }

  all(): Lead[] {
    return [...this.leads.values()];
  }

  get(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  /** Finds an existing lead that is the same business, by id, domain, or name + phone. */
  findDuplicate(candidate: Pick<Lead, "id" | "domain" | "name" | "phone">): Lead | undefined {
    const byId = this.leads.get(candidate.id);
    if (byId) return byId;
    for (const lead of this.leads.values()) {
      if (candidate.domain && lead.domain === candidate.domain) return lead;
      if (
        candidate.phone &&
        lead.phone &&
        digits(lead.phone) === digits(candidate.phone) &&
        lead.name.toLowerCase() === candidate.name.toLowerCase()
      ) {
        return lead;
      }
    }
    return undefined;
  }

  /** Inserts a lead unless it duplicates one already stored. Returns true when inserted. */
  add(lead: Lead): boolean {
    if (this.findDuplicate(lead)) return false;
    this.leads.set(lead.id, lead);
    return true;
  }

  update(id: string, patch: Partial<Lead>): Lead {
    const existing = this.leads.get(id);
    if (!existing) throw new Error(`Unknown lead ${id}`);
    const updated = { ...existing, ...patch, updatedAt: nowIso() };
    this.leads.set(id, updated);
    return updated;
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.all(), null, 2));
    fs.renameSync(tmp, this.file);
  }
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
