#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$TARGET/.claude/skills"
cp -R "$SOURCE_DIR/.claude/skills/." "$TARGET/.claude/skills/"

echo "Installed ecommerce UI skills into: $TARGET/.claude/skills"
echo "Skills:"
find "$TARGET/.claude/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
