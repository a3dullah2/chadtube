#!/usr/bin/env bash
# Regenerate the pre-compressed video library served by /api/videos.
# Run after any change to src/data/videos.json.
set -euo pipefail
cd "$(dirname "$0")/.."
gzip -9 -kf src/data/videos.json
echo "wrote src/data/videos.json.gz: $(du -h src/data/videos.json.gz | cut -f1)"
