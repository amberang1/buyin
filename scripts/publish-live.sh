#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bigstack_revision="r$(date +%s)"
gcloud run deploy buy-in \
  --source . \
  --project buy-in-d6405 \
  --region asia-southeast1 \
  --revision-suffix "$bigstack_revision" \
  --no-traffic
npx --yes firebase-tools deploy --only firestore:rules --project buy-in-d6405
gcloud run services update-traffic buy-in \
  --project buy-in-d6405 \
  --region asia-southeast1 \
  --to-revisions "buy-in-$bigstack_revision=100"
printf '%s\n' 'Updated app deployed to the existing address. Requesting the shorter address next.'
bash scripts/map-bigstack-url.sh
