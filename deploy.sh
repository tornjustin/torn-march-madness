#!/usr/bin/env bash
# deploy.sh — manual redeploy script (runs the same steps as GitHub Actions)
# Usage: ./deploy.sh

set -e

FUNCTION_NAME="torn-march-madness-api"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FRONTEND_BUCKET="memm-frontend-${ACCOUNT_ID}"
API_URL="https://njrovvcx3k.execute-api.us-east-1.amazonaws.com"

echo "==> Deploying MEMM to AWS account ${ACCOUNT_ID}"

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo "==> Packaging backend..."
cd "$(dirname "$0")/backend"
npm ci --silent
zip -r /tmp/memm-lambda.zip . \
  --exclude "data/*" \
  --exclude "uploads/*" \
  --exclude "*.test.js" \
  --exclude ".env" \
  > /dev/null

echo "==> Deploying Lambda function..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file fileb:///tmp/memm-lambda.zip \
  --region us-east-1 > /dev/null

aws lambda wait function-updated \
  --function-name "$FUNCTION_NAME" \
  --region us-east-1
echo "    Lambda updated."

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo "==> Building frontend..."
cd ../frontend
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
