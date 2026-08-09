/* ==========================================================================
   NTPU AI4X | News Hub — shared core
   --------------------------------------------------------------------------
   Single source of truth for news data loading, label mappings, event status
   and sorting. Every news surface (home page, list page, detail page) imports
   from here so the mappings are never duplicated in HTML or per-page scripts.
   ========================================================================== */

/* -------------------------------------------------------------------------
   Localisation
   The data keys (category / source_type / status) are language-neutral and are
   also the URL values and CSS modifiers; every visible string lives here, so
   neither HTML nor the per-page scripts hold a label of their own.
   ------------------------------------------------------------------------- */

const I18N = {
  zh: {
    categories: {
      announcement: '中心公告',
      academic: '學術活動',
      competition: '競賽與徵件',
      collaboration: '合作機會',
      resource: '外部資源'
    },
    sources: { internal: '中心資訊', external: '外部資訊' },
    filterAll: '全部',
    filterAllAria: '依分類篩選',
    externalNote: '詳細資訊請以主辦單位官方網站公告為準。',
    statuses: {
      open: '報名中',
      closing: '即將截止',
      closed: '報名已截止',
      upcoming: '即將舉行',
      ended: '活動已結束',
      info: '一般資訊'
    },
    listSeparator: '、',
    primaryDates: { deadline: '報名截止', event_date: '活動日期', publish_date: '發布' },
    loading: '資料載入中…',
    error: '目前無法載入消息資料，請稍後再試。',
    noFeatured: '目前沒有最新公告。',
    countAll: n => `共 ${n} 則消息`,
    countFiltered: n => `符合條件：${n} 則消息`,
    emptyTitle: '找不到符合條件的消息。',
    emptyHint: '請嘗試其他關鍵字，或清除篩選條件後重新瀏覽。',
    viewDetail: '查看詳情',
    viewDetailAria: title => `查看詳情：${title}`,
    back: '← 返回消息與活動',
    facts: {
      publish_date: '發布日期',
      event_date: '活動日期',
      deadline: '報名截止',
      location: '地點',
      eligibility: '參加資格',
      organizers: '主辦單位'
    },
    keywords: '關鍵字',
    sourceHead: '資訊來源',
    relatedHead: '相關連結',
    disclaimerTitle: '外部資訊說明',
    disclaimerBody: '外部資訊由 NTPU AI4X 彙整轉知，詳細資訊請以主辦單位官方網站公告為準。',
    detailTitle: title => `${title} | 消息與活動 | NTPU AI4X`,
    missingTitle: '找不到這則消息',
    missingBody: '這則消息可能已下架，或網址中的編號有誤。',
    missingDocTitle: '找不到這則消息 | NTPU AI4X'
  },
  en: {
    categories: {
      announcement: 'Center Announcements',
      academic: 'Academic Events',
      competition: 'Competitions & Calls',
      collaboration: 'Collaboration',
      resource: 'External Resources'
    },
    sources: { internal: 'Center information', external: 'External' },
    filterAll: 'All',
    filterAllAria: 'Filter by category',
    externalNote: 'Please refer to the organizer’s official website for the latest information.',
    statuses: {
      open: 'Registration open',
      closing: 'Closing soon',
      closed: 'Registration closed',
      upcoming: 'Upcoming',
      ended: 'Event ended',
      info: 'General information'
    },
    listSeparator: ', ',
    primaryDates: { deadline: 'Deadline', event_date: 'Event date', publish_date: 'Published' },
    loading: 'Loading…',
    error: 'News data could not be loaded right now. Please try again later.',
    noFeatured: 'No announcements yet.',
    countAll: n => `${n} ${n === 1 ? 'item' : 'items'}`,
    countFiltered: n => (n === 1 ? '1 item matches your filters' : `${n} items match your filters`),
    emptyTitle: 'No matching news or events.',
    emptyHint: 'Try a different keyword, or clear the filters to browse everything.',
    viewDetail: 'View details',
    viewDetailAria: title => `View details: ${title}`,
    back: '← Back to news & events',
    facts: {
      publish_date: 'Published',
      event_date: 'Event date',
      deadline: 'Deadline',
      location: 'Location',
      eligibility: 'Eligibility',
      organizers: 'Organizers'
    },
    keywords: 'Keywords',
    sourceHead: 'Information source',
    relatedHead: 'Related link',
    disclaimerTitle: 'About this external information',
    disclaimerBody:
      'External information compiled and shared by NTPU AI4X. Please refer to the organizer’s ' +
      'official website for the latest information.',
    detailTitle: title => `${title} | News & Events | NTPU AI4X`,
    missingTitle: 'News item not found',
    missingBody: 'This item may have been removed, or the id in the address is incorrect.',
    missingDocTitle: 'News item not found | NTPU AI4X'
  }
};

/** Language-neutral keys, shared with the validation script and the schema. */
export const CATEGORY_KEYS = Object.freeze(Object.keys(I18N.zh.categories));
export const SOURCE_KEYS = Object.freeze(Object.keys(I18N.zh.sources));
export const STATUS_KEYS = Object.freeze(Object.keys(I18N.zh.statuses));

/**
 * Strings for the page's own language, taken from `<html lang>`.
 * Guarded so the module can also be imported in Node (tests).
 */
export function strings() {
  const lang = typeof document !== 'undefined' && document.documentElement
    ? (document.documentElement.lang || '')
    : '';
  return /^zh/i.test(lang) || !lang ? I18N.zh : I18N.en;
}

/** Days before the deadline at which a call counts as closing soon. */
const CLOSING_SOON_DAYS = 7;

const MS_PER_DAY = 86400000;

/* -------------------------------------------------------------------------
   Dates
   ------------------------------------------------------------------------- */

/**
 * Parse a `YYYY-MM-DD` string as **local** midnight.
 * `new Date('2026-08-26')` is parsed as UTC and can land on the previous day
 * in Taipei, which would shift every deadline by one day.
 * @returns {Date|null} null for missing or malformed input.
 */
export function parseLocalDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects impossible dates such as 2026-02-31, which JS would roll over.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date;
}

/** Local midnight of the given date (defaults to now). */
export function startOfDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole days from `from` to `to`, both snapped to local midnight. */
function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

/**
 * Derive the registration / event status of an item from its dates alone —
 * never stored in the data file.
 *
 *   event_date in the past                      → ended
 *   deadline today or later                     → open / closing (≤ 7 days)
 *   deadline in the past, event still to come   → closed
 *   event_date in the future, no deadline       → upcoming
 *   neither date (announcements, resources)     → info
 *
 * `now` is injectable so the rules can be tested at arbitrary dates.
 * @returns {{key: string, label: string}}
 */
export function getNewsStatus(item, now = new Date()) {
  const today = startOfDay(now);
  const eventDate = parseLocalDate(item && item.event_date);
  const deadline = parseLocalDate(item && item.deadline);

  if (eventDate && today > eventDate) return status('ended');
  if (deadline) {
    if (today > deadline) return status('closed');
    return daysBetween(today, deadline) <= CLOSING_SOON_DAYS ? status('closing') : status('open');
  }
  if (eventDate) return status('upcoming');
  return status('info');
}

/** Previous name of {@link getNewsStatus}; kept so older imports keep working. */
export const getEventStatus = getNewsStatus;

/**
 * The status worth showing as a chip, or null when it would add nothing.
 * A center announcement has no registration and no event, so tagging it
 * 「一般資訊」 is noise — its category and publish date already say everything.
 */
export function displayStatus(item, now = new Date()) {
  const st = getNewsStatus(item, now);
  if (st.key === 'info' && item && item.category === 'announcement') return null;
  return st;
}

function status(key) {
  return { key, label: strings().statuses[key] };
}

/**
 * The single most useful date for an item, by falling urgency:
 * an open deadline, then an upcoming event, then the publication date.
 * @returns {{key: string, label: string, value: string}|null}
 */
export function primaryDate(item, now = new Date()) {
  const today = startOfDay(now);
  const { primaryDates } = strings();
  const deadline = parseLocalDate(item && item.deadline);
  const eventDate = parseLocalDate(item && item.event_date);

  if (deadline && today <= deadline) return dateFact('deadline', item.deadline, primaryDates);
  if (eventDate && today <= eventDate) return dateFact('event_date', item.event_date, primaryDates);
  if (deadline) return dateFact('deadline', item.deadline, primaryDates);
  if (eventDate) return dateFact('event_date', item.event_date, primaryDates);
  return formatDate(item && item.publish_date)
    ? dateFact('publish_date', item.publish_date, primaryDates)
    : null;
}

function dateFact(key, value, labels) {
  return { key, label: labels[key], value: formatDate(value) };
}

/** `2026-08-26` → `2026-08-26`; anything unparsable → '' (never Invalid Date). */
export function formatDate(value) {
  return parseLocalDate(value) ? value.trim() : '';
}

/* -------------------------------------------------------------------------
   Labels & links
   ------------------------------------------------------------------------- */

/**
 * The shared mapping wins over the data file's `category_label`, so a card and
 * the category filter chips can never disagree; `category_label` stays in the
 * schema and is used only for categories the mapping does not know.
 */
export function categoryLabel(item) {
  if (!item) return '';
  return strings().categories[item.category] || item.category_label || '';
}

export function sourceLabel(item) {
  return (item && strings().sources[item.source_type]) || '';
}

export function isExternal(item) {
  return !!item && item.source_type === 'external';
}

/**
 * Only `http:` / `https:` links are ever rendered — blocks `javascript:` and
 * `data:` URLs sneaking in through the data file.
 * @returns {string} the safe URL, or '' if it must not be used.
 */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim(), document.baseURI);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Link to the shared detail page for an item. */
export function detailHref(item, base = 'news-detail.html') {
  return `${base}?id=${encodeURIComponent(item.id)}`;
}

/* -------------------------------------------------------------------------
   Sorting
   ------------------------------------------------------------------------- */

/** priority DESC, then publish_date DESC. Never mutates the input array. */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const p = toPriority(b) - toPriority(a);
    if (p !== 0) return p;
    return String(b.publish_date || '').localeCompare(String(a.publish_date || ''));
  });
}

function toPriority(item) {
  const n = Number(item && item.priority);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------------------------
   Home page selection
   --------------------------------------------------------------------------
   Two data fields drive this, and they mean different things:

     featured — editorial opt-in: may this item appear on the home page at all?
     priority — manual ordering weight *between featured items* (0–100).

   priority is the main term but never the only one: a call closing this week
   should outrank a higher-priority item with nothing happening, and an event
   that is over should drop off the home page even if its priority is high.
   ------------------------------------------------------------------------- */

/** How many items the home page shows. 4 by design; 5 is the sane maximum. */
export const HOME_NEWS_LIMIT = 4;

/** Score bonuses, all additive on top of `priority`. Tuned to stay small
    relative to the 0–100 priority range so editors keep the final say. */
const HOME_SCORE = {
  deadlineWithin7: 40,
  deadlineWithin30: 25,
  deadlineLater: 10,
  eventWithin30: 20,
  eventWithin90: 10,
  registrationClosed: -15, // event still to come, but nobody can sign up any more
  publishedWithin30: 8,
  publishedWithin90: 4
};

/** At most this many items of one category / from external sources in the set,
    so the home page never turns into a wall of outside events. */
const HOME_DIVERSITY = { perCategory: 2, external: 2 };

function homeScore(item, now) {
  const today = startOfDay(now);
  const deadline = parseLocalDate(item.deadline);
  const eventDate = parseLocalDate(item.event_date);
  const publish = parseLocalDate(item.publish_date);
  let score = toPriority(item);

  if (deadline && today <= deadline) {
    const days = daysBetween(today, deadline);
    score += days <= CLOSING_SOON_DAYS ? HOME_SCORE.deadlineWithin7
      : days <= 30 ? HOME_SCORE.deadlineWithin30
        : HOME_SCORE.deadlineLater;
  } else if (deadline) {
    score += HOME_SCORE.registrationClosed;
  }

  if (eventDate && today <= eventDate) {
    const days = daysBetween(today, eventDate);
    if (days <= 30) score += HOME_SCORE.eventWithin30;
    else if (days <= 90) score += HOME_SCORE.eventWithin90;
  }

  if (publish && publish <= today) {
    const age = daysBetween(publish, today);
    if (age <= 30) score += HOME_SCORE.publishedWithin30;
    else if (age <= 90) score += HOME_SCORE.publishedWithin90;
  }

  return score;
}

/**
 * The items the home page should show: featured, still relevant, ranked by
 * urgency-aware score, then spread across categories.
 *
 * Items with no event_date and no deadline (a launch announcement, a standing
 * resource) never expire — only a finished event is dropped.
 *
 * @param {Array} items every news item (already sorted or not)
 * @param {{now?: Date, limit?: number}} [options]
 */
export function getHomepageNews(items, options = {}) {
  const now = options.now || new Date();
  const limit = options.limit || HOME_NEWS_LIMIT;

  const ranked = (Array.isArray(items) ? items : [])
    .filter(item => item && item.featured === true)
    .filter(item => getNewsStatus(item, now).key !== 'ended')
    .map(item => ({ item, score: homeScore(item, now) }))
    .sort((a, b) =>
      b.score - a.score ||
      String(b.item.publish_date || '').localeCompare(String(a.item.publish_date || '')) ||
      String(a.item.id).localeCompare(String(b.item.id))
    )
    .map(entry => entry.item);

  // Pass 1: best items, subject to the diversity caps.
  const picked = [];
  const perCategory = new Map();
  let external = 0;
  for (const item of ranked) {
    if (picked.length >= limit) break;
    const used = perCategory.get(item.category) || 0;
    if (used >= HOME_DIVERSITY.perCategory) continue;
    if (isExternal(item) && external >= HOME_DIVERSITY.external) continue;
    picked.push(item);
    perCategory.set(item.category, used + 1);
    if (isExternal(item)) external += 1;
  }

  // Pass 2: if the caps left the home page short, fill it back up by score.
  for (const item of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

/* -------------------------------------------------------------------------
   Data loading
   ------------------------------------------------------------------------- */

/**
 * Fetch the news file and return sorted items.
 * Rejects with an Error whose message is safe to display.
 */
export async function loadNews(url) {
  let payload;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    console.error('[news] failed to load', url, err);
    throw new Error(strings().error);
  }
  const items = payload && Array.isArray(payload.items) ? payload.items : null;
  if (!items) {
    console.error('[news] unexpected payload shape', payload);
    throw new Error(strings().error);
  }
  return sortItems(items.filter(item => item && typeof item.id === 'string'));
}

/* -------------------------------------------------------------------------
   Small DOM helpers (textContent only — never innerHTML with data)
   ------------------------------------------------------------------------- */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== '') node.textContent = String(text);
  return node;
}

/** `<time datetime="2026-08-26">2026-08-26</time>`, optionally label-prefixed. */
export function timeEl(value, className, label) {
  const iso = formatDate(value);
  const node = el('time', className, label ? `${label} ${iso}` : iso);
  node.setAttribute('datetime', iso);
  return node;
}

/** External anchor with the mandatory rel + an off-site indicator. */
export function externalLink(href, text) {
  const a = el('a', 'news-extlink', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(el('span', 'news-extlink__icon', '↗'));
  a.lastChild.setAttribute('aria-hidden', 'true');
  return a;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replaces a container's contents with a single message paragraph. */
export function renderMessage(container, message, modifier = '') {
  if (!container) return;
  clear(container);
  container.append(el('p', `news-message${modifier ? ' ' + modifier : ''}`, message));
}
