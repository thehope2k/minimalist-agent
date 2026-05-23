#!/usr/bin/env node
// Rebuild node-pty native addon for the current Electron version.
// Run manually after switching Electron versions, or let postinstall handle it.
// Usage: node scripts/rebuild-native.mjs
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = resolve(__dirname, '../node_modules/.bin/electron-rebuild');
execSync(`${bin} -f -w node-pty`, { stdio: 'inherit' });
