import type { Research } from "./research/schema.js";

export type LeadStatus =
  | "new"
  | "enriched"
  | "researched"
  | "disqualified"
  | "exported"
  | "error";

export interface Contact {
  email: string;
  name?: string;
  title?: string;
  source: "website" | "import";
}

export interface Enrichment {
  fetchedAt: string;
  pages: { url: string; title: string }[];
  /** Visible text of the crawled pages, trimmed to a budget so research prompts stay small. */
  text: string;
  emails: string[];
  phones: string[];
  socials: Record<string, string>;
  tech: string[];
  hiringSignals: string[];
  hasContactForm: boolean;
  hasChatWidget: boolean;
  hasOnlineBooking: boolean;
  error?: string;
}

export interface Lead {
  id: string;
  niche: string;
  name: string;
  website?: string;
  domain?: string;
  phone?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  source: "places" | "csv";
  sourceQuery?: string;
  contacts: Contact[];
  enrichment?: Enrichment;
  research?: Research;
  researchError?: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NicheConfig {
  id: string;
  name: string;
  market: "US" | "IN";
  /** Who we want: size, type, decision maker. */
  icp: string;
  /** Who we don't want. */
  disqualifiers: string[];
  /** Pains we can solve, each with what we build for it. */
  pains: { pain: string; solution: string; evidence_to_look_for: string }[];
  offer: string;
  guarantee: string;
  /** Software they commonly use, so the research can name the integration. */
  common_tools: string[];
  /** Mystery-shop ideas: how to experience their process as a customer. */
  mystery_shop: string[];
  tone: string;
  language_notes?: string;
}

export interface SenderConfig {
  name: string;
  company: string;
  website: string;
  phone: string;
  calendar_link: string;
  demo_video_link: string;
  /** Required by CAN-SPAM for US cold email. */
  postal_address: string;
  linkedin: string;
  about: string;
}
