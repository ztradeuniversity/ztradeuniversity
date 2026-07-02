// functions/sitemap.xml.js
// ════════════════════════════════════════════════════════════════════════════
// DYNAMIC SITEMAP — Phase A+B+C (Dynamic Sitemap Generation). Cloudflare Pages
// Functions take precedence over the static /sitemap.xml asset, so this Function
// now serves the sitemap: the existing hand-curated static pages (ported once,
// below) plus every published ai_articles row that has a real page at
// /articles/<slug> (via the existing public-article-page Function and the
// existing buildSitemapEntry from article-seo.js — no new ranking logic).
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, listArticles } from './utils/article-store.js';
import { buildSitemapEntry } from './utils/article-seo.js';

const BASE_URL = 'https://ztradeuniversity.com';

// Ported 1:1 from the previous static sitemap.xml.
const STATIC_ENTRIES = [
  { url: `${BASE_URL}/privacy-policy.html`, lastmod: '2026-05-15', changefreq: 'yearly', priority: 0.4 },
  { url: `${BASE_URL}/ai-trade-assistant.html`, lastmod: '2026-06-01', changefreq: 'weekly', priority: 0.9 },
  { url: `${BASE_URL}/`, lastmod: '2026-05-15', changefreq: 'weekly', priority: 1.0 },
  { url: `${BASE_URL}/articles.html`, lastmod: '2026-05-15', changefreq: 'weekly', priority: 0.9 },
  { url: `${BASE_URL}/about.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.7 },
  { url: `${BASE_URL}/live-sentiment.html`, lastmod: '2026-05-15', changefreq: 'daily', priority: 0.9 },
  { url: `${BASE_URL}/trader-assessment.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/best-brokers-account-creation-guide.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.85 },
  { url: `${BASE_URL}/gold-trading-strategy-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/how-to-trade-gold-xauusd-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/best-time-to-trade-gold-xauusd.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-gold-scalping-strategy-2025.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/xauusd-buy-or-sell-today.html`, lastmod: '2026-05-15', changefreq: 'daily', priority: 0.8 },
  { url: `${BASE_URL}/fomc-cpi-gold-trading-guide.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/trading-signals-explained-research-based-guide.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/best-forex-signals-for-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-crypto-trading-signals-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/how-to-start-forex-trading-2025.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/forex-leverage-explained-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-forex-pairs-for-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-risk-management-strategy.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/best-risk-reward-ratio-forex-trading.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/how-to-use-stop-loss-and-take-profit.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/why-stop-loss-gets-hit.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-trading-strategy-for-beginners-2025.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.8 },
  { url: `${BASE_URL}/most-popular-trading-strategies-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/price-action-trading-strategy-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/support-and-resistance-trading-strategy.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/breakout-trading-strategy-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/trend-trading-strategy-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/swing-trading-vs-scalping.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/how-to-build-forex-trading-plan.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/market-structure-trading-guide.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/smart-money-concepts-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/candlestick-patterns-for-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/best-indicators-forex-gold-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/how-to-read-forex-news-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.7 },
  { url: `${BASE_URL}/best-timeframe-for-forex-trading-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.7 },
  { url: `${BASE_URL}/trading-psychology-successful-traders.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/how-to-avoid-emotional-trading.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/why-forex-traders-lose-money.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/top-10-forex-trading-mistakes.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.75 },
  { url: `${BASE_URL}/demo-trading-vs-live-trading.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.7 },
  { url: `${BASE_URL}/trading-journal-for-beginners.html`, lastmod: '2026-05-15', changefreq: 'monthly', priority: 0.7 },
];

function entryXml(e) {
  return `  <url>\n    <loc>${e.url}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`;
}

export async function onRequestGet(context) {
  const { env } = context;

  let articleEntries = [];
  if (isConfigured(env)) {
    const articles = await listArticles(env, { status: 'published', limit: 500 }).catch(() => []);
    articleEntries = articles
      .filter(a => a.slug)
      .map(a => buildSitemapEntry(
        { id: a.id, level: a.difficulty, status: 'published', updatedAt: a.updated_at },
        { baseUrl: BASE_URL, urlPath: `/articles/${a.slug}` }
      ))
      .filter(e => e.readyForSitemap);
  }

  // De-dupe by <loc> (Set-based) — keeps the first occurrence, so a slug
  // collision or a repeated static entry can never emit two identical <url>s.
  const seen = new Set();
  const all = [...STATIC_ENTRIES, ...articleEntries].filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all.map(entryXml).join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
