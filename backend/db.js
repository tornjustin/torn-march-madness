'use strict';

const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const DATA_BUCKET = process.env.DATA_BUCKET;

const DEFAULT_TOURNAMENT = {
  settings: {
    name: 'Middle-earth March Madness',
    year: new Date().getFullYear(),
    status: 'setup',
  },
  regions: [
    { id: 'region1', name: 'Region 1' },
    { id: 'region2', name: 'Region 2' },
    { id: 'region3', name: 'Region 3' },
    { id: 'region4', name: 'Region 4' },
  ],
  teams: [],
  matchups: [],
  dashboardState: { currentMatchupId: null, matchupOrder: [] },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// ─── Tournament (single S3 object: tournament.json) ───────────────────────────

async function getData() {
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: DATA_BUCKET,
      Key: 'tournament.json',
    }));
    const body = await streamToString(result.Body);
    return JSON.parse(body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return { ...DEFAULT_TOURNAMENT };
    }
    throw e;
  }
}

async function saveData(data) {
  await s3.send(new PutObjectCommand({
    Bucket: DATA_BUCKET,
    Key: 'tournament.json',
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

// ─── Votes (one S3 object per vote: votes/<matchupId>::<voterId>) ──────────────

async function getVote(matchupId, voterId) {
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: DATA_BUCKET,
      Key: `votes/${matchupId}::${voterId}`,
    }));
    const body = await streamToString(result.Body);
    return JSON.parse(body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return undefined;
    }
    throw e;
  }
}

// Throws if vote already exists (IfNoneMatch: '*' → 412 PreconditionFailed)
async function saveVote(matchupId, voterId, teamId) {
  await s3.send(new PutObjectCommand({
    Bucket: DATA_BUCKET,
    Key: `votes/${matchupId}::${voterId}`,
    Body: JSON.stringify({ teamId, ts: Date.now() }),
    ContentType: 'application/json',
    IfNoneMatch: '*',
  }));
}

async function deleteVotesForMatchup(matchupId) {
  let continuationToken;
  const keys = [];

  do {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: DATA_BUCKET,
      Prefix: `votes/${matchupId}::`,
      ContinuationToken: continuationToken,
    }));
    for (const obj of result.Contents || []) keys.push(obj.Key);
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  for (const key of keys) {
    await s3.send(new DeleteObjectCommand({ Bucket: DATA_BUCKET, Key: key }));
  }
}

// ─── Seeding (single S3 object: seeding.json) ─────────────────────────────

const DEFAULT_SEEDING = {
  config: {
    intake: { opensAt: null, closesAt: null, status: 'pending' },
    ballot: { opensAt: null, closesAt: null, status: 'pending' },
    phase: 'intake',
    ballotRules: { tiers: [4, 3, 2, 1], picksPerTier: 16 },
  },
  contenders: [],
  staff: [],
  ballots: [],
  rankings: [],
};

async function getSeedingData() {
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: DATA_BUCKET,
      Key: 'seeding.json',
    }));
    const body = await streamToString(result.Body);
    return JSON.parse(body);
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      return JSON.parse(JSON.stringify(DEFAULT_SEEDING));
    }
    throw e;
  }
}

async function saveSeedingData(data) {
  await s3.send(new PutObjectCommand({
    Bucket: DATA_BUCKET,
    Key: 'seeding.json',
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

module.exports = { getData, saveData, getVote, saveVote, deleteVotesForMatchup, getSeedingData, saveSeedingData };
