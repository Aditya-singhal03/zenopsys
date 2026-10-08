import type { Lead } from "../types.js";
import { normalizeDomain, normalizeUrl, nowIso, sleep } from "../util.js";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "nextPageToken",
].join(",");

interface PlacesResponse {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    rating?: number;
    userRatingCount?: number;
    primaryTypeDisplayName?: { text: string };
    businessStatus?: string;
  }[];
  nextPageToken?: string;
}

/**
 * Searches Google Places (New) Text Search, e.g. "freight broker in Dallas, TX".
 * The API returns at most 20 results per page and 60 per query, so run several
 * city-level queries rather than one broad one.
 */
export async function searchPlaces(opts: {
  apiKey: string;
  query: string;
  niche: string;
  limit: number;
}): Promise<Lead[]> {
  const leads: Lead[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": opts.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: opts.query, pageSize: 20, pageToken }),
    });
    if (!res.ok) {
      throw new Error(`Places API ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as PlacesResponse;

    for (const place of body.places ?? []) {
      if (place.businessStatus === "CLOSED_PERMANENTLY") continue;
      const now = nowIso();
      leads.push({
        id: `places:${place.id}`,
        niche: opts.niche,
        name: place.displayName?.text ?? "Unknown",
        website: normalizeUrl(place.websiteUri),
        domain: normalizeDomain(place.websiteUri),
        phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
        address: place.formattedAddress,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        category: place.primaryTypeDisplayName?.text,
        source: "places",
        sourceQuery: opts.query,
        contacts: [],
        status: "new",
        createdAt: now,
        updatedAt: now,
      });
      if (leads.length >= opts.limit) return leads;
    }

    pageToken = body.nextPageToken;
    // A fresh page token can take a moment to become valid.
    if (pageToken) await sleep(1500);
  } while (pageToken);

  return leads;
}
