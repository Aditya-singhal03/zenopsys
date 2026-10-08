import { z } from "zod";

const EmailStep = z.object({
  day: z.number().describe("Whole number of days after the first email, e.g. 0, 3, 7, 14"),
  subject: z.string().describe("Lowercase-ish, 2-6 words, no clickbait, no emojis"),
  body: z.string().describe("Plain text, under 110 words, no links except where the sender config provides them"),
});

export const ResearchSchema = z.object({
  fit_score: z
    .number()
    .describe("Integer 0-100. How well this business matches the ICP and how likely it has a pain we solve"),
  fit_reasons: z.array(z.string()).describe("Short bullet reasons for the score, each tied to evidence"),
  disqualified: z.boolean().describe("True if any disqualifier applies or the business is clearly out of scope"),
  disqualify_reason: z.string().describe("Empty string unless disqualified"),
  business_summary: z.string().describe("2-3 sentences: what they do, who for, rough size, where"),
  estimated_size: z.string().describe('e.g. "owner + 3 staff", "10-25 employees", "unknown"'),
  decision_maker: z.object({
    name: z.string().describe("Owner/founder/GM name if found on the site, else empty string"),
    title: z.string().describe("Their title if known, else empty string"),
    evidence: z.string().describe("Where on the site the name appeared, else empty string"),
  }),
  pains: z
    .array(
      z.object({
        pain: z.string(),
        evidence: z.string().describe("The concrete observation from the site/data that suggests this pain"),
        solution: z.string().describe("What we would build, naming their tools where known"),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .describe("Ranked, most promising first, max 3"),
  angle: z.string().describe("The single best angle for the first email, one sentence"),
  personalized_first_line: z
    .string()
    .describe("One sentence referencing a specific, verifiable fact from their site. Never flattery, never invented"),
  email_sequence: z.array(EmailStep).describe("Exactly 4 emails: opener, value/demo, alternative-pain question, polite breakup"),
  linkedin_note: z.string().describe("Connection request under 280 characters, no pitch"),
  whatsapp_message: z.string().describe("Only for India-market niches, else empty string. Short, for after first contact"),
  mystery_shop_plan: z.string().describe("A concrete test to run as a customer before outreach and what result would prove the pain"),
  questions_for_discovery_call: z.array(z.string()).describe("3 questions specific to this business"),
});

export type Research = z.infer<typeof ResearchSchema> & { model: string; researchedAt: string };
