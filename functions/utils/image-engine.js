// functions/utils/image-engine.js
// ════════════════════════════════════════════════════════════════════════════
// IMAGE KNOWLEDGE ENGINE (Module 3) — ARCHITECTURE / FOUNDATION ONLY
//
// Future home for educational screenshots, chart examples, broker screenshots,
// and trading diagrams. Defines the contract for classifying an image,
// retrieving its metadata, and linking it to an article. All functions are safe
// stubs (`configured:false`) until a future phase populates `ai_article_images`
// and (optionally) an image-classification step.
//
//   FUTURE FLOW:
//     image → classifyImage() (type + tags) → store metadata
//           → linkImageToArticle() → retrievable via article-engine / chart flow
// ════════════════════════════════════════════════════════════════════════════

// Canonical image-metadata shape.
export const IMAGE_SCHEMA = {
  id:            'uuid',
  url:           'storage path (bucket: article-images / chart-uploads)',
  kind:          'educational-screenshot | chart-example | broker-screenshot | diagram | user-chart',
  caption:       'string',
  altText:       'string',
  tags:          ['string'],
  articleId:     'uuid → ai_articles (nullable)',
  detected:      'jsonb — {patterns:[], levels:[], trend} when it is a chart',
  createdAt:     'timestamp',
};

export const IMAGE_KINDS = ['educational-screenshot', 'chart-example', 'broker-screenshot', 'diagram', 'user-chart'];

export function isImageStoreConfigured(/* env */) { return false; }

// FUTURE: classify an uploaded/stored image into a kind + tags.
export async function classifyImage(/* { url, hint } */) {
  return { configured: false, kind: null, tags: [] };
}

// FUTURE: fetch stored metadata for an image.
export async function getImageMetadata(/* id */) {
  return { configured: false, image: null };
}

// FUTURE: associate an image with an article.
export async function linkImageToArticle(/* { imageId, articleId } */) {
  return { configured: false, linked: false };
}

// FUTURE: find example images relevant to a topic/pattern (e.g. show a real
// "double bottom" chart example alongside the explanation).
export async function findExampleImages(/* { topic, patternKey, limit } */) {
  return { configured: false, images: [] };
}
