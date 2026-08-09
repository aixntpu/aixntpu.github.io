/* ==========================================================================
   NTPU AI4X | News & Events list page
   Fuse.js handles text relevance only; category / source / status are plain
   JavaScript filters. All state lives in the query string so a filtered view
   can be reloaded, shared and navigated with the browser Back button.
   ========================================================================== */
import {
  loadNews, getEventStatus, categoryLabel, sourceLabel, isExternal, detailHref,
  formatDate, sortItems, el, clear, renderMessage, strings
} from './news-core.js';

/* Fuse.js is pinned to an exact version — never @latest, so a CDN release can
   never change search behaviour without a commit here. */
const FUSE_URL = 'https://cdn.jsdelivr.net/npm/fuse.js@7.5.0/dist/fuse.mjs';

const FUSE_OPTIONS = {
  includeScore: true,
  threshold: 0.34,
  ignoreLocation: true,
  keys: [
    { name: 'title', weight: 0.36 },
    { name: 'tags', weight: 0.22 },
    { name: 'summary', weight: 0.18 },
    { name: 'category_label', weight: 0.08 },
    { name: 'location', weight: 0.06 },
    { name: 'organizers', weight: 0.06 },
    { name: 'source_name', weight: 0.04 }
  ]
};

const SEARCH_DEBOUNCE_MS = 300;

const root = document.querySelector('[data-news-list]');
if (root) init(root);

async function init(container) {
  const dom = {
    container,
    results: container.querySelector('[data-news-results]'),
    count: container.querySelector('[data-news-count]'),
    search: container.querySelector('[data-news-search]'),
    category: container.querySelector('[data-news-filter="category"]'),
    source: container.querySelector('[data-news-filter="source"]'),
    status: container.querySelector('[data-news-filter="status"]'),
    clear: container.querySelector('[data-news-clear]')
  };

  const s = strings();
  fillOptions(dom.category, s.categories);
  fillOptions(dom.source, s.sources);
  fillOptions(dom.status, s.statuses);

  let items;
  try {
    items = await loadNews(datasetUrl(container));
  } catch (err) {
    renderMessage(dom.results, err.message || s.error, 'news-message--error');
    if (dom.count) dom.count.textContent = '';
    return;
  }

  const fuse = await createSearcher(items);

  const render = () => {
    const state = readState();
    syncControls(dom, state);
    const matches = applyFilters(items, state, fuse);
    renderCount(dom.count, matches.length, state);
    renderResults(dom.results, matches);
  };

  bindControls(dom, render);
  window.addEventListener('popstate', render);
  render();
}

/* -------------------------------------------------------------------------
   Data source
   ------------------------------------------------------------------------- */

/** `?dataset=dev` loads the local development fixture; anything else is ignored. */
function datasetUrl(container) {
  const wantsDev = new URLSearchParams(location.search).get('dataset') === 'dev';
  return (wantsDev && container.dataset.newsSrcDev) || container.dataset.newsSrc;
}

/* -------------------------------------------------------------------------
   URL state
   ------------------------------------------------------------------------- */

const EMPTY_STATE = { q: '', category: '', source: '', status: '' };

function readState() {
  const params = new URLSearchParams(location.search);
  return {
    q: (params.get('q') || '').trim(),
    category: valueIn(params.get('category'), strings().categories),
    source: valueIn(params.get('source'), strings().sources),
    status: valueIn(params.get('status'), strings().statuses)
  };
}

function valueIn(value, dictionary) {
  return value && Object.prototype.hasOwnProperty.call(dictionary, value) ? value : '';
}

function writeState(state) {
  const params = new URLSearchParams(location.search);
  Object.entries(state).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });
  const query = params.toString();
  const url = `${location.pathname}${query ? '?' + query : ''}`;
  if (url !== location.pathname + location.search) history.pushState(null, '', url);
}

function isEmptyState(state) {
  return !state.q && !state.category && !state.source && !state.status;
}

/* -------------------------------------------------------------------------
   Controls
   ------------------------------------------------------------------------- */

function fillOptions(select, dictionary) {
  if (!select) return;
  Object.entries(dictionary).forEach(([value, label]) => {
    const option = el('option', null, label);
    option.value = value;
    select.append(option);
  });
}

function bindControls(dom, render) {
  let timer;
  if (dom.search) {
    dom.search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { writeState({ q: dom.search.value.trim() }); render(); }, SEARCH_DEBOUNCE_MS);
    });
    dom.search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearTimeout(timer);
      writeState({ q: dom.search.value.trim() });
      render();
    });
  }
  [['category', dom.category], ['source', dom.source], ['status', dom.status]].forEach(([key, select]) => {
    if (!select) return;
    select.addEventListener('change', () => { writeState({ [key]: select.value }); render(); });
  });
  if (dom.clear) {
    dom.clear.addEventListener('click', () => {
      if (dom.search) dom.search.value = '';
      writeState(EMPTY_STATE);
      render();
    });
  }
}

function syncControls(dom, state) {
  if (dom.search && dom.search.value.trim() !== state.q) dom.search.value = state.q;
  if (dom.category) dom.category.value = state.category;
  if (dom.source) dom.source.value = state.source;
  if (dom.status) dom.status.value = state.status;
  if (dom.clear) dom.clear.hidden = isEmptyState(state);
}

/* -------------------------------------------------------------------------
   Search & filters
   ------------------------------------------------------------------------- */

async function createSearcher(items) {
  try {
    const { default: Fuse } = await import(FUSE_URL);
    const fuse = new Fuse(items, FUSE_OPTIONS);
    return (query) => fuse.search(query).map(hit => hit.item);
  } catch (err) {
    // The list stays usable (exact substring match) if the CDN is unreachable.
    console.error('[news] Fuse.js unavailable, falling back to substring search', err);
    return (query) => {
      const needle = query.toLowerCase();
      return items.filter(item => searchableText(item).includes(needle));
    };
  }
}

function searchableText(item) {
  return [item.title, item.summary, categoryLabel(item), item.location, item.source_name]
    .concat(item.tags || [], item.organizers || [])
    .filter(Boolean).join(' ').toLowerCase();
}

function applyFilters(items, state, search) {
  const base = state.q ? search(state.q) : sortItems(items);
  const now = new Date();
  return base.filter(item => {
    if (state.category && item.category !== state.category) return false;
    if (state.source && item.source_type !== state.source) return false;
    if (state.status && getEventStatus(item, now).key !== state.status) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

function renderCount(node, total, state) {
  if (!node) return;
  const s = strings();
  node.textContent = isEmptyState(state) ? s.countAll(total) : s.countFiltered(total);
}

function renderResults(node, items) {
  if (!node) return;
  clear(node);
  if (!items.length) {
    const s = strings();
    const empty = el('div', 'news-empty');
    empty.append(
      el('p', 'news-empty__title', s.emptyTitle),
      el('p', 'news-empty__hint', s.emptyHint)
    );
    node.append(empty);
    return;
  }
  items.forEach(item => node.append(card(item)));
}

function card(item) {
  const article = el('article', 'news-card');

  const meta = el('div', 'news-card__meta');
  const date = formatDate(item.publish_date);
  if (date) meta.append(el('span', 'news-date', date));
  meta.append(el('span', 'status-tag st-soon', categoryLabel(item)));
  meta.append(el('span', `news-badge news-badge--${item.source_type}`, sourceLabel(item)));
  const st = getEventStatus(item);
  meta.append(el('span', `news-status news-status--${st.key}`, st.label));
  article.append(meta);

  const heading = el('h2', 'news-card__title');
  const link = el('a', null, item.title);
  link.href = detailHref(item);
  heading.append(link);
  article.append(heading, el('p', 'news-card__summary', item.summary));

  const facts = factList(item);
  if (facts) article.append(facts);

  const s = strings();
  const more = el('p', 'news-card__more');
  const detail = el('a', 'news-card__link', s.viewDetail);
  detail.href = detailHref(item);
  detail.append(el('span', 'news-card__arrow', ' →'));
  detail.lastChild.setAttribute('aria-hidden', 'true');
  detail.setAttribute('aria-label', s.viewDetailAria(item.title));
  more.append(detail);
  article.append(more);

  return article;
}

/** Only renders the rows the item actually has — no empty labels. */
function factList(item) {
  const { facts } = strings();
  const rows = [
    [facts.event_date, formatDate(item.event_date)],
    [facts.deadline, formatDate(item.deadline)],
    [facts.location, item.location]
  ].filter(([, value]) => !!value);
  if (!rows.length) return null;

  const dl = el('dl', 'news-card__facts');
  rows.forEach(([label, value]) => {
    dl.append(el('dt', null, label), el('dd', null, value));
  });
  return dl;
}
