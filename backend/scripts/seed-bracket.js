#!/usr/bin/env node
/**
 * Assign offline seeding results to contenders and finalize into teams + bracket.
 *
 * Usage:
 *   node scripts/seed-bracket.js <API_BASE_URL> <ADMIN_PASSWORD> [--dry-run]
 *
 * Example:
 *   node scripts/seed-bracket.js https://xyz.execute-api.us-east-1.amazonaws.com memm26 --dry-run
 */

const API_BASE = process.argv[2];
const ADMIN_PWD = process.argv[3];
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_BASE || !ADMIN_PWD) {
  console.error('Usage: node scripts/seed-bracket.js <API_BASE_URL> <ADMIN_PASSWORD> [--dry-run]');
  process.exit(1);
}

// ── Normalization (mirrors server.js normalizeForComparison) ─────────────────

function normalize(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Aliases for names that differ between the seeding doc and production contenders
const NAME_ALIASES = {
  'music of the lord of the rings films book': 'the music of the lord of the rings films',
};

// ── Region names ─────────────────────────────────────────────────────────────

const DIVISION_NAMES = [
  'Connecting to Middle-Earth Through Favorite Figures',
  'Experiencing Middle-Earth in Print and Music',
  'Inhabiting Middle-earth through Environments and Replicas',
  'Playing in Middle-earth with Toys, Games, and Other Curiosities',
];

// ── The 64 seeded entries from the offline seeding results ───────────────────

const SEEDING = [
  // Region 1 — Connecting to Middle-Earth Through Favorite Figures
  { name: 'Sideshow-Weta Original Balrog', division: 'division1', seed: 1 },
  { name: 'Sideshow-Weta Ringwraith on Steed', division: 'division1', seed: 2 },
  { name: 'The Argonath bookends', division: 'division1', seed: 3 },
  { name: 'Weta Workshop Smaug the Terrible', division: 'division1', seed: 4 },
  { name: 'Weta Workshop Master Collection The Fellowship', division: 'division1', seed: 5 },
  { name: 'Royal Doulton LOTR Figures', division: 'division1', seed: 6 },
  { name: 'Weta Workshop Bilbo in Bag End', division: 'division1', seed: 7 },
  { name: 'Weta Workshop Sauron', division: 'division1', seed: 8 },
  { name: 'Sideshow-Weta Gandalf on Shadowfax', division: 'division1', seed: 9 },
  { name: 'Samwise Gamgee and Bill the Pony from Sideshow Weta', division: 'division1', seed: 10 },
  { name: 'Weta Workshop Theoden on Snowmane', division: 'division1', seed: 11 },
  { name: 'Weta Workshop Eomer on Firefoot', division: 'division1', seed: 12 },
  { name: 'Weta Workshop Gandalf and Frodo', division: 'division1', seed: 13 },
  { name: 'Rankin Bass Gollum', division: 'division1', seed: 14 },
  { name: 'Royal Selangor pewter goblets', division: 'division1', seed: 15 },
  { name: 'Weta Workshop Balrog Bust', division: 'division1', seed: 16 },

  // Region 2 — Experiencing Middle-Earth in Print and Music
  { name: 'Extended Editions DVD box sets with statues', division: 'division2', seed: 1 },
  { name: '1995 BBC 14 CD Box set radio LOTR', division: 'division2', seed: 2 },
  { name: 'LOTR sound tracks', division: 'division2', seed: 3 },
  { name: 'Middle-earth maps', division: 'division2', seed: 4 },
  { name: 'Poems and Songs of Middle-earth LP', division: 'division2', seed: 5 },
  { name: 'Donald Swann\'s "The Road Goes Ever On: A Song Cycle"', division: 'division2', seed: 6 },
  { name: 'The Rankin Bass Hobbit LP', division: 'division2', seed: 7 },
  { name: '2018 Bodleian Tolkien, Maker of Middle-earth', division: 'division2', seed: 8 },
  { name: 'Music of the Lord of the Rings Films (book)', division: 'division2', seed: 9 },
  { name: 'Pictures by J.R.R. Tolkien', division: 'division2', seed: 10 },
  { name: 'Prancing Pony TORn shirt', division: 'division2', seed: 11 },
  { name: 'Hildebrandt calendar', division: 'division2', seed: 12 },
  { name: 'Calendar 2026 Illustrated by Alan Lee', division: 'division2', seed: 13 },
  { name: 'Tolkien Diaries', division: 'division2', seed: 14 },
  { name: 'LOTR Film books', division: 'division2', seed: 15 },
  { name: 'The Tolkien Scrapbook', division: 'division2', seed: 16 },

  // Region 3 — Inhabiting Middle-earth through Environments and Replicas
  { name: 'Jens Hansen One Ring', division: 'division3', seed: 1 },
  { name: 'Noble Collection - Evenstar pendant', division: 'division3', seed: 2 },
  { name: 'Weta Workshop Rivendell', division: 'division3', seed: 3 },
  { name: 'United Cutlery - Sting replica', division: 'division3', seed: 4 },
  { name: 'Weta Hobbit Holes', division: 'division3', seed: 5 },
  { name: 'Stansborough Mill Gandalf Hobbit Scarf', division: 'division3', seed: 6 },
  { name: 'Weta Workshop Phial of Galadriel', division: 'division3', seed: 7 },
  { name: 'Noble Collection - Ring of Aragorn', division: 'division3', seed: 8 },
  { name: 'Weta Workshop Barad-dur large version', division: 'division3', seed: 9 },
  { name: 'Badali Jewelry\'s "Arkenstone"', division: 'division3', seed: 10 },
  { name: 'Weta Workshop - Key to Erebor', division: 'division3', seed: 11 },
  { name: 'Gandalf Illuminating Staff from the Noble Collection', division: 'division3', seed: 12 },
  { name: 'The Magnoli Props "Red Book of Westmarch"', division: 'division3', seed: 13 },
  { name: 'Sideshow-Weta Moria Environment', division: 'division3', seed: 14 },
  { name: 'The Masters Replica FX Glow Sting', division: 'division3', seed: 15 },
  { name: 'Weta Workshop Edoras', division: 'division3', seed: 16 },

  // Region 4 — Playing in Middle-earth with Toys, Games, and Other Curiosities
  { name: 'LEGO Rivendell', division: 'division4', seed: 1 },
  { name: 'Burger King Goblet set', division: 'division4', seed: 2 },
  { name: 'Vintage 1960s buttons', division: 'division4', seed: 3 },
  { name: 'Tolkien Enterprises chess set', division: 'division4', seed: 4 },
  { name: 'LEGO Barad-dur', division: 'division4', seed: 5 },
  { name: 'Lord of the Rings Monopoly Trilogy Edition', division: 'division4', seed: 6 },
  { name: 'Trading cards with costume fabric', division: 'division4', seed: 7 },
  { name: 'Funko Pop Escape from the Road', division: 'division4', seed: 8 },
  { name: 'The Lord of the Rings Trivial Pursuit Trilogy Edition', division: 'division4', seed: 9 },
  { name: 'Porcelain Galadriel Doll', division: 'division4', seed: 10 },
  { name: 'Pez - Limited Edition Gift Set (Fellowship & Gollum)', division: 'division4', seed: 11 },
  { name: 'Citadel LOTR miniatures', division: 'division4', seed: 12 },
  { name: 'Toy Biz - Talking Treebeard', division: 'division4', seed: 13 },
  { name: 'Stern Lord of the Rings Pinball Machine', division: 'division4', seed: 14 },
  { name: 'Hobbiton Movie Set Green Dragon mug', division: 'division4', seed: 15 },
  { name: 'Lord of the Rings Trilogy Jigsaw Book', division: 'division4', seed: 16 },
];

// ── API helpers ──────────────────────────────────────────────────────────────

async function adminLogin() {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PWD }),
  });
  if (!res.ok) throw new Error(`Admin login failed (${res.status}): ${await res.text()}`);
  const { token } = await res.json();
  return token;
}

async function getSeedingData(token) {
  const res = await fetch(`${API_BASE}/api/admin/seeding`, {
    headers: { 'x-admin-token': token },
  });
  if (!res.ok) throw new Error(`Get seeding failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function assignManual(token, assignments) {
  const res = await fetch(`${API_BASE}/api/admin/seeding/assign-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ assignments }),
  });
  if (!res.ok) throw new Error(`Assign failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function finalize(token, divisionNames) {
  const res = await fetch(`${API_BASE}/api/admin/seeding/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ divisionNames }),
  });
  if (!res.ok) throw new Error(`Finalize failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('=== DRY RUN — no changes will be made ===\n');

  console.log('Logging in as admin...');
  const token = await adminLogin();
  console.log('Authenticated\n');

  console.log('Fetching contenders...');
  const seeding = await getSeedingData(token);
  const contenders = seeding.contenders;
  console.log(`  ${contenders.length} contenders in production\n`);

  // Build normalized lookup: norm → contender
  const lookup = new Map();
  for (const c of contenders) {
    lookup.set(normalize(c.name), c);
  }

  // Resolve each seeded entry to a contender ID
  console.log('Matching seeded names to contenders...\n');
  const assignments = [];
  const failures = [];
  const usedIds = new Set();

  for (const entry of SEEDING) {
    let norm = normalize(entry.name);
    let contender = lookup.get(norm);

    // Try alias if no direct match
    if (!contender && NAME_ALIASES[norm]) {
      contender = lookup.get(NAME_ALIASES[norm]);
    }

    if (!contender) {
      failures.push(entry.name);
      continue;
    }

    if (usedIds.has(contender.id)) {
      failures.push(`${entry.name} (DUPLICATE — already matched)`);
      continue;
    }

    usedIds.add(contender.id);
    assignments.push({
      contenderId: contender.id,
      divisionId: entry.division,
      seed: entry.seed,
    });

    const tag = contender.name === entry.name ? '' : ` → "${contender.name}"`;
    console.log(`  ✓ [${entry.division} #${entry.seed}] ${entry.name}${tag}`);
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} name(s) could not be matched:`);
    failures.forEach(f => console.error(`  - ${f}`));
    console.error('\nAborting — add missing contenders or fix aliases, then retry.');
    process.exit(1);
  }

  console.log(`\n✓ All ${assignments.length} names matched successfully.\n`);

  if (DRY_RUN) {
    console.log('Dry run complete — no changes made.');
    return;
  }

  // Step 1: Assign divisions + seeds
  console.log('Assigning divisions and seeds...');
  const assignResult = await assignManual(token, assignments);
  console.log(`  Assigned: ${assignResult.assigned}\n`);

  // Step 2: Finalize into teams + bracket
  console.log('Finalizing bracket...');
  const finalizeResult = await finalize(token, DIVISION_NAMES);
  console.log(`  Teams created: ${finalizeResult.teamsCreated}`);
  console.log(`  Matchups created: ${finalizeResult.matchupsCreated}\n`);

  console.log('Done! Bracket is populated and ready.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
