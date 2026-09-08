#!/usr/bin/env bash
# Idempotent bootstrap for the Applied Research desktop app on Cursor Cloud.
# Safe to run repeatedly: it converges the toolchain and dependencies without
# rewriting the committed lockfile.
set -euo pipefail

cd "$(dirname "$0")/.."

# The project requires Node 24 (see .node-version and package.json "engines"),
# but the base image's default `node` is older. nvm is preinstalled in the base
# image and is already sourced by ~/.bashrc, so installing Node 24 and pointing
# the `default` alias at it makes every future shell (and terminal) use Node 24.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm alias default 24
nvm use 24

echo "Using Node $(node --version) / npm $(npm --version)"

# Install the exact dependencies from the committed lockfile.
npm ci

# Electron 44 has no install-time postinstall; it downloads its runtime lazily
# on the first `require('electron')`. Pre-warm it here so the first `npm run dev`
# or test:e2e starts immediately. Non-fatal: it will retry on first launch if the
# network is briefly unavailable during setup.
node node_modules/electron/install.js || echo "Electron pre-warm skipped; it will download on first launch."
