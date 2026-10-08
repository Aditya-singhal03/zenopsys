import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leadsFromCsv } from "../src/sources/csv.js";
import { LeadStore } from "../src/store.js";
import { makeLead } from "./fixtures.js";

describe("leadsFromCsv", () => {
  it("maps Apollo-style columns and groups contacts by company domain", () => {
    const csv = [
      "First Name,Last Name,Title,Company,Email,Website,Company Phone,City,State",
      "Maria,Gonzalez,Owner,Lone Star Freight,MARIA@lonestarfreight.com,http://www.lonestarfreight.com,214-555-0182,Dallas,TX",
      "Sam,Lee,Ops Manager,Lone Star Freight,sam@lonestarfreight.com,lonestarfreight.com,,Dallas,TX",
      "Ana,Ruiz,CEO,Peach Logistics,ana@peachlogistics.com,peachlogistics.com,,Atlanta,GA",
    ].join("\n");
    const leads = leadsFromCsv(csv, "freight-brokers");
    expect(leads).toHaveLength(2);
    const lonestar = leads.find((l) => l.domain === "lonestarfreight.com")!;
    expect(lonestar.id).toBe("domain:lonestarfreight.com");
    expect(lonestar.address).toBe("Dallas, TX");
    expect(lonestar.contacts.map((c) => c.email)).toEqual(["maria@lonestarfreight.com", "sam@lonestarfreight.com"]);
    expect(lonestar.contacts[0]).toMatchObject({ name: "Maria Gonzalez", title: "Owner" });
  });

  it("accepts a sheet with only business names", () => {
    const leads = leadsFromCsv("Business Name,Phone\nAcme Plumbing,555-111-2222\n", "home-services");
    expect(leads[0]).toMatchObject({ name: "Acme Plumbing", phone: "555-111-2222", id: "name:acme-plumbing" });
  });

  it("rejects files with no company or website column", () => {
    expect(() => leadsFromCsv("Foo,Bar\n1,2\n", "x")).toThrow(/company name or website/);
  });
});

describe("LeadStore", () => {
  it("dedupes by domain and by name + phone, and persists", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "leads-")), "leads.json");
    const store = new LeadStore(file);
    expect(store.add(makeLead())).toBe(true);
    expect(store.add(makeLead({ id: "places:abc" }))).toBe(false);
    expect(store.add(makeLead({ id: "a", domain: undefined, name: "Acme", phone: "(555) 111-2222" }))).toBe(true);
    expect(store.add(makeLead({ id: "b", domain: undefined, name: "ACME", phone: "+1 555 111 2222" }))).toBe(false);
    store.update("a", { status: "enriched" });
    store.save();
    const reloaded = new LeadStore(file);
    expect(reloaded.all()).toHaveLength(2);
    expect(reloaded.get("a")?.status).toBe("enriched");
  });
});
