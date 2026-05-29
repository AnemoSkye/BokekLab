# BokekLab v1.0 Cloud Run Deployment

## Required Services
- Firebase Authentication: enable Google and Email/Password providers.
- Firestore Native Mode.
- Firebase Storage or Google Cloud Storage bucket.
- Secret Manager for `VERTEX_API_KEY`.
- Cloud Run service account with least privilege:
  - Secret Manager Secret Accessor for `VERTEX_API_KEY`.
  - Cloud Datastore User for Firestore.
  - Storage Object Admin limited to the recipe image bucket.

## Runtime Environment
Set these on the Cloud Run service:

```bash
BOKEKLAB_APP_VERSION=1.0.0
BOKEKLAB_AUTH_REQUIRED=true
AI_FEATURES_ENABLED=true
RECIPE_DAILY_LIMIT=10
INGREDIENT_DAILY_LIMIT=30
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_APP_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_MEASUREMENT_ID=...
```

Mount `VERTEX_API_KEY` from Secret Manager instead of storing it in source or a client-visible config.

## Build And Deploy
```bash
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
docker build -t bokeklab:1.0.0 .
```

Example Cloud Run deployment:

```bash
gcloud run deploy bokeklab \
  --source . \
  --region asia-southeast2 \
  --allow-unauthenticated \
  --service-account bokeklab-runner@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars BOKEKLAB_APP_VERSION=1.0.0,BOKEKLAB_AUTH_REQUIRED=true,AI_FEATURES_ENABLED=true,RECIPE_DAILY_LIMIT=10,INGREDIENT_DAILY_LIMIT=30,GEMINI_IMAGE_MODEL=gemini-3.1-flash-image,FIREBASE_PROJECT_ID=PROJECT_ID,FIREBASE_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com,FIREBASE_STORAGE_BUCKET=PROJECT_ID.appspot.com \
  --set-secrets VERTEX_API_KEY=VERTEX_API_KEY:latest
```

## Security Checklist
- `.env` and service account JSON files are never committed.
- Firebase authorized domains include the Cloud Run domain and final custom domain.
- Firestore and Storage rules deny direct client writes; app writes go through Cloud Run.
- Cloud Run serves HTTPS only through Google-managed endpoint or a verified custom domain.
- `AI_FEATURES_ENABLED=false` works as an emergency kill switch.
- `BOKEKLAB_AUTH_REQUIRED=true` is set in production; the service fails closed if Firebase public config is incomplete.
- `VERTEX_API_KEY` is mounted from Secret Manager; the service fails closed when AI is enabled without it.
- API responses are `Cache-Control: no-store`, mutating API routes require `Content-Type: application/json`, and Helmet CSP/security headers are enabled.
- API errors are structured and do not expose stack traces in production.
- `npm.cmd audit --json` is reviewed before release.

## Current Security Score
- Baseline before auth/quota: 6/10.
- Current app-layer target after Cloud Run + Firebase Auth + quota + kill switch + server-only writes: 8.5/10.
- Dependency note: `npm.cmd audit --json` currently reports 8 moderate advisories inherited through `firebase-admin` Google Cloud dependencies (`@google-cloud/firestore`, `@google-cloud/storage`, `google-gax`, `retry-request`, `teeny-request`, `gaxios`, `uuid`). npm suggests `firebase-admin@10.3.0`, a semver-major downgrade, so do not apply it automatically without compatibility testing.
