const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getData, saveData, getVote, saveVote, deleteVotesForMatchup } = require('./db');
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
      if (e.name === 'PreconditionFailed' || e.$metadata?.httpStatusCode === 412) {
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

// ─── Start (local dev only) ────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => console.log(`\n  MEMM Backend running → http://localhost:${PORT}\n`));
}

module.exports = app;
