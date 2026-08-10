#!/usr/bin/env node
/* Syntax-checks the news ES modules. `node --check` treats a .js file as
   CommonJS, so each module is copied to a temporary .mjs first. */
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = [
  'assets/js/news-core.js',
  'assets/js/news-list.js',
  'assets/js/news-detail.js',
  'assets/js/home-news.js',
  'assets/js/faculty-directory.js'
];

const dir = await mkdtemp(path.join(tmpdir(), 'ai4x-js-'));
let failed = false;
try {
  for (const file of MODULES) {
    const copy = path.join(dir, path.basename(file, '.js') + '.mjs');
    await writeFile(copy, await readFile(path.join(ROOT, file), 'utf8'));
    try {
      await run(process.execPath, ['--check', copy]);
      console.log(`✓ ${file}`);
    } catch (err) {
      failed = true;
      console.error(`✗ ${file}\n${err.stderr || err.message}`);
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log('✓ JavaScript 語法檢查通過');
