'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const IMAGES_BUCKET = process.env.IMAGES_BUCKET;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Fetch a URL with redirect following, returns { html, finalUrl }
function fetchPage(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return fetchPage(next, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Download an image URL, returns Buffer + content type
function fetchImage(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return fetchImage(next, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || 'image/jpeg',
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Extract OG image from HTML without cheerio (regex-based for zero deps)
function extractOgImage(html, baseUrl) {
  // Try og:image
  let match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (match) return resolveUrl(match[1], baseUrl);

  // Try twitter:image
  match = html.match(/<meta[^>]*(?:name|property)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:image["']/i);
  if (match) return resolveUrl(match[1], baseUrl);

  // Try first large <img> (skip tiny icons/badges)
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const src = imgMatch[1];
    // Skip data URIs, SVGs, tiny tracking pixels
    if (src.startsWith('data:') || src.endsWith('.svg') || src.includes('pixel') || src.includes('tracking')) continue;
    // Check for size hints
    const widthMatch = imgMatch[0].match(/width=["']?(\d+)/);
    if (widthMatch && parseInt(widthMatch[1]) < 100) continue;
    return resolveUrl(src, baseUrl);
  }

  return null;
}

function resolveUrl(url, base) {
  if (!url) return null;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

// Get file extension from content type
function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('webp')) return '.webp';
  return '.jpg';
}

/**
 * Scrape OG image for a single contender.
 * Returns { contenderId, imageUrl } or throws.
 */
async function scrapeOne(contenderId, pageUrl) {
  const { html, finalUrl } = await fetchPage(pageUrl);
  const imageUrl = extractOgImage(html, finalUrl);
  if (!imageUrl) throw new Error('No image found on page');

  const { buffer, contentType } = await fetchImage(imageUrl);
  if (buffer.length < 1000) throw new Error('Image too small');

  const ext = extFromContentType(contentType);
  const key = `contenders/${contenderId}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: IMAGES_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const s3Url = `https://${IMAGES_BUCKET}.s3.amazonaws.com/${key}`;
  return { contenderId, imageUrl: s3Url };
}

/**
 * Process a batch of contenders, scraping in parallel (limited concurrency).
 * @param {Array<{id, link}>} contenders
 * @param {number} concurrency
 * @returns {{ results: Array<{id, imageUrl?, error?}>, success: number, failed: number }}
 */
async function scrapeBatch(contenders, concurrency = 3) {
  const results = [];
  let success = 0;
  let failed = 0;
  const errors = [];

  // Process in chunks
  for (let i = 0; i < contenders.length; i += concurrency) {
    const chunk = contenders.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(c => scrapeOne(c.id, c.link))
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const r = chunkResults[j];
      const c = chunk[j];
      if (r.status === 'fulfilled') {
        results.push({ id: c.id, imageUrl: r.value.imageUrl });
        success++;
      } else {
        results.push({ id: c.id, error: r.reason.message });
        errors.push({ name: c.name || c.id, error: r.reason.message });
        failed++;
      }
    }
  }

  return { results, success, failed, errors };
}

module.exports = { scrapeOne, scrapeBatch };
