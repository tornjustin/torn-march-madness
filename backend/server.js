const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getData, saveData, getVote, saveVote, deleteVotesForMatchup, getSeedingData, saveSeedingData } = require('./db');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'memm2025';
const JWT_SECRET  = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES = '24h';

// ─── S3 Setup ──────────────────────────────────────────────────────────────────

const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// ─── Multer Config (memory storage → S3) ──────────────────────────────────────

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  }
});

// ─── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

// ─── Rate limiters ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' }
});

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many votes from this IP, please try again later' }
});

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ─── Helpers ───────────────────────────────────────────────────────────────────

function populateMatchup(m, teams) {
  const team1  = teams.find(t => t.id === m.team1Id) || null;
  const team2  = teams.find(t => t.id === m.team2Id) || null;
  const winner = teams.find(t => t.id === m.winnerId) || null;
  return { ...m, team1, team2, winner, totalVotes: (m.votes?.team1 || 0) + (m.votes?.team2 || 0) };
}

function getRoundLabel(round, regionName) {
  const labels = { 1: 'Round of 16', 2: 'Round of 8', 3: 'Sweet 16', 4: 'Elite 8', 5: 'Final Four', 6: 'Championship' };
  const prefix = round <= 4 ? `${regionName} – ` : '';
  return `${prefix}${labels[round] || `Round ${round}`}`;
}

function getNextMatchupId(matchup) {
  const { round, regionId, position } = matchup;
  if (round < 4) return `${regionId}_r${round + 1}_p${Math.ceil(position / 2)}`;
  if (round === 4) {
    const idx = ['region1', 'region2', 'region3', 'region4'].indexOf(regionId);
    return idx < 2 ? 'ff_r5_p1' : 'ff_r5_p2';
  }
  if (round === 5) return 'ff_r6_p1';
  return null;
}

function getNextSlot(matchup) {
  const { round, regionId, position } = matchup;
  if (round < 4) return position % 2 === 1 ? 'team1' : 'team2';
  if (round === 4) {
    const idx = ['region1', 'region2', 'region3', 'region4'].indexOf(regionId);
    return idx % 2 === 0 ? 'team1' : 'team2';
  }
  return position % 2 === 1 ? 'team1' : 'team2';
}

// Read and validate voterId from request body (for POST /vote)
function getVoterIdFromBody(req) {
  const id = req.body?.voterId;
  if (!id || typeof id !== 'string') return null;
  if (id.length > 64) return null;
  if (!/^[a-zA-Z0-9_\-]+$/.test(id)) return null;
  return id;
}

// ─── Admin Auth (JWT) ──────────────────────────────────────────────────────────

const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// ─── Staff Auth (JWT — @theonering.net email) ───────────────────────────────

const staffAuth = (req, res, next) => {
  const token = req.headers['x-staff-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'staff') throw new Error('Not staff');
    req.staff = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

// ─── Seeding helpers ────────────────────────────────────────────────────────

function normalizeForComparison(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function bigrams(str) {
  const result = [];
  for (let i = 0; i < str.length - 1; i++) result.push(str.slice(i, i + 2));
  return result;
}

function diceSimilarity(a, b) {
  const biA = new Set(bigrams(a));
  const biB = new Set(bigrams(b));
  if (biA.size === 0 && biB.size === 0) return 1;
  const intersection = [...biA].filter(x => biB.has(x)).length;
  return (2 * intersection) / (biA.size + biB.size);
}

function findNearDuplicates(name, contenders, threshold = 0.65) {
  const normalized = normalizeForComparison(name);
  return contenders
    .map(c => ({ ...c, similarity: diceSimilarity(normalized, c.normalizedName || normalizeForComparison(c.name)) }))
    .filter(c => c.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function snakeDistribute(ranked, numDivisions = 4) {
  const divisions = Array.from({ length: numDivisions }, () => []);
  let direction = 1;
  let idx = 0;
  for (const item of ranked) {
    divisions[idx].push(item);
    if (direction === 1 && idx === numDivisions - 1) direction = -1;
    else if (direction === -1 && idx === 0) direction = 1;
    else idx += direction;
  }
  return divisions;
}

// Standard March Madness bracket order for Round 1 (within a 16-team division)
const ROUND1_MATCHUPS = [
  [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]
];

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/tournament', async (req, res) => {
  try {
    const data = await getData();
    const matchupsWithTeams = data.matchups.map(m => {
      const populated = populateMatchup(m, data.teams);
      const region = data.regions.find(r => r.id === m.regionId);
      return { ...populated, roundLabel: getRoundLabel(m.round, region?.name || '') };
    });
    res.json({ ...data, matchups: matchupsWithTeams });
  } catch (e) {
    console.error('GET /api/tournament error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/teams', async (req, res) => {
  try {
    res.json((await getData()).teams);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/matchups', async (req, res) => {
  try {
    const data = await getData();
    res.json(data.matchups.map(m => {
      const region = data.regions.find(r => r.id === m.regionId);
      return { ...populateMatchup(m, data.teams), roundLabel: getRoundLabel(m.round, region?.name || '') };
    }));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/matchups/:id', async (req, res) => {
  try {
    const data = await getData();
    const m = data.matchups.find(m => m.id === req.params.id);
    if (!m) return res.status(404).json({ error: 'Not found' });
    const region = data.regions.find(r => r.id === m.regionId);
    res.json({ ...populateMatchup(m, data.teams), roundLabel: getRoundLabel(m.round, region?.name || '') });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vote — voterId comes from request body (localStorage UUID on client)
app.post('/api/matchups/:id/vote', voteLimiter, async (req, res) => {
  const { teamId } = req.body;
  const voterId = getVoterIdFromBody(req);

  if (!teamId || !voterId) return res.status(400).json({ error: 'Missing teamId or voterId' });

  try {
    const data = await getData();
    const matchup = data.matchups.find(m => m.id === req.params.id);
    if (!matchup) return res.status(404).json({ error: 'Matchup not found' });
    if (matchup.status !== 'active') return res.status(400).json({ error: 'Voting is closed for this matchup' });
    if (teamId !== matchup.team1Id && teamId !== matchup.team2Id) return res.status(400).json({ error: 'Invalid team' });

    const existing = await getVote(req.params.id, voterId);
    if (existing) {
      return res.status(409).json({ error: 'Already voted', alreadyVoted: true, teamId: existing.teamId });
    }

    if (teamId === matchup.team1Id) matchup.votes.team1++;
    else matchup.votes.team2++;

    try {
      await saveVote(req.params.id, voterId, teamId);
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        return res.status(409).json({ error: 'Already voted', alreadyVoted: true });
      }
      throw e;
    }

    await saveData(data);
    res.json({ success: true, votes: matchup.votes, total: matchup.votes.team1 + matchup.votes.team2 });
  } catch (e) {
    console.error('Vote error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vote status check — voterId from query param
app.get('/api/matchups/:id/vote-status', async (req, res) => {
  const voterId = req.query.voterId;
  if (!voterId || typeof voterId !== 'string' || voterId.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(voterId)) {
    return res.json({ voted: false, teamId: null });
  }
  try {
    const vote = await getVote(req.params.id, voterId);
    res.json({ voted: !!vote, teamId: vote?.teamId || null });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard state (public – stream page polls this)
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getData();
    const { dashboardState, matchups, teams, regions } = data;
    let currentMatchup = null;
    if (dashboardState.currentMatchupId) {
      const m = matchups.find(m => m.id === dashboardState.currentMatchupId);
      if (m) {
        const region = regions.find(r => r.id === m.regionId);
        currentMatchup = { ...populateMatchup(m, teams), roundLabel: getRoundLabel(m.round, region?.name || '') };
      }
    }
    const currentIdx = dashboardState.matchupOrder.indexOf(dashboardState.currentMatchupId);
    res.json({ ...dashboardState, currentMatchup, currentIndex: currentIdx, totalMatchups: dashboardState.matchupOrder.length });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN API
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ success: true, token });
});

// Settings — allowlisted fields only
app.put('/api/admin/settings', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const { name, year, status } = req.body;
    if (name !== undefined) data.settings.name = name;
    if (year !== undefined) data.settings.year = year;
    if (status !== undefined) data.settings.status = status;
    await saveData(data);
    res.json(data.settings);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regions
app.put('/api/admin/regions/:id', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const r = data.regions.find(r => r.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (req.body.name) r.name = req.body.name;
    await saveData(data);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Teams CRUD
app.post('/api/admin/teams', adminAuth, async (req, res) => {
  try {
    const { name, regionId, seed, description } = req.body;
    if (!name || !regionId) return res.status(400).json({ error: 'name and regionId required' });
    const data = await getData();
    const team = { id: uuidv4(), name, regionId, seed: seed || null, description: description || '', image: null, createdAt: new Date().toISOString() };
    data.teams.push(team);
    await saveData(data);
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/teams/:id', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const team = data.teams.find(t => t.id === req.params.id);
    if (!team) return res.status(404).json({ error: 'Not found' });
    const { name, regionId, seed, description } = req.body;
    if (name !== undefined) team.name = name;
    if (regionId !== undefined) team.regionId = regionId;
    if (seed !== undefined) team.seed = seed;
    if (description !== undefined) team.description = description;
    await saveData(data);
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/teams/:id', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const idx = data.teams.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const [team] = data.teams.splice(idx, 1);
    if (team.image && team.image.includes('s3.amazonaws.com') && IMAGES_BUCKET) {
      const key = team.image.split('/').slice(-1)[0];
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: IMAGES_BUCKET, Key: key }));
      } catch (e) { /* non-fatal */ }
    }
    await saveData(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Image upload → S3
app.post('/api/admin/teams/:id/image', adminAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (!IMAGES_BUCKET) return res.status(500).json({ error: 'IMAGES_BUCKET not configured' });

  try {
    const data = await getData();
    const team = data.teams.find(t => t.id === req.params.id);
    if (!team) return res.status(404).json({ error: 'Not found' });

    if (team.image && team.image.includes('s3.amazonaws.com')) {
      const oldKey = team.image.split('/').slice(-1)[0];
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: IMAGES_BUCKET, Key: oldKey }));
      } catch (e) { /* non-fatal */ }
    }

    const ext = path.extname(req.file.originalname) || '.jpg';
    const key = `${uuidv4()}${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: IMAGES_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    team.image = `https://${IMAGES_BUCKET}.s3.amazonaws.com/${key}`;
    await saveData(data);
    res.json({ image: team.image });
  } catch (e) {
    console.error('Image upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Only')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Initialize bracket structure (63 matchup shells)
app.post('/api/admin/initialize-bracket', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const matchups = [];
    const regions = ['region1', 'region2', 'region3', 'region4'];

    for (const regionId of regions) {
      for (let round = 1; round <= 4; round++) {
        const count = Math.pow(2, 4 - round);
        for (let position = 1; position <= count; position++) {
          matchups.push({ id: `${regionId}_r${round}_p${position}`, round, regionId, position, team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
        }
      }
    }

    matchups.push({ id: 'ff_r5_p1', round: 5, regionId: null, position: 1, roundName: 'Final Four', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
    matchups.push({ id: 'ff_r5_p2', round: 5, regionId: null, position: 2, roundName: 'Final Four', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
    matchups.push({ id: 'ff_r6_p1', round: 6, regionId: null, position: 1, roundName: 'Championship', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });

    data.matchups = matchups;
    data.dashboardState = { currentMatchupId: null, matchupOrder: [] };
    await saveData(data);
    res.json({ success: true, matchupCount: matchups.length });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Seed a round-1 matchup
app.put('/api/admin/matchups/:id/seed', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const matchup = data.matchups.find(m => m.id === req.params.id);
    if (!matchup) return res.status(404).json({ error: 'Not found' });
    if (req.body.team1Id !== undefined) matchup.team1Id = req.body.team1Id || null;
    if (req.body.team2Id !== undefined) matchup.team2Id = req.body.team2Id || null;
    matchup.votes = { team1: 0, team2: 0 };
    matchup.winnerId = null;
    matchup.status = 'pending';
    await saveData(data);
    res.json(populateMatchup(matchup, data.teams));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update matchup status
app.put('/api/admin/matchups/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'active', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const data = await getData();
    const matchup = data.matchups.find(m => m.id === req.params.id);
    if (!matchup) return res.status(404).json({ error: 'Not found' });
    matchup.status = status;
    await saveData(data);
    res.json(populateMatchup(matchup, data.teams));
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set winner and advance
app.post('/api/admin/matchups/:id/winner', adminAuth, async (req, res) => {
  try {
    const { winnerId } = req.body;
    const data = await getData();
    const matchup = data.matchups.find(m => m.id === req.params.id);
    if (!matchup) return res.status(404).json({ error: 'Not found' });
    if (winnerId !== matchup.team1Id && winnerId !== matchup.team2Id) return res.status(400).json({ error: 'Invalid winner' });

    matchup.winnerId = winnerId;
    matchup.status = 'closed';

    const nextId = getNextMatchupId(matchup);
    if (nextId) {
      const nextMatchup = data.matchups.find(m => m.id === nextId);
      if (nextMatchup) {
        const slot = getNextSlot(matchup);
        nextMatchup[slot === 'team1' ? 'team1Id' : 'team2Id'] = winnerId;
      }
    }

    await saveData(data);
    res.json({ success: true, matchup: populateMatchup(matchup, data.teams), nextMatchupId: nextId, isTournamentWinner: !nextId });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset votes
app.post('/api/admin/matchups/:id/reset-votes', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const matchup = data.matchups.find(m => m.id === req.params.id);
    if (!matchup) return res.status(404).json({ error: 'Not found' });
    matchup.votes = { team1: 0, team2: 0 };
    matchup.winnerId = null;
    await deleteVotesForMatchup(req.params.id);
    await saveData(data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard management
app.put('/api/admin/dashboard', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const { currentMatchupId, matchupOrder } = req.body;
    if (currentMatchupId !== undefined) data.dashboardState.currentMatchupId = currentMatchupId;
    if (matchupOrder !== undefined) data.dashboardState.matchupOrder = matchupOrder;
    await saveData(data);
    res.json(data.dashboardState);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/dashboard/next', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const { matchupOrder, currentMatchupId } = data.dashboardState;
    if (!matchupOrder.length) return res.status(400).json({ error: 'No order set' });
    const idx = matchupOrder.indexOf(currentMatchupId);
    data.dashboardState.currentMatchupId = matchupOrder[idx < matchupOrder.length - 1 ? idx + 1 : 0];
    await saveData(data);
    res.json({ currentMatchupId: data.dashboardState.currentMatchupId });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/dashboard/prev', adminAuth, async (req, res) => {
  try {
    const data = await getData();
    const { matchupOrder, currentMatchupId } = data.dashboardState;
    if (!matchupOrder.length) return res.status(400).json({ error: 'No order set' });
    const idx = matchupOrder.indexOf(currentMatchupId);
    data.dashboardState.currentMatchupId = matchupOrder[idx > 0 ? idx - 1 : matchupOrder.length - 1];
    await saveData(data);
    res.json({ currentMatchupId: data.dashboardState.currentMatchupId });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF API (seeding)
// ═══════════════════════════════════════════════════════════════════════════════

const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
});

app.post('/api/staff/login', staffLoginLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.endsWith('@theonering.net')) {
      return res.status(400).json({ error: 'Must use a @theonering.net email address' });
    }

    const seeding = await getSeedingData();
    let staff = seeding.staff.find(s => s.email === email);
    if (!staff) {
      staff = {
        id: uuidv4(),
        email,
        displayName: email.split('@')[0],
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      seeding.staff.push(staff);
    } else {
      staff.lastActiveAt = new Date().toISOString();
    }
    await saveSeedingData(seeding);

    const token = jwt.sign({ role: 'staff', email, staffId: staff.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ success: true, token, staffId: staff.id, email, displayName: staff.displayName });
  } catch (e) {
    console.error('Staff login error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/staff/me', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const staff = seeding.staff.find(s => s.id === req.staff.staffId);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    res.json({ staffId: staff.id, email: staff.email, displayName: staff.displayName });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Staff: Contender intake ───────────────────────────────────────────────

app.get('/api/staff/contenders', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const contenders = seeding.contenders.map(({ id, name, type, age, description, link, image, submittedBy, source }) =>
      ({ id, name, type, age, description, link, image, submittedBy, source }));
    res.json({ contenders, phase: seeding.config.phase, intake: seeding.config.intake });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/staff/contenders/check-duplicate', staffAuth, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const seeding = await getSeedingData();
    const matches = findNearDuplicates(name, seeding.contenders);
    res.json({ matches: matches.map(m => ({ id: m.id, name: m.name, similarity: m.similarity })) });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/staff/contenders', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const now = new Date();

    // Check intake window
    if (seeding.config.intake.status !== 'open') {
      const { opensAt, closesAt } = seeding.config.intake;
      if (opensAt && closesAt) {
        if (now < new Date(opensAt) || now > new Date(closesAt)) {
          return res.status(400).json({ error: 'Intake window is not open' });
        }
      } else {
        return res.status(400).json({ error: 'Intake window is not open' });
      }
    }

    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });

    const normalizedName = normalizeForComparison(name);
    const force = req.body.force === true;

    // Near-duplicate check
    if (!force) {
      const matches = findNearDuplicates(name, seeding.contenders);
      if (matches.length > 0) {
        return res.status(409).json({
          warning: true,
          message: 'Similar contender(s) already exist',
          matches: matches.map(m => ({ id: m.id, name: m.name, similarity: m.similarity })),
        });
      }
    }

    const contender = {
      id: uuidv4(),
      name,
      normalizedName,
      type: (req.body.type || '').trim() || 'Misc',
      age: (req.body.age || '').trim() || '',
      description: (req.body.description || '').trim(),
      link: (req.body.link || '').trim(),
      image: null,
      submittedBy: req.staff.email,
      source: 'staff',
      totalPoints: 0,
      rank: null,
      selected: false,
      divisionId: null,
      seed: null,
    };
    seeding.contenders.push(contender);
    await saveSeedingData(seeding);
    res.json({ contender });
  } catch (e) {
    console.error('Staff contender submit error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Staff: Seeding ballot ──────────────────────────────────────────────────

app.get('/api/staff/ballot', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const ballot = seeding.ballots.find(b => b.staffId === req.staff.staffId) || null;
    const contenders = seeding.contenders.map(({ id, name, type, age, description, image }) =>
      ({ id, name, type, age, description, image }));
    res.json({
      ballot,
      contenders,
      phase: seeding.config.phase,
      ballotWindow: seeding.config.ballot,
      ballotRules: seeding.config.ballotRules,
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/staff/ballot', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const now = new Date();

    // Check ballot window
    if (seeding.config.ballot.status !== 'open') {
      const { opensAt, closesAt } = seeding.config.ballot;
      if (opensAt && closesAt) {
        if (now < new Date(opensAt) || now > new Date(closesAt)) {
          return res.status(400).json({ error: 'Ballot window is not open' });
        }
      } else {
        return res.status(400).json({ error: 'Ballot window is not open' });
      }
    }

    const { picks, status } = req.body;
    if (!picks || typeof picks !== 'object') return res.status(400).json({ error: 'Picks required' });

    const validStatuses = ['draft', 'submitted'];
    const ballotStatus = validStatuses.includes(status) ? status : 'draft';
    const { tiers, picksPerTier } = seeding.config.ballotRules;

    // Validate on submit
    if (ballotStatus === 'submitted') {
      const contenderIds = new Set(seeding.contenders.map(c => c.id));
      const entries = Object.entries(picks);
      const totalPicks = entries.length;
      const expectedTotal = tiers.length * picksPerTier;

      if (totalPicks !== expectedTotal) {
        return res.status(400).json({ error: `Must have exactly ${expectedTotal} picks (got ${totalPicks})` });
      }

      for (const tier of tiers) {
        const count = entries.filter(([, t]) => t === tier).length;
        if (count !== picksPerTier) {
          return res.status(400).json({ error: `Must have exactly ${picksPerTier} picks at ${tier}-point tier (got ${count})` });
        }
      }

      for (const [cId] of entries) {
        if (!contenderIds.has(cId)) {
          return res.status(400).json({ error: `Invalid contender ID: ${cId}` });
        }
      }
    }

    // Upsert ballot
    let ballot = seeding.ballots.find(b => b.staffId === req.staff.staffId);
    if (ballot) {
      ballot.picks = picks;
      ballot.status = ballotStatus;
      ballot.updatedAt = now.toISOString();
      if (ballotStatus === 'submitted') ballot.submittedAt = now.toISOString();
    } else {
      ballot = {
        id: uuidv4(),
        staffId: req.staff.staffId,
        staffEmail: req.staff.email,
        status: ballotStatus,
        picks,
        submittedAt: ballotStatus === 'submitted' ? now.toISOString() : null,
        updatedAt: now.toISOString(),
      };
      seeding.ballots.push(ballot);
    }

    await saveSeedingData(seeding);
    res.json({ ballot });
  } catch (e) {
    console.error('Ballot save error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/staff/ballot/stats', staffAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const totalStaff = seeding.staff.length;
    const submittedBallots = seeding.ballots.filter(b => b.status === 'submitted').length;
    const draftBallots = seeding.ballots.filter(b => b.status === 'draft').length;
    res.json({ totalStaff, submittedBallots, draftBallots, ballotWindow: seeding.config.ballot });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Public seeding status ──────────────────────────────────────────────────

app.get('/api/seeding/status', async (req, res) => {
  try {
    const seeding = await getSeedingData();
    res.json({
      phase: seeding.config.phase,
      intake: { status: seeding.config.intake.status },
      ballot: { status: seeding.config.ballot.status },
      contenderCount: seeding.contenders.length,
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN SEEDING API
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/seeding', adminAuth, async (req, res) => {
  try {
    res.json(await getSeedingData());
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/seeding/config', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const { intake, ballot, ballotRules } = req.body;
    if (intake) {
      if (intake.opensAt !== undefined) seeding.config.intake.opensAt = intake.opensAt;
      if (intake.closesAt !== undefined) seeding.config.intake.closesAt = intake.closesAt;
      if (intake.status !== undefined) seeding.config.intake.status = intake.status;
    }
    if (ballot) {
      if (ballot.opensAt !== undefined) seeding.config.ballot.opensAt = ballot.opensAt;
      if (ballot.closesAt !== undefined) seeding.config.ballot.closesAt = ballot.closesAt;
      if (ballot.status !== undefined) seeding.config.ballot.status = ballot.status;
    }
    if (ballotRules) {
      if (ballotRules.tiers) seeding.config.ballotRules.tiers = ballotRules.tiers;
      if (ballotRules.picksPerTier) seeding.config.ballotRules.picksPerTier = ballotRules.picksPerTier;
    }
    await saveSeedingData(seeding);
    res.json(seeding.config);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/seeding/phase', adminAuth, async (req, res) => {
  try {
    const { phase } = req.body;
    const validPhases = ['intake', 'ballot', 'assignment', 'complete'];
    if (!validPhases.includes(phase)) return res.status(400).json({ error: 'Invalid phase' });
    const seeding = await getSeedingData();

    if (phase === 'ballot') seeding.config.intake.status = 'closed';
    if (phase === 'assignment') seeding.config.ballot.status = 'closed';

    seeding.config.phase = phase;
    await saveSeedingData(seeding);
    res.json(seeding.config);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk import contenders
app.post('/api/admin/seeding/import', adminAuth, async (req, res) => {
  try {
    const { contenders: items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'contenders array required' });

    const seeding = await getSeedingData();
    let imported = 0;
    let skipped = 0;

    for (const item of items) {
      const name = (item.name || '').trim();
      if (!name) { skipped++; continue; }
      const normalizedName = normalizeForComparison(name);

      if (seeding.contenders.some(c => c.normalizedName === normalizedName)) {
        skipped++;
        continue;
      }

      seeding.contenders.push({
        id: uuidv4(),
        name,
        normalizedName,
        type: (item.type || '').trim() || 'Misc',
        age: (item.age || '').trim() || '',
        description: (item.description || '').trim(),
        link: (item.link || '').trim(),
        image: null,
        submittedBy: 'import',
        source: 'import',
        totalPoints: 0,
        rank: null,
        selected: false,
        divisionId: null,
        seed: null,
      });
      imported++;
    }

    await saveSeedingData(seeding);
    res.json({ imported, skipped, total: seeding.contenders.length });
  } catch (e) {
    console.error('Import error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Single contender CRUD
app.post('/api/admin/seeding/contenders', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const contender = {
      id: uuidv4(),
      name,
      normalizedName: normalizeForComparison(name),
      type: (req.body.type || '').trim() || 'Misc',
      age: (req.body.age || '').trim() || '',
      description: (req.body.description || '').trim(),
      link: (req.body.link || '').trim(),
      image: null,
      submittedBy: 'admin',
      source: 'import',
      totalPoints: 0,
      rank: null,
      selected: false,
      divisionId: null,
      seed: null,
    };
    seeding.contenders.push(contender);
    await saveSeedingData(seeding);
    res.json(contender);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/admin/seeding/contenders/:id', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const c = seeding.contenders.find(c => c.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const { name, type, age, description, link } = req.body;
    if (name !== undefined) { c.name = name.trim(); c.normalizedName = normalizeForComparison(name); }
    if (type !== undefined) c.type = type.trim();
    if (age !== undefined) c.age = age.trim();
    if (description !== undefined) c.description = description.trim();
    if (link !== undefined) c.link = link.trim();
    await saveSeedingData(seeding);
    res.json(c);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset all seeding data (contenders, ballots, rankings)
app.delete('/api/admin/seeding/reset', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    seeding.contenders = [];
    seeding.ballots = [];
    seeding.rankings = [];
    await saveSeedingData(seeding);
    res.json({ success: true, message: 'All contenders, ballots, and rankings cleared' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear a staff member's ballot
app.delete('/api/admin/seeding/ballots/:email', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const idx = seeding.ballots.findIndex(b => b.email === req.params.email);
    if (idx === -1) return res.status(404).json({ error: 'No ballot found for that email' });
    seeding.ballots.splice(idx, 1);
    await saveSeedingData(seeding);
    res.json({ success: true, message: `Ballot for ${req.params.email} cleared` });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/admin/seeding/contenders/:id', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const idx = seeding.contenders.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const [removed] = seeding.contenders.splice(idx, 1);
    if (removed.image && removed.image.includes('s3.amazonaws.com') && IMAGES_BUCKET) {
      const key = removed.image.split('/').slice(-1)[0];
      try { await s3.send(new DeleteObjectCommand({ Bucket: IMAGES_BUCKET, Key: key })); } catch { /* non-fatal */ }
    }
    for (const ballot of seeding.ballots) {
      delete ballot.picks[req.params.id];
    }
    await saveSeedingData(seeding);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Contender image upload
app.post('/api/admin/seeding/contenders/:id/image', adminAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (!IMAGES_BUCKET) return res.status(500).json({ error: 'IMAGES_BUCKET not configured' });
  try {
    const seeding = await getSeedingData();
    const c = seeding.contenders.find(c => c.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });

    if (c.image && c.image.includes('s3.amazonaws.com')) {
      const oldKey = c.image.split('/').slice(-1)[0];
      try { await s3.send(new DeleteObjectCommand({ Bucket: IMAGES_BUCKET, Key: oldKey })); } catch { /* non-fatal */ }
    }

    const ext = path.extname(req.file.originalname) || '.jpg';
    const key = `seeding/${uuidv4()}${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: IMAGES_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    c.image = `https://${IMAGES_BUCKET}.s3.amazonaws.com/${key}`;
    await saveSeedingData(seeding);
    res.json({ image: c.image });
  } catch (e) {
    console.error('Contender image upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Batch scrape OG images for contenders
app.post('/api/admin/seeding/scrape-images', adminAuth, async (req, res) => {
  try {
    const { contenderIds } = req.body;
    if (!Array.isArray(contenderIds) || contenderIds.length === 0) {
      return res.status(400).json({ error: 'contenderIds array required' });
    }
    const seeding = await getSeedingData();
    const toScrape = seeding.contenders
      .filter(c => contenderIds.includes(c.id) && c.link)
      .map(c => ({ id: c.id, name: c.name, link: c.link }));

    if (toScrape.length === 0) {
      return res.json({ success: 0, failed: 0, errors: [], results: [] });
    }

    const { scrapeBatch } = require('./scraper');
    const outcome = await scrapeBatch(toScrape, 3);

    // Update contender images in seeding data
    for (const r of outcome.results) {
      if (r.imageUrl) {
        const c = seeding.contenders.find(c => c.id === r.id);
        if (c) c.image = r.imageUrl;
      }
    }
    await saveSeedingData(seeding);

    res.json({ success: outcome.success, failed: outcome.failed, errors: outcome.errors });
  } catch (e) {
    console.error('Scrape error:', e);
    res.status(500).json({ error: 'Scrape failed: ' + e.message });
  }
});

// Toggle contender selection
app.put('/api/admin/seeding/contenders/:id/selected', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const c = seeding.contenders.find(c => c.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.selected = req.body.selected === true;
    await saveSeedingData(seeding);
    res.json(c);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk select top N contenders
app.post('/api/admin/seeding/select-top', adminAuth, async (req, res) => {
  try {
    const { count } = req.body;
    const n = count || 64;
    const seeding = await getSeedingData();

    // Clear all selections
    for (const c of seeding.contenders) c.selected = false;

    // Select top N by rank
    const ranked = seeding.contenders
      .filter(c => c.rank != null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, n);

    for (const c of ranked) c.selected = true;

    await saveSeedingData(seeding);
    res.json({ selected: ranked.length });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Compute rankings from submitted ballots
app.post('/api/admin/seeding/compute-rankings', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const submitted = seeding.ballots.filter(b => b.status === 'submitted');
    const pointsMap = {};
    const ballotCountMap = {};

    for (const ballot of submitted) {
      for (const [contenderId, tier] of Object.entries(ballot.picks)) {
        pointsMap[contenderId] = (pointsMap[contenderId] || 0) + tier;
        ballotCountMap[contenderId] = (ballotCountMap[contenderId] || 0) + 1;
      }
    }

    const rankings = Object.keys(pointsMap)
      .map(id => ({ contenderId: id, totalPoints: pointsMap[id], ballotCount: ballotCountMap[id] }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    rankings.forEach((r, i) => { r.rank = i + 1; });

    for (const c of seeding.contenders) {
      const r = rankings.find(r => r.contenderId === c.id);
      c.totalPoints = r ? r.totalPoints : 0;
      c.rank = r ? r.rank : null;
    }

    seeding.rankings = rankings;
    await saveSeedingData(seeding);
    res.json({ rankings, ballotsProcessed: submitted.length });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign divisions via snake distribution
app.post('/api/admin/seeding/assign-divisions', adminAuth, async (req, res) => {
  try {
    const { divisionNames, bracketSize } = req.body;
    const size = bracketSize || 64;
    const names = divisionNames || ['Division 1', 'Division 2', 'Division 3', 'Division 4'];

    const seeding = await getSeedingData();

    const selected = seeding.contenders
      .filter(c => c.selected && c.rank != null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, size);

    if (selected.length < size) {
      return res.status(400).json({ error: `Only ${selected.length} contenders selected, need ${size}` });
    }

    const divisions = snakeDistribute(selected, 4);

    for (const c of seeding.contenders) {
      c.divisionId = null;
      c.seed = null;
    }

    const divisionResult = divisions.map((div, i) => {
      const divisionId = `division${i + 1}`;
      div.forEach((item, seedIdx) => {
        const c = seeding.contenders.find(c => c.id === item.id);
        if (c) {
          c.divisionId = divisionId;
          c.seed = seedIdx + 1;
        }
      });
      return {
        id: divisionId,
        name: names[i],
        contenders: div.map((item, seedIdx) => ({
          id: item.id, name: item.name, seed: seedIdx + 1, rank: item.rank,
        })),
      };
    });

    await saveSeedingData(seeding);
    res.json({ divisions: divisionResult });
  } catch (e) {
    console.error('Division assignment error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Finalize: convert seeding results into tournament teams + bracket
app.post('/api/admin/seeding/finalize', adminAuth, async (req, res) => {
  try {
    const seeding = await getSeedingData();
    const data = await getData();

    const divisionToRegion = {
      division1: 'region1', division2: 'region2',
      division3: 'region3', division4: 'region4',
    };

    const assigned = seeding.contenders.filter(c => c.divisionId && c.seed);
    if (assigned.length === 0) return res.status(400).json({ error: 'No contenders assigned to divisions' });

    const teams = assigned.map(c => ({
      id: uuidv4(),
      name: c.name,
      regionId: divisionToRegion[c.divisionId],
      seed: c.seed,
      description: c.description || '',
      image: c.image,
      createdAt: new Date().toISOString(),
      contenderId: c.id,
    }));

    data.teams = teams;

    // Set region names
    const divisionNames = req.body.divisionNames;
    if (divisionNames && Array.isArray(divisionNames)) {
      divisionNames.forEach((name, i) => {
        if (data.regions[i] && name) data.regions[i].name = name;
      });
    }

    // Initialize bracket
    const matchups = [];
    const regions = ['region1', 'region2', 'region3', 'region4'];
    for (const regionId of regions) {
      for (let round = 1; round <= 4; round++) {
        const count = Math.pow(2, 4 - round);
        for (let position = 1; position <= count; position++) {
          matchups.push({ id: `${regionId}_r${round}_p${position}`, round, regionId, position, team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
        }
      }
    }
    matchups.push({ id: 'ff_r5_p1', round: 5, regionId: null, position: 1, roundName: 'Final Four', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
    matchups.push({ id: 'ff_r5_p2', round: 5, regionId: null, position: 2, roundName: 'Final Four', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
    matchups.push({ id: 'ff_r6_p1', round: 6, regionId: null, position: 1, roundName: 'Championship', team1Id: null, team2Id: null, votes: { team1: 0, team2: 0 }, winnerId: null, status: 'pending' });
    data.matchups = matchups;
    data.dashboardState = { currentMatchupId: null, matchupOrder: [] };

    // Seed Round 1 matchups
    for (const regionId of regions) {
      const regionTeams = teams.filter(t => t.regionId === regionId);
      ROUND1_MATCHUPS.forEach(([seed1, seed2], idx) => {
        const matchup = matchups.find(m => m.id === `${regionId}_r1_p${idx + 1}`);
        const team1 = regionTeams.find(t => t.seed === seed1);
        const team2 = regionTeams.find(t => t.seed === seed2);
        if (matchup) {
          matchup.team1Id = team1?.id || null;
          matchup.team2Id = team2?.id || null;
        }
      });
    }

    seeding.config.phase = 'complete';
    data.settings.status = 'setup';

    await saveData(data);
    await saveSeedingData(seeding);

    res.json({ success: true, teamsCreated: teams.length, matchupsCreated: matchups.length });
  } catch (e) {
    console.error('Finalize error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start (local dev only) ────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  MEMM Backend running → http://localhost:${PORT}\n`));
}

module.exports = app;
