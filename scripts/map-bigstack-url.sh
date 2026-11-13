#!/usr/bin/env bash
set -euo pipefail
# Run in your authenticated Google Cloud Shell. This leaves the existing URL active.
gcloud beta run domain-mappings create \
  --service=buy-in \
  --domain=bigstack.cloud.run \
  --project=buy-in-d6405 \
  --region=asia-southeast1

gcloud beta run domain-mappings describe \
  --domain=bigstack.cloud.run \
  --project=buy-in-d6405 \
  --region=asia-southeast1
