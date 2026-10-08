export function nowIso(): string {
  return new Date().toISOString();
}

/** Returns the registrable-ish host for dedupe: lowercased, no scheme, no "www.", no path. */
export function normalizeDomain(input: string | undefined): string | undefined {
  if (!input) return undefined;
  let raw = input.trim();
  if (!raw) return undefined;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeUrl(input: string | undefined): string | undefined {
  const domain = normalizeDomain(input);
  if (!domain || !input) return undefined;
  const raw = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Runs `fn` over `items` with at most `concurrency` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function firstName(fullName: string | undefined): string {
  if (!fullName) return "";
  const cleaned = fullName.replace(/^(mr|mrs|ms|dr)\.?\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] ?? "";
}
