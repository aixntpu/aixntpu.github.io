#!/usr/bin/env node
/* Validates assets/data/faculty.json — the single source of truth behind the
   searchable NTPU AI 教師群 directory on members.html / zh/members.html.
   Checks the vocabularies, zh/en parity, and that every referenced photo and
   every filter key really exists. Run by `npm test`. */
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'assets/data/faculty.json';
const LANGS = ['zh', 'en'];

const errors = [];
const fail = (msg) => errors.push(msg);

const data = JSON.parse(await readFile(path.join(ROOT, FILE), 'utf8'));

/* ---- vocabularies -------------------------------------------------------- */
for (const list of ['ranks', 'colleges', 'domains']) {
  if (!Array.isArray(data[list]) || !data[list].length) {
    fail(`${list}: missing or empty`);
    continue;
  }
  const keys = new Set();
  data[list].forEach((entry, i) => {
    if (!entry.key || !/^[a-z0-9-]+$/.test(entry.key)) fail(`${list}[${i}]: bad key ${JSON.stringify(entry.key)}`);
    if (keys.has(entry.key)) fail(`${list}: duplicate key "${entry.key}"`);
    keys.add(entry.key);
    LANGS.forEach(lang => {
      if (!entry[lang]) fail(`${list}."${entry.key}": missing ${lang} label`);
    });
    // Aliases are what the search box accepts besides the label itself
    // (社科 → 社會科學學院). Optional, but never empty or duplicated.
    if (entry.aliases !== undefined) {
      if (!Array.isArray(entry.aliases)) {
        fail(`${list}."${entry.key}": aliases must be an array`);
      } else {
        entry.aliases.forEach(alias => {
          if (typeof alias !== 'string' || !alias.trim()) fail(`${list}."${entry.key}": empty alias`);
          if (alias !== alias.trim()) fail(`${list}."${entry.key}": alias "${alias}" has stray spaces`);
        });
        if (new Set(entry.aliases).size !== entry.aliases.length) {
          fail(`${list}."${entry.key}": duplicate alias`);
        }
      }
    }
  });
}

const rankKeys = new Set(data.ranks.map(r => r.key));
const collegeKeys = new Set(data.colleges.map(c => c.key));
const domainKeys = new Set(data.domains.map(d => d.key));

/* ---- faculty entries ----------------------------------------------------- */
if (!Array.isArray(data.faculty) || !data.faculty.length) fail('faculty: missing or empty');

const ids = new Set();
const emails = new Set();
const photos = new Set();

for (const person of data.faculty || []) {
  const at = `faculty "${person.id || '(no id)'}"`;
  if (!person.id || !/^[a-z0-9]+$/.test(person.id)) fail(`${at}: bad id`);
  if (ids.has(person.id)) fail(`${at}: duplicate id`);
  ids.add(person.id);

  if (!collegeKeys.has(person.college)) fail(`${at}: unknown college "${person.college}"`);
  if (!rankKeys.has(person.rank)) fail(`${at}: unknown rank "${person.rank}"`);

  if (!Array.isArray(person.domains) || !person.domains.length) {
    fail(`${at}: needs at least one research domain`);
  } else {
    person.domains.forEach(key => {
      if (!domainKeys.has(key)) fail(`${at}: unknown domain "${key}"`);
    });
    if (new Set(person.domains).size !== person.domains.length) fail(`${at}: duplicate domain`);
  }

  if (!person.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) fail(`${at}: bad email`);
  else if (emails.has(person.email)) fail(`${at}: duplicate email ${person.email}`);
  else emails.add(person.email);

  if (person.web && !/^https?:\/\//.test(person.web)) fail(`${at}: web must be http(s)`);

  // A card shows a portrait or, failing that, initials — never nothing.
  if (person.photo) {
    if (!/^assets\/faculty\/[\w.-]+$/.test(person.photo)) fail(`${at}: photo must be a repo-root path under assets/faculty/`);
    else photos.add(person.photo);
  } else if (!person.initials) {
    fail(`${at}: needs either a photo or initials`);
  }

  // zh/en parity: both editions render from the same record.
  LANGS.forEach(lang => {
    const local = person[lang];
    if (!local) { fail(`${at}: missing ${lang} block`); return; }
    ['name', 'role', 'affiliation'].forEach(field => {
      if (!local[field]) fail(`${at}: missing ${lang}.${field}`);
    });
    if (!Array.isArray(local.expertise) || !local.expertise.length) fail(`${at}: missing ${lang}.expertise`);
  });
  if (person.zh && person.en && Array.isArray(person.zh.expertise) && Array.isArray(person.en.expertise)
      && person.zh.expertise.length !== person.en.expertise.length) {
    fail(`${at}: expertise count differs between zh (${person.zh.expertise.length}) and en (${person.en.expertise.length})`);
  }
  if (person.zh && person.en && !!person.zh.courses !== !!person.en.courses) {
    fail(`${at}: AI courses present in one language only`);
  }
}

/* ---- referenced files exist ---------------------------------------------- */
for (const photo of photos) {
  try {
    await access(path.join(ROOT, photo));
  } catch {
    fail(`missing file: ${photo}`);
  }
}

/* ---- report -------------------------------------------------------------- */
if (errors.length) {
  console.error(`✗ ${FILE}`);
  errors.forEach(msg => console.error('  - ' + msg));
  process.exit(1);
}

const byCollege = data.colleges
  .map(c => `${c.key}=${data.faculty.filter(p => p.college === c.key).length}`).join(' ');
const crossDomain = data.faculty.filter(p => p.domains.length > 1).length;
console.log(`✓ ${FILE}: ${data.faculty.length} faculty, ${data.domains.length} domains, ${crossDomain} cross-domain`);
console.log(`  colleges: ${byCollege}`);
