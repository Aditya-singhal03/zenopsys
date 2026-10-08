import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { buildExport, pickRecipients } from "../src/export.js";
import type { Enrichment } from "../src/types.js";
import { SENDER, makeLead, makeResearch } from "./fixtures.js";

function enrichment(emails: string[]): Enrichment {
  return {
    fetchedAt: "",
    pages: [],
    text: "",
    emails,
    phones: [],
    socials: {},
    tech: [],
    hiringSignals: [],
    hasContactForm: false,
    hasChatWidget: false,
    hasOnlineBooking: false,
  };
}

describe("pickRecipients", () => {
  it("prefers the decision maker's own address over role inboxes, and skips off-domain and no-reply", () => {
    const lead = makeLead({
      research: makeResearch(),
      enrichment: enrichment([
        "info@lonestarfreight.com",
        "noreply@lonestarfreight.com",
        "maria@lonestarfreight.com",
        "someone@gmail-vendor.com",
      ]),
    });
    const [first, ...rest] = pickRecipients(lead, 5);
    expect(first).toMatchObject({ email: "maria@lonestarfreight.com", firstName: "Maria", lastName: "Gonzalez" });
    expect(rest.map((r) => r.email)).toEqual(["info@lonestarfreight.com"]);
    expect(rest[0]).toMatchObject({ isRoleInbox: true, firstName: "Maria" });
  });

  it("puts imported named contacts first", () => {
    const lead = makeLead({
      research: makeResearch(),
      contacts: [{ email: "sam@lonestarfreight.com", name: "Sam Lee", title: "Ops", source: "import" }],
      enrichment: enrichment(["info@lonestarfreight.com"]),
    });
    expect(pickRecipients(lead, 1)).toEqual([
      { email: "sam@lonestarfreight.com", firstName: "Sam", lastName: "Lee", title: "Ops", isRoleInbox: false },
    ]);
  });
});

describe("buildExport", () => {
  const good = makeLead({ research: makeResearch(), enrichment: enrichment(["maria@lonestarfreight.com"]) });
  const low = makeLead({ id: "low", name: "Low Fit", domain: "low.com", research: makeResearch({ fit_score: 30 }) });
  const dq = makeLead({
    id: "dq",
    name: "Big Corp",
    domain: "big.com",
    research: makeResearch({ disqualified: true, disqualify_reason: "too large" }),
  });
  const noEmail = makeLead({ id: "ne", name: "No Email", domain: "ne.com", research: makeResearch(), enrichment: enrichment([]) });
  const raw = makeLead({ id: "raw", name: "Raw", domain: "raw.com" });

  const result = buildExport([low, dq, noEmail, raw, good], SENDER, { minScore: 60, perCompany: 1, includeFooter: true });

  it("exports only qualified, scored leads with an email", () => {
    expect(result.exportedLeadIds).toEqual([good.id]);
    expect(result.skipped.map((s) => s.lead).sort()).toEqual(["Big Corp", "Low Fit", "No Email", "Raw"]);
  });

  it("fills first names and appends the compliance footer", () => {
    const rows = parse(result.csv, { columns: true }) as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("maria@lonestarfreight.com");
    expect(rows[0].body_1).toMatch(/^Hi Maria,/);
    expect(rows[0].body_2).toMatch(/^Hi Maria,/);
    expect(rows[0].body_4).toContain("1 Main St, Wilmington, DE");
    expect(rows[0].body_4).toContain('Reply "no"');
    expect(rows[0].subject_1).toBe("tenders at lone star");
  });

  it("writes a review sheet with skip reasons", () => {
    expect(result.review).toContain("## Lone Star Freight (score 82)");
    expect(result.review).toContain("Big Corp: disqualified: too large");
  });

  it("falls back to 'there' when no name is known", () => {
    const anon = makeLead({
      research: makeResearch({ decision_maker: { name: "", title: "", evidence: "" } }),
      enrichment: enrichment(["info@lonestarfreight.com"]),
    });
    const rows = parse(buildExport([anon], SENDER, { minScore: 0, perCompany: 1, includeFooter: false }).csv, {
      columns: true,
    }) as Record<string, string>[];
    expect(rows[0].body_1).toBe("Hi there,\n\nOne.");
  });
});
