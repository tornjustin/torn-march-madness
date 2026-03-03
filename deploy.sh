#!/usr/bin/env bash
# deploy.sh — manual deploy script
# Requires: node, npm, serverless (v3), aws-cli
# Usage: JWT_SECRET=xxx ADMIN_PASSWORD=yyy ./deploy.sh

set -e

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FRONTEND_BUCKET="memm-frontend-${ACCOUNT_ID}"
STACK_NAME="torn-march-madness-prod"

# Verify required env vars
if [ -z "$JWT_SECRET" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Error: JWT_SECRET and ADMIN_PASSWORD must be set"
  echo "Usage: JWT_SECRET=xxx ADMIN_PASSWORD=yyy ./deploy.sh"
  exit 1
fi

echo "==> Deploying MEMM to AWS account ${ACCOUNT_ID}"

# ── Backend (Serverless Framework) ─────────────────────────────────────────
echo ""
echo "==> Installing backend dependencies..."
cd "$(dirname "$0")/backend"
npm ci --silent

echo "==> Deploying backend via Serverless Framework..."
cd ..
npx serverless@3 deploy --stage prod

# Get the API URL from CloudFormation outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text)

echo "    API deployed: ${API_URL}"

# ── Frontend ──────────────────────────────────────────────────────────────
echo ""
echo "==> Building frontend..."
cd frontend
npm ci --silent
VITE_API_URL="$API_URL" npm run build > /dev/null

echo "==> Deploying frontend to S3..."
aws s3 sync dist/ "s3://${FRONTEND_BUCKET}/" \
  --delete \
  --cache-control "no-cache, no-store, must-revalidate" \
  --exclude "assets/*" > /dev/null

aws s3 sync dist/assets/ "s3://${FRONTEND_BUCKET}/assets/" \
  --cache-control "public, max-age=31536000, immutable" > /dev/null

echo ""
echo "==> Deployment complete!"
echo ""
echo "    Frontend: http://${FRONTEND_BUCKET}.s3-website-us-east-1.amazonaws.com"
echo "    API:      ${API_URL}/api/tournament"
