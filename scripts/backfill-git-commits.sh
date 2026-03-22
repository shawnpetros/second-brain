#!/bin/bash

# Backfill git commits from all repos as milestones to the brain.
# Captures every commit from the last N days (default 30) that isn't
# a merge commit or trivial fixup.
#
# Usage: ./scripts/backfill-git-commits.sh [days]

DAYS=${1:-30}
BRAIN_URL="https://second-brain.shawnpetros.com"
ENV_FILE="/Users/shawnpetros/projects/second-brain/.env.local"
PROJECTS_DIR="/Users/shawnpetros/projects"

# Get API key
BRAIN_KEY=$(grep '^BRAIN_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"')
if [ -z "$BRAIN_KEY" ]; then
  echo "ERROR: BRAIN_API_KEY not found in $ENV_FILE"
  exit 1
fi

echo "=== Git Commit Backfill ==="
echo "Period: last $DAYS days"
echo "Source: $PROJECTS_DIR/*"
echo ""

TOTAL=0
CAPTURED=0
SKIPPED=0
ERRORS=0

for dir in "$PROJECTS_DIR"/*/; do
  if [ ! -d "$dir.git" ]; then
    continue
  fi

  REPO=$(basename "$dir")

  # Get commits from last N days, skip merges
  while IFS='|' read -r SHA DATE AUTHOR MSG; do
    # Skip empty
    [ -z "$SHA" ] && continue

    # Skip merge commits and trivial stuff
    if echo "$MSG" | grep -qiE "^merge|^wip$|^fixup|^chore: session wrapup"; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    TOTAL=$((TOTAL + 1))
    BRANCH=$(git -C "$dir" branch --contains "$SHA" 2>/dev/null | head -1 | tr -d '* ' || echo "unknown")

    TEXT="COMMIT ($REPO/$BRANCH): $MSG
Author: $AUTHOR | SHA: $SHA | Date: $DATE"

    # POST to capture API
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BRAIN_URL/api/capture" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $BRAIN_KEY" \
      -d "$(jq -n --arg text "$TEXT" --arg source "git-backfill" --arg type "milestone" \
        '{text: $text, source: $source, thought_type: $type}')" \
      --max-time 30 2>&1)

    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    if [ "$HTTP_CODE" = "200" ]; then
      CAPTURED=$((CAPTURED + 1))
      echo "  [$CAPTURED] $REPO: $MSG"
    else
      ERRORS=$((ERRORS + 1))
      echo "  [ERROR] $REPO: $MSG (HTTP $HTTP_CODE)"
    fi

    # Rate limit: 500ms between captures (embeddings + metadata extraction)
    sleep 0.5
  done < <(git -C "$dir" log --since="${DAYS} days ago" --no-merges --pretty=format:"%h|%ci|%an|%s" 2>/dev/null)
done

echo ""
echo "=== Backfill Complete ==="
echo "Captured: $CAPTURED"
echo "Skipped:  $SKIPPED (merges, fixups, wrapups)"
echo "Errors:   $ERRORS"
echo "Total:    $TOTAL commits processed"
