#!/usr/bin/env node
/* ==========================================================================
   Validates the news data files against assets/data/news.schema.json plus the
   rules a JSON Schema cannot express (unique ids/slugs, date ordering).
   No dependencies — runs on plain Node.

   Usage: node scripts/validate-news.mjs [file ...]
   ========================================================================== */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(ROOT, 'assets/data/news.schema.json');
const DEFAULT_FILES = [
  'assets/data/news.zh.json',
  'assets/data/news.en.json',
  'assets/data/news.dev.json'
];

/* The EN / 中文 switch on a detail page keeps the `id`, so both language files
   must describe the same set of items. */
const TRANSLATION_PAIR = ['assets/data/news.zh.json', 'assets/data/news.en.json'];

/* Fields that carry no language and therefore must be identical in both files —
   they drive sorting, filtering, the home page and the auto-computed status, so
   a mismatch would make the two editions behave differently. */
const SHARED_FIELDS = [
  'slug',
  'category',
  'source_type',
  'publish_date',
  'event_date',
  'deadline',
  'featured',
  'priority'
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];

function fail(file, where, message) {
  errors.push(`${file}${where ? ' ' + where : ''}: ${message}`);
}

/* ---- Minimal JSON Schema checker (only the keywords this schema uses) ---- */
function validate(schema, value, root, file, where) {
  if (schema.$ref) {
    return validate(resolveRef(schema.$ref, root), value, root, file, where);
  }
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(file, where, '應為物件');
    }
    for (const key of schema.required || []) {
      if (!(key in value)) fail(file, where, `缺少必填欄位 "${key}"`);
    }
    const props = schema.properties || {};
    for (const [key, child] of Object.entries(value)) {
      if (!props[key]) {
        if (schema.additionalProperties === false) fail(file, where, `不允許的欄位 "${key}"`);
        continue;
      }
      validate(props[key], child, root, file, `${where}.${key}`);
    }
    for (const branch of schema.allOf || []) {
      if (branch.if && matches(branch.if, value) && branch.then) {
        validate({ type: 'object', ...branch.then, properties: props }, value, root, file, where);
      }
    }
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return fail(file, where, '應為陣列');
    value.forEach((entry, i) => validate(schema.items, entry, root, file, `${where}[${i}]`));
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return fail(file, where, '應為字串');
    if (schema.minLength && value.length < schema.minLength) fail(file, where, '不可為空字串');
    if (schema.enum && !schema.enum.includes(value)) {
      fail(file, where, `"${value}" 不是允許的值（${schema.enum.join(' / ')}）`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(file, where, `"${value}" 格式不符（${schema.pattern}）`);
    }
    return;
  }
  if (schema.type === 'integer') {
    if (!Number.isInteger(value)) return fail(file, where, '應為整數');
    if (schema.minimum != null && value < schema.minimum) fail(file, where, `不可小於 ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(file, where, `不可大於 ${schema.maximum}`);
    return;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    fail(file, where, '應為 true 或 false');
  }
}

function matches(condition, value) {
  return Object.entries(condition.properties || {}).every(([key, rule]) =>
    !('const' in rule) || value[key] === rule.const);
}

function resolveRef(ref, root) {
  return ref.replace(/^#\//, '').split('/').reduce((node, key) => node[key], root);
}

/* ---- Rules beyond the schema -------------------------------------------- */
function checkCrossFieldRules(items, file) {
  const ids = new Map();
  const slugs = new Map();

  items.forEach((item, i) => {
    const where = `items[${i}]`;
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) fail(file, where, `id "${item.id}" 與 items[${ids.get(item.id)}] 重複`);
      else ids.set(item.id, i);
    }
    if (typeof item.slug === 'string') {
      if (slugs.has(item.slug)) fail(file, where, `slug "${item.slug}" 與 items[${slugs.get(item.slug)}] 重複`);
      else slugs.set(item.slug, i);
    }
    for (const key of ['publish_date', 'event_date', 'deadline']) {
      const value = item[key];
      if (value == null) continue;
      if (typeof value !== 'string' || !DATE_RE.test(value) || !isRealDate(value)) {
        fail(file, where, `${key} "${value}" 不是有效的 YYYY-MM-DD 日期`);
      }
    }
    if (item.deadline && item.event_date && item.deadline > item.event_date) {
      fail(file, where, `deadline (${item.deadline}) 不應晚於 event_date (${item.event_date})`);
    }
    if (item.source_type === 'external') {
      if (!item.external_url) fail(file, where, '外部活動必須有 external_url');
      if (!item.source_name) fail(file, where, '外部活動必須有 source_name');
    }
  });
}

function isRealDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/* ---- Runner -------------------------------------------------------------- */
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
const itemsByFile = new Map();

for (const file of files) {
  let data;
  try {
    data = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
  } catch (err) {
    fail(file, '', `JSON 解析失敗：${err.message}`);
    continue;
  }
  validate(schema, data, schema, file, '');
  if (Array.isArray(data.items)) {
    checkCrossFieldRules(data.items, file);
    itemsByFile.set(file, data.items);
  }
  if (!errors.length) console.log(`✓ ${file} (${(data.items || []).length} 則消息)`);
}

checkTranslationParity(itemsByFile);

/**
 * The two language files are maintained by hand, so they must describe the same
 * items: the same ids (the language switch keeps the id) and the same
 * language-neutral fields. Translated fields — and `external_url`/`source_name`,
 * which legitimately point at each language's own page — are not compared.
 */
function checkTranslationParity(byFile) {
  const [zhFile, enFile] = TRANSLATION_PAIR;
  const zhItems = byFile.get(zhFile);
  const enItems = byFile.get(enFile);
  if (!zhItems || !enItems) return;

  const zhById = new Map(zhItems.map(item => [item.id, item]));
  const enByIndex = new Map(enItems.map((item, i) => [item.id, { item, i }]));

  zhItems.forEach((item, i) => {
    if (!enByIndex.has(item.id)) fail(zhFile, `items[${i}]`, `id "${item.id}" 在 ${enFile} 沒有對應的一筆`);
  });
  enItems.forEach((item, i) => {
    if (!zhById.has(item.id)) fail(enFile, `items[${i}]`, `id "${item.id}" 在 ${zhFile} 沒有對應的一筆`);
  });

  let compared = 0;
  for (const [id, { item: en, i }] of enByIndex) {
    const zh = zhById.get(id);
    if (!zh) continue;
    compared++;
    for (const field of SHARED_FIELDS) {
      if (describe(en[field]) === describe(zh[field])) continue;
      fail(enFile, `items[${i}]`, `${field} ${describe(en[field])} 與 ${zhFile} 的 ${describe(zh[field])} 不一致`);
    }
  }
  if (!errors.length) console.log(`✓ 中英文資料一致（${compared} 則，欄位：${SHARED_FIELDS.join('、')}）`);
}

function describe(value) {
  return value === undefined ? '（缺漏）' : JSON.stringify(value);
}

if (errors.length) {
  console.error('消息資料驗證失敗：');
  errors.forEach(message => console.error(`  ✗ ${message}`));
  process.exit(1);
}
console.log('✓ 所有消息資料驗證通過');
