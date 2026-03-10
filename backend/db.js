'use strict';

const fs = require('fs');
const path = require('path');

const TOURNAMENT_TABLE = process.env.TOURNAMENT_TABLE;
const VOTES_TABLE = process.env.VOTES_TABLE;
const SEEDING_TABLE = process.env.SEEDING_TABLE;

const USE_LOCAL = !TOURNAMENT_TABLE;

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

// ─── Local file-based storage (dev mode) ────────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');
const TOURNAMENT_FILE = path.join(DATA_DIR, 'tournament.json');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');
const SEEDING_FILE = path.join(DATA_DIR, 'seeding.json');

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const localDb = {
  async getData() {
    return readJsonFile(TOURNAMENT_FILE, { ...DEFAULT_TOURNAMENT });
  },
  async saveData(data) {
    writeJsonFile(TOURNAMENT_FILE, data);
  },
  async getVote(matchupId, voterId) {
    const votes = readJsonFile(VOTES_FILE, []);
    return votes.find(v => v.matchupId === matchupId && v.voterId === voterId);
  },
  async saveVote(matchupId, voterId, teamId) {
    const votes = readJsonFile(VOTES_FILE, []);
    const exists = votes.find(v => v.matchupId === matchupId && v.voterId === voterId);
    if (exists) {
      const err = new Error('Vote already exists');
      err.name = 'ConditionalCheckFailedException';
      throw err;
    }
    votes.push({ matchupId, voterId, teamId, ts: Date.now() });
    writeJsonFile(VOTES_FILE, votes);
  },
  async deleteVotesForMatchup(matchupId) {
    const votes = readJsonFile(VOTES_FILE, []);
    writeJsonFile(VOTES_FILE, votes.filter(v => v.matchupId !== matchupId));
  },
  async getSeedingData() {
    return readJsonFile(SEEDING_FILE, { ...DEFAULT_SEEDING });
  },
  async saveSeedingData(data) {
    writeJsonFile(SEEDING_FILE, data);
  },
};

// ─── DynamoDB storage (production) ──────────────────────────────────────────

let dynamoDb;

if (!USE_LOCAL) {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
    BatchWriteCommand,
  } = require('@aws-sdk/lib-dynamodb');

  const region = process.env.AWS_REGION || 'us-east-1';
  const client = new DynamoDBClient({ region });
  const ddb = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  dynamoDb = {
    async getData() {
      const result = await ddb.send(new GetCommand({
        TableName: TOURNAMENT_TABLE,
        Key: { PK: 'STATE' },
      }));
      if (!result.Item) return { ...DEFAULT_TOURNAMENT };
      const { PK, ...data } = result.Item;
      return data;
    },
    async saveData(data) {
      await ddb.send(new PutCommand({
        TableName: TOURNAMENT_TABLE,
        Item: { PK: 'STATE', ...data },
      }));
    },
    async getVote(matchupId, voterId) {
      const result = await ddb.send(new GetCommand({
        TableName: VOTES_TABLE,
        Key: { matchupId, voterId },
      }));
      return result.Item || undefined;
    },
    async saveVote(matchupId, voterId, teamId) {
      await ddb.send(new PutCommand({
        TableName: VOTES_TABLE,
        Item: { matchupId, voterId, teamId, ts: Date.now() },
        ConditionExpression: 'attribute_not_exists(matchupId)',
      }));
    },
    async deleteVotesForMatchup(matchupId) {
      let lastKey;
      do {
        const result = await ddb.send(new QueryCommand({
          TableName: VOTES_TABLE,
          KeyConditionExpression: 'matchupId = :mid',
          ExpressionAttributeValues: { ':mid': matchupId },
          ProjectionExpression: 'matchupId, voterId',
          ExclusiveStartKey: lastKey,
        }));
        const items = result.Items || [];
        if (items.length === 0) break;
        for (let i = 0; i < items.length; i += 25) {
          const batch = items.slice(i, i + 25);
          await ddb.send(new BatchWriteCommand({
            RequestItems: {
              [VOTES_TABLE]: batch.map(item => ({
                DeleteRequest: { Key: { matchupId: item.matchupId, voterId: item.voterId } },
              })),
            },
          }));
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
    },
    async getSeedingData() {
      const result = await ddb.send(new GetCommand({
        TableName: SEEDING_TABLE,
        Key: { PK: 'STATE' },
      }));
      if (!result.Item) return { ...DEFAULT_SEEDING };
      const { PK, ...data } = result.Item;
      return data;
    },
    async saveSeedingData(data) {
      await ddb.send(new PutCommand({
        TableName: SEEDING_TABLE,
        Item: { PK: 'STATE', ...data },
      }));
    },
  };
}

const db = USE_LOCAL ? localDb : dynamoDb;

if (USE_LOCAL) {
  console.log('  [db] Local file storage mode (set TOURNAMENT_TABLE to use DynamoDB)');
}

module.exports = {
  getData: (...args) => db.getData(...args),
  saveData: (...args) => db.saveData(...args),
  getVote: (...args) => db.getVote(...args),
  saveVote: (...args) => db.saveVote(...args),
  deleteVotesForMatchup: (...args) => db.deleteVotesForMatchup(...args),
  getSeedingData: (...args) => db.getSeedingData(...args),
  saveSeedingData: (...args) => db.saveSeedingData(...args),
};
