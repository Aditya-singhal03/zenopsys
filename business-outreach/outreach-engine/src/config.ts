import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { NicheConfig, SenderConfig } from "./types.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NICHES_DIR = path.join(ROOT, "niches");
export const DATA_FILE = path.join(ROOT, "data", "leads.json");
export const OUT_DIR = path.join(ROOT, "out");

const NicheSchema = z.object({
  id: z.string(),
  name: z.string(),
  market: z.enum(["US", "IN"]),
  icp: z.string(),
  disqualifiers: z.array(z.string()),
  pains: z.array(z.object({ pain: z.string(), solution: z.string(), evidence_to_look_for: z.string() })),
  offer: z.string(),
  guarantee: z.string(),
  common_tools: z.array(z.string()),
  mystery_shop: z.array(z.string()),
  tone: z.string(),
  language_notes: z.string().optional(),
});

const SenderSchema = z.object({
  name: z.string(),
  company: z.string(),
  website: z.string(),
  phone: z.string(),
  calendar_link: z.string(),
  demo_video_link: z.string(),
  postal_address: z.string(),
  linkedin: z.string(),
  about: z.string(),
});

export function listNiches(): string[] {
  return fs
    .readdirSync(NICHES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadNiche(id: string): NicheConfig {
  const file = path.join(NICHES_DIR, `${id}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown niche "${id}". Available: ${listNiches().join(", ")}`);
  }
  return NicheSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** Loads sender.json, falling back to the example so a dry run works before setup. */
export function loadSender(): { sender: SenderConfig; isExample: boolean } {
  const real = path.join(ROOT, "sender.json");
  const example = path.join(ROOT, "sender.example.json");
  const isExample = !fs.existsSync(real);
  const sender = SenderSchema.parse(JSON.parse(fs.readFileSync(isExample ? example : real, "utf8")));
  return { sender, isExample };
}
