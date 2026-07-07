// functions/articles/[slug].js
// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ARTICLE PAGE — Phase A+B+C (Public Article Page Architecture). Server-
// rendered HTML for a single published ai_articles row, reached at
// /articles/<slug>. Reuses the existing data layer (article-store) and the
// existing SEO pipeline (article-enrich, article-seo) exactly as built — no new
// ranking/recommendation logic, no new tables.
// ════════════════════════════════════════════════════════════════════════════

import { isConfigured, getArticle, listArticles, listImages } from '../utils/article-store.js';
import { conceptFromArticle } from '../utils/article-knowledge.js';
import { buildSeoSuggestion } from '../utils/article-enrich.js';
import { suggestRelatedArticles, buildInternalLinks, suggestSmartChips, buildRecommendationWidget } from '../utils/article-seo.js';
import { ARTICLE_CATEGORIES } from '../utils/article-categories.js';

const BASE_URL = 'https://ztradeuniversity.com';
const HTML_H = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return s;
}

// Minimal markdown → HTML for ai_articles.content (## headings, lists, paragraphs).
function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let listOpen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (listOpen) { out.push('</ul>'); listOpen = false; } continue; }
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (listOpen) { out.push('</ul>'); listOpen = false; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (listOpen) out.push('</ul>');
  return out.join('\n');
}

function categoryLabel(key) {
  return ARTICLE_CATEGORIES.find(c => c.key === key)?.label || key || 'Trading';
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Article Not Found – Z Trade University</title>
  <meta name="robots" content="noindex" />
  <link rel="stylesheet" href="/assets/lux-global.css" />
  <link rel="icon" type="image/png" href="/assets/ztu-logo.png" />
  <style>
    body { font-family: 'Inter', sans-serif; background:#fff; color:#2b2520; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; }
    .wrap { padding: 40px; }
    h1 { font-size: 28px; margin-bottom: 12px; }
    a { color:#c89c3f; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Article not found</h1>
    <p>This article may have been moved or unpublished.</p>
    <p><a href="/articles.html">&larr; Back to Articles</a></p>
  </div>
</body>
</html>`;
}

function renderPage({ article, seo, related, widget, chips, images }) {
  const pageTitle = escapeHtml(seo.metaTitle || article.title);
  const h1 = escapeHtml(seo.h1 || article.title);
  const summary = escapeHtml(seo.metaDescription || article.summary || '');
  const bodyHtml = renderMarkdown(article.content);
  const catLabel = escapeHtml(categoryLabel(article.category));
  const readingTime = article.reading_time ? `${article.reading_time} min read` : null;
  const difficulty = article.difficulty ? escapeHtml(article.difficulty[0].toUpperCase() + article.difficulty.slice(1)) : null;
  const heroImage = images && images[0] ? images[0] : null;

  const metaBits = [catLabel, difficulty, readingTime].filter(Boolean).map(escapeHtml).join(' &middot; ');

  const relatedHtml = (widget && widget.items.length)
    ? `<section class="related-section">
        <h2>${escapeHtml(widget.title)}</h2>
        <div class="related-grid">
          ${widget.items.map(i => `<a class="related-card" href="${escapeHtml(i.url)}">
              <span class="related-type">${i.type === 'article' ? 'Article' : 'Concept'}</span>
              <span class="related-title">${escapeHtml(i.title)}</span>
            </a>`).join('\n')}
        </div>
      </section>`
    : '';

  const externalLinksHtml = (seo.externalLinks && seo.externalLinks.length)
    ? `<section class="related-section">
        <h2>Sources &amp; Further Reading</h2>
        <div class="chips-row">
          ${seo.externalLinks.map(l => `<a class="chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(l.title || l.url)}</a>`).join('\n')}
        </div>
      </section>`
    : '';

  const chipsHtml = (chips && chips.length)
    ? `<section class="chips-section">
        <h2>Ask the AI Mentor</h2>
        <div class="chips-row">
          ${chips.map(c => `<a class="chip" href="/ai-trade-assistant.html">${escapeHtml(c)}</a>`).join('\n')}
        </div>
      </section>`
    : '';

  const faqJsonLd = seo.faqSchema
    ? `<script type="application/ld+json">${JSON.stringify(seo.faqSchema)}</script>`
    : '';
  const twitterCard = escapeHtml(seo.twitterCard || 'summary_large_image');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(article.language || 'en')}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle} – Z Trade University</title>
  <meta name="description" content="${summary}" />
  <link rel="canonical" href="${seo.canonicalUrl}" />
  <meta property="og:title" content="${escapeHtml(seo.ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(seo.ogDescription)}" />
  <meta property="og:type" content="${escapeHtml(seo.ogType)}" />
  <meta property="og:url" content="${seo.ogUrl}" />
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${escapeHtml(seo.ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(seo.ogDescription)}" />
  ${seo.keywordsCsv ? `<meta name="keywords" content="${escapeHtml(seo.keywordsCsv)}" />` : ''}
  ${heroImage ? `<meta property="og:image" content="${escapeHtml(heroImage.url)}" />` : ''}
  ${heroImage ? `<meta name="twitter:image" content="${escapeHtml(heroImage.url)}" />` : ''}
  ${faqJsonLd}
  <link rel="icon" type="image/png" href="/assets/ztu-logo.png" />
  <link rel="stylesheet" href="/assets/lux-global.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Manrope:wght@700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #1a1410; --purple: #c89c3f; --purple2: #d4ae5e; --white: #ffffff;
      --text: #2b2520; --muted: #756347; --border: rgba(0,0,0,0.07); --radius: 16px;
    }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', sans-serif; background: var(--white); color: var(--text); -webkit-font-smoothing: antialiased; line-height: 1.7; }
    .container { max-width: 1160px; margin: 0 auto; padding: 0 28px; }

    header { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(255,255,255,0.97); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(0,0,0,0.065); box-shadow: 0 1px 0 rgba(0,0,0,0.04); }
    nav { display: flex; align-items: center; justify-content: space-between; height: 72px; }
    .logo { display: flex; align-items: center; gap: 11px; text-decoration: none; }
    .logo-shield { width: 40px; height: 40px; flex-shrink: 0; border-radius: 11px; background: linear-gradient(150deg, #3d2a08 0%, #8c6c1f 55%, var(--purple2) 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(200,156,63,0.38), 0 1px 0 rgba(255,255,255,0.12) inset; position: relative; overflow: hidden; }
    .logo-shield span { position: relative; z-index: 1; font-family: 'Manrope','Inter',sans-serif; font-size: 20px; font-weight: 900; color: var(--purple); letter-spacing: -1px; line-height: 1; }
    .logo-text { display: flex; flex-direction: column; line-height: 1.2; }
    .logo-text b { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -.3px; }
    .logo-text small { font-size: 9.5px; font-weight: 700; color: var(--muted); letter-spacing: 2px; text-transform: uppercase; }
    .nav-links { display: flex; align-items: center; gap: 0; list-style: none; }
    .nav-links a { font-size: 13.5px; font-weight: 500; color: #2b2520; text-decoration: none; padding: 8px 15px; border-radius: 8px; transition: color .18s, background .18s; }
    .nav-links a:hover { color: var(--purple); background: rgba(200,156,63,0.05); }
    .nav-links a.active { font-weight: 700; color: var(--text); }
    @media (max-width: 860px) { .nav-links { display: none; } }

    main { padding: 128px 0 80px; }
    .article-head { max-width: 760px; margin: 0 auto 32px; }
    .article-meta { font-size: 12.5px; font-weight: 700; color: var(--purple); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px; }
    .article-head h1 { font-family: 'Manrope','Inter',sans-serif; font-size: clamp(28px, 5vw, 44px); font-weight: 800; letter-spacing: -1px; line-height: 1.2; margin-bottom: 16px; }
    .article-summary { font-size: 17px; color: var(--muted); }

    .article-body { max-width: 760px; margin: 0 auto; font-size: 16.5px; }
    .article-body h2 { font-family: 'Manrope','Inter',sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -.4px; margin: 36px 0 14px; }
    .article-body h3 { font-size: 19px; font-weight: 700; margin: 28px 0 10px; }
    .article-body p { margin-bottom: 16px; color: var(--text); }
    .article-body ul { margin: 0 0 16px 22px; }
    .article-body li { margin-bottom: 8px; }

    .related-section, .chips-section { max-width: 760px; margin: 48px auto 0; padding-top: 32px; border-top: 1px solid var(--border); }
    .related-section h2, .chips-section h2 { font-family: 'Manrope','Inter',sans-serif; font-size: 18px; font-weight: 800; margin-bottom: 16px; }
    .related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .related-card { display: flex; flex-direction: column; gap: 6px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; color: var(--text); transition: border-color .18s, transform .18s; }
    .related-card:hover { border-color: var(--purple2); transform: translateY(-2px); }
    .related-type { font-size: 10.5px; font-weight: 700; color: var(--purple); text-transform: uppercase; letter-spacing: 1.5px; }
    .related-title { font-size: 14.5px; font-weight: 600; }

    .chips-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip { display: inline-flex; align-items: center; padding: 9px 16px; border-radius: 100px; border: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text); text-decoration: none; transition: background .18s, border-color .18s; }
    .chip:hover { background: rgba(200,156,63,0.08); border-color: var(--purple2); }

    footer { padding: 40px 0; border-top: 1px solid var(--border); text-align: center; }
    footer a { color: var(--purple); text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
<header>
  <nav class="container">
    <a href="/index.html" class="logo">
      <div class="logo-shield"><span>Z</span></div>
      <div class="logo-text">
        <b>Z Trade University</b>
        <small>University</small>
      </div>
    </a>
    <ul class="nav-links">
      <li><a href="/index.html">Home</a></li>
      <li><a href="/articles.html" class="active">Articles</a></li>
      <li><a href="/index.html#join">Join Now</a></li>
      <li><a href="/about.html">About</a></li>
    </ul>
  </nav>
</header>

<main>
  <div class="container">
    <div class="article-head">
      <div class="article-meta">${metaBits}</div>
      <h1>${h1}</h1>
      ${summary ? `<p class="article-summary">${summary}</p>` : ''}
    </div>
    <div class="article-body">
      ${bodyHtml}
    </div>
    ${externalLinksHtml}
    ${relatedHtml}
    ${chipsHtml}
  </div>
</main>

<footer>
  <div class="container">
    <p>&copy; 2024 Z Trade University. &nbsp; <a href="/articles.html">More Articles</a></p>
  </div>
</footer>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const slug = params.slug;

  if (!isConfigured(env) || !slug) {
    return new Response(notFoundPage(), { status: 404, headers: HTML_H });
  }

  const article = await getArticle(env, slug);
  if (!article || article.is_active !== true) {
    return new Response(notFoundPage(), { status: 404, headers: HTML_H });
  }

  // Canonical URL enforcement — if this article was reached via its UUID (or any
  // non-canonical path), 301 to /articles/<slug> so only one URL is ever live.
  if (article.slug && slug !== article.slug) {
    return Response.redirect(new URL(`/articles/${article.slug}`, request.url).toString(), 301);
  }

  const allArticles = await listArticles(env, { status: 'published', limit: 200 }).catch(() => []);
  const draftLike = {
    id: article.id,
    category: article.category,
    concepts: article.tags || [],
    relevanceTags: article.tags || [],
    level: article.difficulty,
    status: 'published',
  };

  const related = suggestRelatedArticles(draftLike, allArticles, { limit: 3 });
  const links = buildInternalLinks(draftLike, { conceptEntries: [], relatedArticles: related, baseUrl: BASE_URL });
  const widget = buildRecommendationWidget(draftLike, links);
  const chips = suggestSmartChips(draftLike, { conceptEntries: [], relatedArticles: related, limit: 6 });

  const concept = conceptFromArticle(article) || {};
  const seo = buildSeoSuggestion(
    { ...concept, id: article.slug, title: article.title, seo: { description: article.summary || '', keywords: article.tags || [] } },
    { baseUrl: BASE_URL, urlPath: `/articles/${article.slug}`, overrides: article.seo_overrides || {} }
  );

  const images = await listImages(env, article.id).catch(() => []);

  return new Response(renderPage({ article, seo, related, widget, chips, images }), { headers: HTML_H });
}
