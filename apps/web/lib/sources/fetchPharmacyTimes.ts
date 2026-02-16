/**
 * PharmacyTimes editorial layer: RSS + optional article summary.
 * Citation-safe: store title, summary, link only. Do not copy full article text.
 */

import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";

const RSS_URL = "https://www.pharmacytimes.com/rss";
const MAX_ARTICLES = 5;

export interface PharmacyTimesArticle {
  title: string;
  url: string;
  summary: string;
  source: string;
  published_date: Date | null;
}

function normalizeItems(items: unknown): Array<{ title?: string; link?: string; description?: string; pubDate?: string }> {
  if (Array.isArray(items)) return items as Array<{ title?: string; link?: string; description?: string; pubDate?: string }>;
  if (items != null && typeof items === "object") return [items as { title?: string; link?: string; description?: string; pubDate?: string }];
  return [];
}

export async function fetchPharmacyTimes(query: string): Promise<PharmacyTimesArticle[]> {
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "PharmacyDeck/1.0 (editorial citation)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const rawItems = parsed?.rss?.channel?.item ?? parsed?.rss?.channel?.items ?? [];
    const items = normalizeItems(rawItems);

    const q = query.toLowerCase();
    const matches = items
      .filter((item) => (item.title ?? "").toLowerCase().includes(q))
      .slice(0, MAX_ARTICLES);

    const enriched: PharmacyTimesArticle[] = [];
    for (const item of matches) {
      const link = item.link ?? "";
      const summary = link ? await fetchArticleSummary(link) : "";
      enriched.push({
        title: item.title ?? "Untitled",
        url: link,
        summary: (item.description && typeof item.description === "string" ? item.description : summary).trim().slice(0, 1000),
        source: "pharmacytimes",
        published_date: item.pubDate ? new Date(item.pubDate) : null,
      });
    }
    return enriched;
  } catch (err) {
    console.error("PharmacyTimes fetch error", err);
    return [];
  }
}

async function fetchArticleSummary(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PharmacyDeck/1.0 (editorial citation)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    const selectors = [".article-content p", ".entry-content p", ".post-content p", "article p"];
    let summary = "";
    for (const sel of selectors) {
      const paragraphs = $(sel);
      if (paragraphs.length === 0) continue;
      paragraphs.each((i, el) => {
        if (i < 2) summary += $(el).text().trim() + " ";
      });
      if (summary.trim().length > 0) break;
    }
    return summary.trim().slice(0, 1000);
  } catch {
    return "";
  }
}
