'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TOURNAMENT_TABLE = process.env.TOURNAMENT_TABLE;
const VOTES_TABLE = process.env.VOTES_TABLE;

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

// ─── Tournament (single DynamoDB item: PK='STATE') ───────────────────────────

async function getData() {
  const result = await ddb.send(new GetCommand({
    TableName: TOURNAMENT_TABLE,
    Key: { PK: 'STATE' },
  }));
  if (!result.Item) return { ...DEFAULT_TOURNAMENT };
  const { PK, ...data } = result.Item;
  return data;
}

async function saveData(data) {
  await ddb.send(new PutCommand({
    TableName: TOURNAMENT_TABLE,
    Item: { PK: 'STATE', ...data },
  }));
}

// ─── Votes (PK=matchupId, SK=voterId) ────────────────────────────────────────

async function getVote(matchupId, voterId) {
  const result = await ddb.send(new GetCommand({
    TableName: VOTES_TABLE,
    Key: { matchupId, voterId },
  }));
  return result.Item || undefined;
}

// Throws ConditionalCheckFailedException if vote already exists
async function saveVote(matchupId, voterId, teamId) {
  await ddb.send(new PutCommand({
    TableName: VOTES_TABLE,
    Item: { matchupId, voterId, teamId, ts: Date.now() },
    ConditionExpression: 'attribute_not_exists(matchupId)',
  }));
}

async function deleteVotesForMatchup(matchupId) {
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

    // BatchWrite in chunks of 25 (DynamoDB limit)
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
