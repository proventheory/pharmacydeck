/**
 * FDA Drug Approval Package PDFs and document links.
 * Uses openFDA Drugs@FDA API: https://api.fda.gov/drug/drugsfda.json
 * Approval packages (review docs, labels) are linked from accessdata.fda.gov.
 */

const OPENFDA_DRUGSFDA = "https://api.fda.gov/drug/drugsfda.json";

export interface FDAPackageDocument {
  title: string;
  type: string;
  url: string;
  date: string | null;
}

export interface FDAPackagesResult {
  application_number: string | null;
  application_type: string | null;
  approval_date: string | null;
  sponsor_name: string | null;
  packages: FDAPackageDocument[];
  submissions: Array<{ submission_type: string; submission_number: string; submission_date: string | null }>;
}

/** Drugs@FDA application overview (same params as used on FDA TOC pages). */
function buildApplicationOverviewUrl(applicationNumber: string): string {
  const num = applicationNumber.replace(/^(NDA|ANDA|BLA)\s*/i, "").trim();
  return `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&varApplNo=${encodeURIComponent(num)}`;
}

/**
 * Fetch FDA approval package metadata and document links for a drug.
 * By application number (e.g. NDA208387) or by RxCUI / substance name via openFDA label first.
 */
export async function fetchFDAPackages(options: {
  application_number?: string | null;
  rxcui?: string | null;
  substance_name?: string | null;
}): Promise<FDAPackagesResult> {
  const empty: FDAPackagesResult = {
    application_number: null,
    application_type: null,
    approval_date: null,
    sponsor_name: null,
    packages: [],
    submissions: [],
  };

  let appNumber = options.application_number?.trim().replace(/\s+/g, "");
  if (!appNumber && (options.rxcui || options.substance_name)) {
    appNumber = (await resolveApplicationNumber(options.rxcui ?? undefined, options.substance_name ?? undefined)) ?? undefined;
    if (!appNumber) return empty;
  }
  if (!appNumber) return empty;

  try {
    const search = `application_number:${encodeURIComponent(appNumber)}`;
    const res = await fetch(`${OPENFDA_DRUGSFDA}?search=${search}&limit=1`, {
      headers: { "User-Agent": "PharmacyDeck/1.0 (FDA citation)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      results?: Array<{
        application_number?: string;
        submissions?: Array<{
          submission_type?: string;
          submission_number?: string;
          submission_date?: string;
          submission_status?: string;
          application_docs?: Array<{ title?: string; url?: string; type?: string }>;
        }>;
        application_docs?: Array<{ title?: string; url?: string; type?: string; date?: string }>;
        products?: Array<{ approval_date?: string; sponsor_name?: string }>;
      }>;
    };
    const app = data.results?.[0];
    if (!app) return empty;

    const submissions = (app.submissions ?? []).map((s) => ({
      submission_type: s.submission_type ?? "",
      submission_number: s.submission_number ?? "",
      submission_date: s.submission_date ?? null,
    }));

    const approvalDate =
      (app.products?.[0] as { approval_date?: string } | undefined)?.approval_date ??
      submissions.find((s) => /ORIG|SUPPL/i.test(s.submission_type))?.submission_date ??
      null;
    const sponsorName = (app.products?.[0] as { sponsor_name?: string } | undefined)?.sponsor_name ?? null;

    const packages: FDAPackageDocument[] = [];
    const appNum = app.application_number ?? appNumber;

    // Prefer real TOC HTML from API (reliable); fallback to Drugs@FDA overview page
    let tocUrl: string | null = null;
    for (const sub of app.submissions ?? []) {
      const docs = (sub.application_docs ?? []) as Array<{ url?: string }>;
      const toc = docs.find((d) => d.url && /TOC\.html$/i.test(d.url));
      if (toc?.url) {
        tocUrl = toc.url;
        break;
      }
    }
    if (!tocUrl) tocUrl = buildApplicationOverviewUrl(appNum);
    packages.push({
      title: "Approval package (table of contents)",
      type: "toc",
      url: tocUrl,
      date: approvalDate,
    });

    const appDocs = (app.application_docs ?? []) as Array<{ title?: string; url?: string; type?: string; date?: string }>;
    for (const doc of appDocs.slice(0, 15)) {
      if (doc.url && doc.title) {
        packages.push({
          title: doc.title,
          type: (doc.type as string) ?? "document",
          url: doc.url,
          date: doc.date ?? null,
        });
      }
    }

    for (const sub of app.submissions ?? []) {
      const docs = (sub.application_docs ?? []) as Array<{ title?: string; url?: string; type?: string }>;
      for (const doc of docs.slice(0, 5)) {
        if (!doc.url || /TOC\.html$/i.test(doc.url)) continue; // TOC already added as first package
        if (!packages.some((p) => p.url === doc.url)) {
          packages.push({
            title: doc.title ?? "Document",
            type: (doc.type as string) ?? sub.submission_type ?? "document",
            url: doc.url,
            date: sub.submission_date ?? null,
          });
        }
      }
    }

    return {
      application_number: appNum,
      application_type: appNum.match(/^(NDA|ANDA|BLA)/i)?.[0] ?? null,
      approval_date: approvalDate,
      sponsor_name: sponsorName,
      packages,
      submissions,
    };
  } catch (err) {
    console.error("fetchFDAPackages error", err);
    return empty;
  }
}

async function resolveApplicationNumber(rxcui?: string, substanceName?: string): Promise<string | null> {
  try {
    const labelUrl =
      rxcui != null
        ? `https://api.fda.gov/drug/label.json?search=openfda.rxcui:${encodeURIComponent(rxcui)}&limit=1`
        : substanceName
          ? `https://api.fda.gov/drug/label.json?search=openfda.substance_name:${encodeURIComponent(substanceName)}&limit=1`
          : null;
    if (!labelUrl) return null;
    const res = await fetch(labelUrl, { headers: { "User-Agent": "PharmacyDeck/1.0" }, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ openfda?: { application_number?: string[] } }> };
    const nums = data.results?.[0]?.openfda?.application_number;
    return Array.isArray(nums) && nums.length > 0 && typeof nums[0] === "string" ? nums[0] : null;
  } catch {
    return null;
  }
}
