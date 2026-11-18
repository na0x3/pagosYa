#!/usr/bin/env bash
# Spec 2026-11-16 photo library: CC0 candidates from rawpixel via Openverse (stocksnap refuses direct downloads; Unsplash needs a key).
# Usage: candidates.sh <out-dir> "<query 1>" "<query 2>" …   — downloads into <out-dir>/NNN.jpg and writes <out-dir>/index.tsv.
set -euo pipefail
out="$1"; shift; mkdir -p "$out"; : > "$out/urls.txt"
for q in "$@"; do
  curl -s -A "pagosya-library/1.0" "https://api.openverse.org/v1/images/?q=$(printf %s "$q" | sed 's/ /%20/g')&page_size=20&source=rawpixel&license=cc0" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{for(const r of JSON.parse(s).results)console.log(r.url+'\t'+r.foreign_landing_url)}catch{}})" >> "$out/urls.txt"
done
sort -u "$out/urls.txt" | awk -F'\t' '{printf "%03d\t%s\t%s\n", NR, $1, $2}' > "$out/index.tsv"
cut -f1,2 "$out/index.tsv" | xargs -P 12 -n 2 sh -c 'curl -s -m 40 -A "pagosya-library/1.0" -o "'"$out"'/$0.jpg" "$1"'
for f in "$out"/*.jpg; do sips -s format jpeg "$f" --out "$f" >/dev/null 2>&1 || rm -f "$f"; done
