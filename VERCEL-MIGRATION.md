# Vercel Migration — memm Frontend

**Date:** 2026-03-23
**Reason:** AWS CloudFront account verification blocked; Vercel replaces S3+CloudFront for frontend hosting.

---

## What Changed

| Component | Before (S3) | After (Vercel) |
|-----------|-------------|----------------|
| Frontend hosting | S3 static website (`memm-frontend-669890407664.s3-website-us-east-1.amazonaws.com`) | Vercel (`memm.oner.ing` / `memm-xxx.vercel.app`) |
| CORS_ORIGINS | `http://memm-frontend-669890407664.s3-website-us-east-1.amazonaws.com` | `https://memm.oner.ing` |
| SPA routing | S3 ErrorDocument (returns 404 status) | `vercel.json` rewrites (returns 200 status) |
| HTTPS | Not available (S3 website endpoint is HTTP only) | Automatic via Vercel |
| CDN / edge caching | None | Vercel Edge Network |
| Deploy method | GitHub Actions → S3 sync | Vercel GitHub integration (auto-deploy on push) |
| DNS (Hostinger) | CNAME `memm` → CloudFront domain | CNAME `memm` → `cname.vercel-dns.com` |

## What Did NOT Change

- Backend: Lambda + API Gateway (unchanged)
- Database: DynamoDB tables (unchanged)
- Image uploads: S3 `memm-uploads-669890407664` bucket (unchanged)
- API URL: `https://njrovvcx3k.execute-api.us-east-1.amazonaws.com` (unchanged)
- All API endpoints and auth (unchanged)

---

## Files Modified

1. `serverless.yml` line 22 — CORS_ORIGINS updated to Vercel domain
2. `.github/workflows/deploy.yml` — S3 sync steps removed (Vercel handles frontend deploys)
3. `frontend/vercel.json` — Added SPA rewrite rule

---

## Rollback to S3

If Vercel needs to be abandoned and we revert to S3 frontend hosting:

### Step 1: Revert CORS_ORIGINS in serverless.yml

Change line 22 back to:
```yaml
CORS_ORIGINS: http://${self:custom.frontendBucket}.s3-website-us-east-1.amazonaws.com
```

### Step 2: Redeploy backend
```bash
JWT_SECRET=<secret> ADMIN_PASSWORD=<password> serverless deploy --stage prod
```

### Step 3: Restore GitHub Actions S3 sync

Re-add these steps to `.github/workflows/deploy.yml` after the "Build frontend" step:

```yaml
      - name: Sync HTML/CSS/JS with no-cache headers
        run: |
          aws s3 sync frontend/dist/ "s3://${{ steps.stack.outputs.bucket_name }}/" \
            --delete \
            --cache-control "no-cache, no-store, must-revalidate" \
            --exclude "assets/*"

      - name: Sync hashed assets with long-lived cache
        run: |
          aws s3 sync frontend/dist/assets/ "s3://${{ steps.stack.outputs.bucket_name }}/assets/" \
            --cache-control "public, max-age=31536000, immutable"

      - name: Print deployment URLs
        run: |
          echo "Frontend: ${{ steps.stack.outputs.frontend_url }}"
          echo "API:      ${{ steps.stack.outputs.api_url }}/api/tournament"
```

### Step 4: Update Hostinger DNS

Remove the CNAME pointing `memm` → `cname.vercel-dns.com` and either:
- Point to CloudFront (if it exists by then), or
- Remove it entirely to fall back to the raw S3 URL

### Step 5: Rebuild and push frontend
```bash
cd frontend && npm run build
# GitHub Actions will sync to S3 on push to main
```

### Step 6: Disconnect Vercel
- Go to Vercel dashboard → memm project → Settings → Delete Project

---

## Original S3 Values (for reference)

```
S3 Website URL:  http://memm-frontend-669890407664.s3-website-us-east-1.amazonaws.com
S3 Bucket:       memm-frontend-669890407664
CORS_ORIGINS:    http://memm-frontend-669890407664.s3-website-us-east-1.amazonaws.com
ACM Cert ID:     e1f16173-eb53-4044-8c24-207d6e9606c4
API Gateway:     https://njrovvcx3k.execute-api.us-east-1.amazonaws.com
```
