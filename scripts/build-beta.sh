#!/bin/sh
# Preserve the existing entry point without changing tracked source assets.
set -eu
cd "$(dirname "$0")/.."
exec pnpm build:beta
