import { describe, expect, it } from "vitest";
import { extractPageFacts, isAllowedByRobots, pickFollowUpLinks } from "../src/enrich/extract.js";
import { normalizeDomain } from "../src/util.js";
import { CAREERS_HTML, CONTACT_HTML, HOME_HTML } from "./fixtures.js";

describe("extractPageFacts", () => {
  const facts = extractPageFacts(HOME_HTML, "https://lonestarfreight.com/");

  it("pulls mailto and text emails but drops junk", () => {
    expect(facts.emails).toEqual(["quotes@lonestarfreight.com"]);
  });

  it("finds phones, socials and tech", () => {
    expect(facts.phones).toContain("(214) 555-0182");
    expect(facts.socials.linkedin).toContain("linkedin.com/company/lone-star-freight");
    expect(facts.tech).toContain("HubSpot");
  });

  it("strips scripts from visible text", () => {
    expect(facts.text).toContain("Dry van and reefer capacity");
    expect(facts.text).not.toContain("sentry");
  });

  it("detects hiring roles only on hiring pages", () => {
    expect(extractPageFacts(CAREERS_HTML, "https://x.com/careers").hiringSignals).toEqual(
      expect.arrayContaining(["dispatcher", "logistics coordinator"]),
    );
    expect(facts.hiringSignals).toEqual([]);
  });

  it("detects contact forms", () => {
    expect(extractPageFacts(CONTACT_HTML, "https://x.com/contact").hasContactForm).toBe(true);
    expect(facts.hasContactForm).toBe(false);
  });
});

describe("pickFollowUpLinks", () => {
  it("keeps same-site, high-signal pages and skips files, blogs and other domains", () => {
    const { links } = extractPageFacts(HOME_HTML, "https://lonestarfreight.com/");
    const picked = pickFollowUpLinks(links, "https://lonestarfreight.com/", 4);
    expect(picked).toEqual(
      expect.arrayContaining([
        "https://lonestarfreight.com/about-us",
        "https://lonestarfreight.com/careers",
        "https://lonestarfreight.com/contact",
      ]),
    );
    expect(picked.some((l) => l.includes("blog") || l.includes(".pdf") || l.includes("other-site"))).toBe(false);
  });

  it("respects the page cap", () => {
    const { links } = extractPageFacts(HOME_HTML, "https://lonestarfreight.com/");
    expect(pickFollowUpLinks(links, "https://lonestarfreight.com/", 1)).toHaveLength(1);
  });
});

describe("isAllowedByRobots", () => {
  const robots = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\n`;
  it("applies only the * group", () => {
    expect(isAllowedByRobots(robots, "/about")).toBe(true);
    expect(isAllowedByRobots(robots, "/private/x")).toBe(false);
    expect(isAllowedByRobots(robots, "/private/ok")).toBe(true);
    expect(isAllowedByRobots("", "/anything")).toBe(true);
  });
});

describe("normalizeDomain", () => {
  it("normalizes urls and bare domains", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeDomain("example.co.in")).toBe("example.co.in");
    expect(normalizeDomain("not a domain")).toBeUndefined();
    expect(normalizeDomain("")).toBeUndefined();
  });
});
