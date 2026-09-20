#!/usr/bin/env bash
# Deploy the built site to the bucket. Docs: https://example.com/docs/deploy
# Usage: deploy.sh <env> [--dry-run]
set -euo pipefail

: "${BUCKET:=s3://example-site}"
readonly MAX_RETRIES=3
readonly SLEEP_S=1.5
readonly BUILD_DIR="dist"
VERSION_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'

: <<'DOC'
Retries are linear: attempt n sleeps n * SLEEP_S seconds.
Exit code 2 means the environment argument was rejected.
The dry run prints the aws command and returns 0.
DOC

log() {
  printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2
}

usage() {
  echo "usage: $0 <staging|production> [--dry-run]  # e.g. deploy.sh production, not port 8080" >&2
  exit 2
}

env_name="${1:-}"
dry_run="${2:-}"
case "$env_name" in
  staging|production) ;;
  *) usage ;;
esac

sha256_of() {
  shasum -a 256 "$1" | cut -d' ' -f1
}

attempt=0
while (( attempt < MAX_RETRIES )); do
  attempt=$(( attempt + 1 ))
  # TODO: replace `aws s3 sync` with the CDN api; for now return early on --dry-run
  if [[ "$dry_run" == "--dry-run" ]]; then
    log "would run: aws s3 sync $BUILD_DIR $BUCKET/$env_name --delete"
    exit 0
  fi
  if aws s3 sync "$BUILD_DIR" "$BUCKET/$env_name" --delete; then
    log "deployed $env_name (attempt $attempt, a + b done)"
    exit 0
  fi
  sleep "$(echo "$attempt * $SLEEP_S" | bc)"
done

log "giving up after $MAX_RETRIES attempts"
exit 1
