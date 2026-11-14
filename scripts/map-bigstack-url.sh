#!/usr/bin/env bash
set -euo pipefail
# Existing mappings are reused, so routine app updates do not fail on a claimed URL.
if bigstack_route=$(gcloud beta run domain-mappings describe \
  --domain=bigstack.cloud.run --project=buy-in-d6405 --region=asia-southeast1 \
  --format='value(spec.routeName)' 2>/dev/null); then
  if [[ "$bigstack_route" != 'buy-in' ]]; then
    printf '%s\n' 'The shorter address points to another service. Leaving it unchanged.' >&2
    exit 1
  fi
else
  gcloud beta run domain-mappings create \
    --service=buy-in --domain=bigstack.cloud.run \
    --project=buy-in-d6405 --region=asia-southeast1
fi
gcloud beta run domain-mappings describe \
  --domain=bigstack.cloud.run --project=buy-in-d6405 --region=asia-southeast1
