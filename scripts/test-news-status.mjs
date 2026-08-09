#!/usr/bin/env node
/* Status, primary-date and home-page selection rules of assets/js/news-core.js,
   checked at fixed simulated dates. */
import assert from 'node:assert/strict';
import {
  getNewsStatus, getEventStatus, displayStatus, primaryDate, getHomepageNews,
  parseLocalDate, sortItems
} from '../assets/js/news-core.js';

const hackathon = { deadline: '2026-08-26', event_date: '2026-09-12' };

const statusCases = [
  [hackathon, '2026-08-08', '報名中'],
  [hackathon, '2026-08-20', '即將截止'],
  [hackathon, '2026-08-26', '即將截止'],
  [hackathon, '2026-08-27', '報名已截止'],
  [hackathon, '2026-09-12', '報名已截止'],
  [hackathon, '2026-09-13', '活動已結束'],
  [{ event_date: '2026-12-01' }, '2026-08-08', '即將舉行'],
  [{}, '2026-08-08', '一般資訊'],
  [{ deadline: 'not-a-date' }, '2026-08-08', '一般資訊'],
  /* NAPAI: an external resource with no dates must never look expired. */
  [{ category: 'resource', source_type: 'external' }, '2026-08-09', '一般資訊']
];

for (const [item, today, expected] of statusCases) {
  const actual = getNewsStatus(item, parseLocalDate(today)).label;
  assert.equal(actual, expected, `${today} → 期望「${expected}」，實際「${actual}」`);
}
assert.equal(getEventStatus, getNewsStatus, 'getEventStatus 別名應仍可用');

/* A center announcement carries no registration, so it shows no status chip. */
assert.equal(displayStatus({ category: 'announcement' }, parseLocalDate('2026-08-09')), null);
assert.equal(
  displayStatus({ category: 'resource' }, parseLocalDate('2026-08-09')).key, 'info',
  '其他分類仍顯示「一般資訊」'
);
assert.equal(
  displayStatus({ category: 'announcement', deadline: '2026-09-01' }, parseLocalDate('2026-08-09')).key,
  'open', '公告若有報名截止日，仍須顯示狀態'
);

/* Primary date: an open deadline outranks the event date, which outranks publish_date. */
const dateCases = [
  [hackathon, '2026-08-09', 'deadline', '2026-08-26'],
  [hackathon, '2026-08-27', 'event_date', '2026-09-12'],
  [{ event_date: '2026-11-20', publish_date: '2026-08-08' }, '2026-08-09', 'event_date', '2026-11-20'],
  [{ publish_date: '2026-08-01' }, '2026-08-09', 'publish_date', '2026-08-01'],
  [{}, '2026-08-09', null, null]
];
for (const [item, today, key, value] of dateCases) {
  const actual = primaryDate(item, parseLocalDate(today));
  if (key === null) {
    assert.equal(actual, null, '沒有任何日期時應回傳 null');
  } else {
    assert.equal(actual.key, key, `${today} → 期望主要日期欄位 ${key}`);
    assert.equal(actual.value, value);
  }
}

/* Home page selection: featured only, finished events dropped, urgency-aware
   ordering, and no more than two items of one category / two external items. */
const feed = [
  { id: 'taai', category: 'academic', source_type: 'internal', featured: true, priority: 100, publish_date: '2026-08-08', event_date: '2026-11-20', deadline: '2026-09-14' },
  { id: 'hackathon', category: 'competition', source_type: 'external', featured: true, priority: 96, publish_date: '2026-08-08', event_date: '2026-09-12', deadline: '2026-08-26' },
  { id: 'napai', category: 'resource', source_type: 'external', featured: true, priority: 95, publish_date: '2026-08-07' },
  { id: 'launch', category: 'announcement', source_type: 'internal', featured: true, priority: 95, publish_date: '2026-08-01' },
  { id: 'services', category: 'announcement', source_type: 'internal', featured: true, priority: 80, publish_date: '2026-08-01' },
  { id: 'members', category: 'announcement', source_type: 'internal', featured: true, priority: 70, publish_date: '2026-08-01' },
  { id: 'survey', category: 'collaboration', source_type: 'internal', featured: false, priority: 60, publish_date: '2026-07-18' },
  { id: 'past', category: 'academic', source_type: 'external', featured: true, priority: 99, publish_date: '2026-01-01', event_date: '2026-03-01' }
];
const home = getHomepageNews(feed, { now: parseLocalDate('2026-08-09') }).map(i => i.id);

assert.equal(home.length, 4, '首頁預設顯示 4 則');
assert.ok(!home.includes('survey'), 'featured=false 不得出現在首頁');
assert.ok(!home.includes('past'), '已結束的活動不得出現在首頁');
assert.equal(home[0], 'hackathon', '報名即將截止的項目應排在最前');
assert.deepEqual(home, ['hackathon', 'taai', 'napai', 'launch'], '首頁排序與多樣性');
assert.ok(home.includes('launch'), '中心公告不得因沒有活動日期而被視為過期');
assert.ok(
  home.filter(id => ['hackathon', 'napai'].includes(id)).length <= 2,
  '首頁最多 2 則外部消息'
);

/* Diversity caps must never leave the home page short of items. */
const allAnnouncements = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
  id, category: 'announcement', source_type: 'internal', featured: true,
  priority: 90 - i, publish_date: '2026-08-01'
}));
assert.equal(
  getHomepageNews(allAnnouncements, { now: parseLocalDate('2026-08-09') }).length, 4,
  '同分類項目過多時仍應補滿 4 則'
);

assert.equal(parseLocalDate('2026-02-31'), null, '不存在的日期應回傳 null');
assert.equal(parseLocalDate('2026-08-26').getHours(), 0, '日期應解析為本地午夜');

const sorted = sortItems([
  { id: 'a', priority: 50, publish_date: '2026-08-01' },
  { id: 'b', priority: 100, publish_date: '2026-01-01' },
  { id: 'c', priority: 50, publish_date: '2026-09-01' }
]).map(item => item.id);
assert.deepEqual(sorted, ['b', 'c', 'a'], 'priority DESC，再比 publish_date DESC');

console.log('✓ 狀態、主要日期、首頁選件與排序測試全部通過');
