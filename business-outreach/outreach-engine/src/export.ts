import { stringify } from "csv-stringify/sync";
import type { Lead, SenderConfig } from "./types.js";
import { firstName } from "./util.js";

const ROLE_INBOX = /^(info|contact|hello|office|admin|sales|support|service|team|mail|enquiries|inquiries|help|booking|bookings|reservations|dispatch|quotes?)@/i;
const NEVER_EMAIL = /^(no-?reply|donotreply|privacy|abuse|postmaster|webmaster|careers|jobs|hr|recruiting|billing|accounts?payable|ap)@/i;

export interface Recipient {
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  isRoleInbox: boolean;
}

/**
 * Picks who to email at a company: imported contacts first, then website addresses,
 * preferring a personal address matching the decision maker over role inboxes.
 */
export function pickRecipients(lead: Lead, perCompany: number): Recipient[] {
  const decisionMaker = lead.research?.decision_maker.name ?? "";
  const dmFirst = firstName(decisionMaker).toLowerCase();

  const candidates: (Recipient & { rank: number })[] = [];
  for (const c of lead.contacts) {
    if (NEVER_EMAIL.test(c.email)) continue;
    const [first = "", ...rest] = (c.name ?? "").split(/\s+/);
    candidates.push({
      email: c.email,
      firstName: first,
      lastName: rest.join(" "),
      title: c.title ?? "",
      isRoleInbox: ROLE_INBOX.test(c.email),
      rank: ROLE_INBOX.test(c.email) ? 2 : 0,
    });
  }
  for (const email of lead.enrichment?.emails ?? []) {
    if (NEVER_EMAIL.test(email) || candidates.some((c) => c.email === email)) continue;
    // Only email addresses on the company's own domain; third-party addresses are usually vendors.
    if (lead.domain && !email.endsWith(`@${lead.domain}`)) continue;
    const local = email.split("@")[0].toLowerCase();
    const matchesDm = dmFirst.length > 1 && local.includes(dmFirst);
    const role = ROLE_INBOX.test(email);
    candidates.push({
      email,
      firstName: matchesDm ? firstName(decisionMaker) : "",
      lastName: matchesDm ? decisionMaker.split(/\s+/).slice(1).join(" ") : "",
      title: matchesDm ? lead.research?.decision_maker.title ?? "" : "",
      isRoleInbox: role,
      rank: matchesDm ? 0 : role ? 3 : 1,
    });
  }
  // A role inbox reaches whoever reads it, so greet the decision maker if we know their name.
  for (const c of candidates) {
    if (!c.firstName && c.isRoleInbox && dmFirst) c.firstName = firstName(decisionMaker);
  }
  return candidates
    .sort((a, b) => a.rank - b.rank)
    .slice(0, perCompany)
    .map(({ rank: _rank, ...r }) => r);
}

export function complianceFooter(sender: SenderConfig): string {
  return `\n\n--\n${sender.company}, ${sender.postal_address}\nNot relevant? Reply "no" and I won't email again.`;
}

export function fillTemplate(text: string, recipient: Recipient): string {
  return text.replace(/\{\{\s*first_name\s*\}\}/gi, recipient.firstName || "there");
}

export interface ExportOptions {
  minScore: number;
  perCompany: number;
  includeFooter: boolean;
}

export interface ExportResult {
  csv: string;
  review: string;
  exportedLeadIds: string[];
  skipped: { lead: string; reason: string }[];
}

/** Builds a campaign CSV (one row per recipient, ready for Instantly/Smartlead) and a human review sheet. */
export function buildExport(leads: Lead[], sender: SenderConfig, opts: ExportOptions): ExportResult {
  const rows: Record<string, string | number>[] = [];
  const skipped: { lead: string; reason: string }[] = [];
  const exportedLeadIds: string[] = [];
  const reviewSections: string[] = [];

  const ranked = [...leads].sort((a, b) => (b.research?.fit_score ?? 0) - (a.research?.fit_score ?? 0));
  for (const lead of ranked) {
    const r = lead.research;
    if (!r) {
      skipped.push({ lead: lead.name, reason: "not researched" });
      continue;
    }
    if (r.disqualified) {
      skipped.push({ lead: lead.name, reason: `disqualified: ${r.disqualify_reason}` });
      continue;
    }
    if (r.fit_score < opts.minScore) {
      skipped.push({ lead: lead.name, reason: `score ${r.fit_score} < ${opts.minScore}` });
      continue;
    }
    const recipients = pickRecipients(lead, opts.perCompany);
    if (recipients.length === 0) {
      skipped.push({ lead: lead.name, reason: "no usable email (find the owner on LinkedIn / Apollo, or use the phone)" });
      continue;
    }

    exportedLeadIds.push(lead.id);
    for (const recipient of recipients) {
      const row: Record<string, string | number> = {
        email: recipient.email,
        first_name: recipient.firstName,
        last_name: recipient.lastName,
        title: recipient.title,
        company_name: lead.name,
        website: lead.website ?? "",
        phone: lead.phone ?? "",
        location: lead.address ?? "",
        niche: lead.niche,
        fit_score: r.fit_score,
        role_inbox: recipient.isRoleInbox ? "yes" : "no",
        personalization: r.personalized_first_line,
      };
      r.email_sequence.slice(0, 4).forEach((step, i) => {
        row[`subject_${i + 1}`] = fillTemplate(step.subject, recipient);
        row[`body_${i + 1}`] = fillTemplate(step.body, recipient) + (opts.includeFooter ? complianceFooter(sender) : "");
        row[`day_${i + 1}`] = step.day;
      });
      row.linkedin_note = r.linkedin_note;
      row.whatsapp_message = r.whatsapp_message;
      rows.push(row);
    }

    reviewSections.push(renderReview(lead, recipients));
  }

  const csv = rows.length ? stringify(rows, { header: true }) : "";
  const review = `# Outreach review (${exportedLeadIds.length} companies, ${rows.length} recipients)

Read every email before uploading. Delete any row whose facts look wrong.

${reviewSections.join("\n\n---\n\n")}

## Skipped (${skipped.length})

${skipped.map((s) => `- ${s.lead}: ${s.reason}`).join("\n")}
`;
  return { csv, review, exportedLeadIds, skipped };
}

function renderReview(lead: Lead, recipients: Recipient[]): string {
  const r = lead.research!;
  const pains = r.pains.map((p) => `  - **${p.pain}** (${p.confidence}): ${p.evidence} → ${p.solution}`).join("\n");
  const emails = r.email_sequence
    .map((s, i) => `**Email ${i + 1} (day ${s.day}): ${s.subject}**\n\n${s.body.replace(/^/gm, "> ")}`)
    .join("\n\n");
  return `## ${lead.name} (score ${r.fit_score})

- Website: ${lead.website ?? "n/a"} · Phone: ${lead.phone ?? "n/a"} · ${lead.address ?? ""}
- To: ${recipients.map((c) => `${c.email}${c.isRoleInbox ? " (role inbox)" : ""}`).join(", ")}
- Decision maker: ${r.decision_maker.name || "unknown"} ${r.decision_maker.title ? `(${r.decision_maker.title})` : ""}
- Summary: ${r.business_summary}
- Why: ${r.fit_reasons.join("; ")}
- Pains:
${pains}
- Angle: ${r.angle}
- Mystery shop first: ${r.mystery_shop_plan}
- Discovery questions: ${r.questions_for_discovery_call.join(" | ")}
- LinkedIn note: ${r.linkedin_note}

${emails}`;
}
