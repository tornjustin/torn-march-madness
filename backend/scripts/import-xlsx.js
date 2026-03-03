#!/usr/bin/env node
/**
 * Import contenders from the MEMM xlsx spreadsheet into the seeding system,
 * then trigger OG-image scraping for all contenders that have links.
 *
 * Usage:
 *   node scripts/import-xlsx.js <API_BASE_URL> <ADMIN_PASSWORD> [xlsx-path]
 *
 * Example:
 *   node scripts/import-xlsx.js https://xyz.execute-api.us-east-1.amazonaws.com memm26
 */

const XLSX = require('xlsx');
const path = require('path');

const API_BASE = process.argv[2];
const ADMIN_PWD = process.argv[3];
const XLSX_PATH = process.argv[4] ||
  path.join(__dirname, '..', 'Middle-earth March Madness 2026_ Collectibles.xlsx');

if (!API_BASE || !ADMIN_PWD) {
  console.error('Usage: node scripts/import-xlsx.js <API_BASE_URL> <ADMIN_PASSWORD> [xlsx-path]');
  process.exit(1);
}

// ── Parse the xlsx ──────────────────────────────────────────────────────────────

function parseSpreadsheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  // The header row maps column keys:
  //   "Middle-earth March Madness 2026 - Collectibles" → name
  //   "__EMPTY"   → type
  //   "__EMPTY_1" → age
  //   "__EMPTY_2" → link
  // Data rows start after the header row (row with value "Collectible")

  const NAME_KEY = 'Middle-earth March Madness 2026 - Collectibles';
  const TYPE_KEY = '__EMPTY';
  const AGE_KEY  = '__EMPTY_1';
  const LINK_KEY = '__EMPTY_2';

  // Find where data starts (after the header row)
  const headerIdx = rows.findIndex(r => r[NAME_KEY] === 'Collectible');
  if (headerIdx === -1) {
    console.error('Could not find header row in spreadsheet');
    process.exit(1);
  }

  const contenders = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[NAME_KEY] || '').trim();
    if (!name) continue;

    // Stop at summary rows (totals, etc.)
    const type = (r[TYPE_KEY] || '').trim();
    if (type.startsWith('Total ')) break;

    contenders.push({
      name,
      type: type || 'Misc',
      age: (r[AGE_KEY] || '').trim(),
      link: (r[LINK_KEY] || '').trim(),
    });
  }

  return contenders;
}

// ── API helpers ─────────────────────────────────────────────────────────────────

async function adminLogin() {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PWD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin login failed (${res.status}): ${text}`);
  }
  const { token } = await res.json();
  return token;
}

async function importContenders(token, contenders) {
  const res = await fetch(`${API_BASE}/api/admin/seeding/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
    },
    body: JSON.stringify({ contenders }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function getSeedingData(token) {
  const res = await fetch(`${API_BASE}/api/admin/seeding`, {
    headers: { 'x-admin-token': token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get seeding data failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function scrapeImages(token, contenderIds) {
  const res = await fetch(`${API_BASE}/api/admin/seeding/scrape-images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
    },
    body: JSON.stringify({ contenderIds }),
    // Scraping can take a while
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Scrape failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Parsing ${XLSX_PATH}...`);
  const contenders = parseSpreadsheet(XLSX_PATH);
  console.log(`Found ${contenders.length} contenders in spreadsheet\n`);

  console.log('Logging in as admin...');
  const token = await adminLogin();
  console.log('Authenticated\n');

  console.log('Importing contenders...');
  const importResult = await importContenders(token, contenders);
  console.log(`  Imported: ${importResult.imported}`);
  console.log(`  Skipped (duplicates): ${importResult.skipped}`);
  console.log(`  Total contenders: ${importResult.total}\n`);

  if (importResult.imported === 0) {
    console.log('No new contenders imported — skipping image scrape.');
    return;
  }

  // Get all contenders with links for scraping
  console.log('Fetching contender list for image scraping...');
  const seeding = await getSeedingData(token);
  const withLinks = seeding.contenders.filter(c => c.link && !c.image);
  console.log(`  ${withLinks.length} contenders have links and need images\n`);

  if (withLinks.length === 0) {
    console.log('All contenders already have images. Done!');
    return;
  }

  // Scrape in batches of 10 to avoid Lambda timeout
  const BATCH_SIZE = 10;
  let totalSuccess = 0;
  let totalFailed = 0;
  const allErrors = [];

  for (let i = 0; i < withLinks.length; i += BATCH_SIZE) {
    const batch = withLinks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(withLinks.length / BATCH_SIZE);
    console.log(`Scraping batch ${batchNum}/${totalBatches} (${batch.length} contenders)...`);

    try {
      const result = await scrapeImages(token, batch.map(c => c.id));
      totalSuccess += result.success;
      totalFailed += result.failed;
      if (result.errors?.length) allErrors.push(...result.errors);
      console.log(`  success: ${result.success}, failed: ${result.failed}`);
    } catch (err) {
      console.error(`  Batch ${batchNum} error: ${err.message}`);
      totalFailed += batch.length;
    }
  }

  console.log(`\nImage scraping complete:`);
  console.log(`  Success: ${totalSuccess}`);
  console.log(`  Failed:  ${totalFailed}`);
  if (allErrors.length) {
    console.log(`\nFailed items:`);
    allErrors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
