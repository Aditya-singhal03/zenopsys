import type { Research } from "../src/research/schema.js";
import type { Lead, SenderConfig } from "../src/types.js";

export const HOME_HTML = `<!doctype html><html><head><title>Lone Star Freight | Dallas Freight Broker</title>
<script src="https://js.hs-scripts.com/123.js"></script></head>
<body>
<nav><a href="/about-us">About</a> <a href="/careers">Careers</a> <a href="/contact">Contact</a>
<a href="/blog/post-1">Blog</a> <a href="https://www.linkedin.com/company/lone-star-freight">LinkedIn</a>
<a href="/files/brochure.pdf">Brochure</a> <a href="https://other-site.com/about">Partner</a></nav>
<h1>Dry van and reefer capacity across Texas</h1>
<p>Email your loads to <a href="mailto:quotes@lonestarfreight.com">quotes@lonestarfreight.com</a> or call (214) 555-0182.</p>
<img src="logo@2x.png" alt="">
<script>var x = "tracking@sentry.io";</script>
</body></html>`;

export const ABOUT_HTML = `<html><head><title>About</title></head><body>
<p>Founded in 2014 by Maria Gonzalez, Lone Star Freight is a team of 12 logistics pros.</p>
<p>Reach Maria directly: maria@lonestarfreight.com</p></body></html>`;

export const CAREERS_HTML = `<html><head><title>Careers</title></head><body>
<h2>We're hiring!</h2><p>Open positions: Logistics Coordinator, Night Dispatcher.</p></body></html>`;

export const CONTACT_HTML = `<html><head><title>Contact</title></head><body>
<form><input type="email" name="email"><textarea name="msg"></textarea></form></body></html>`;

export const SENDER: SenderConfig = {
  name: "Aditya Singhal",
  company: "Opsloop",
  website: "opsloop.ai",
  phone: "+1 555 010 0000",
  calendar_link: "https://cal.com/x",
  demo_video_link: "https://loom.com/x",
  postal_address: "1 Main St, Wilmington, DE",
  linkedin: "https://linkedin.com/in/x",
  about: "Backend engineer and founder.",
};

export function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "domain:lonestarfreight.com",
    niche: "freight-brokers",
    name: "Lone Star Freight",
    website: "https://lonestarfreight.com/",
    domain: "lonestarfreight.com",
    source: "csv",
    contacts: [],
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeResearch(overrides: Partial<Research> = {}): Research {
  return {
    fit_score: 82,
    fit_reasons: ["12-person brokerage", "hiring a logistics coordinator"],
    disqualified: false,
    disqualify_reason: "",
    business_summary: "Dallas freight broker.",
    estimated_size: "12 staff",
    decision_maker: { name: "Maria Gonzalez", title: "Founder", evidence: "About page" },
    pains: [{ pain: "Manual tender entry", evidence: "Email your loads", solution: "Tender agent", confidence: "high" }],
    angle: "Tender emails",
    personalized_first_line: "Saw you're hiring a logistics coordinator.",
    email_sequence: [
      { day: 0, subject: "tenders at lone star", body: "Hi {{first_name}},\n\nOne." },
      { day: 3, subject: "re: tenders", body: "Hi {{ first_name }},\n\nTwo." },
      { day: 7, subject: "quick question", body: "Hi {{first_name}},\n\nThree." },
      { day: 14, subject: "closing the loop", body: "Hi {{first_name}},\n\nFour." },
    ],
    linkedin_note: "Hi Maria",
    whatsapp_message: "",
    mystery_shop_plan: "Email a quote request.",
    questions_for_discovery_call: ["a", "b", "c"],
    model: "test",
    researchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
