/* ==========================================================================
   NTPU AI4X | NTPU AI faculty directory
   --------------------------------------------------------------------------
   One JSON file (assets/data/faculty.json) holds every NTPU AI professor in
   both languages; this module renders the searchable, filterable directory on
   members.html and zh/members.html. The page language comes from <html lang>,
   so the same script and the same data serve both editions.

   Fuse.js handles text relevance only. College, rank, research domain and the
   cross-domain switch are plain JavaScript filters. All state lives in the
   query string, so a filtered view can be reloaded, shared and navigated with
   the browser Back button.
   ========================================================================== */

/* Fuse.js is pinned to an exact version — never @latest, so a CDN release can
   never change search behaviour without a commit here. */
const FUSE_URL = 'https://cdn.jsdelivr.net/npm/fuse.js@7.5.0/dist/fuse.mjs';

const FUSE_OPTIONS = {
  includeScore: true,
  threshold: 0.34,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: 'name', weight: 0.26 },
    { name: 'alt_name', weight: 0.16 },
    { name: 'expertise', weight: 0.24 },
    { name: 'courses', weight: 0.14 },
    { name: 'affiliation', weight: 0.1 },
    { name: 'domain_labels', weight: 0.06 },
    { name: 'college_label', weight: 0.04 }
  ]
};

const SEARCH_DEBOUNCE_MS = 250;

/* -------------------------------------------------------------------------
   Localisation — every visible string of the directory lives here. The data
   keys (college / rank / domain) are language-neutral and are also the URL
   values, so a link works across both editions.
   ------------------------------------------------------------------------- */

const I18N = {
  zh: {
    searchLabel: '搜尋教師、研究專長或 AI 課程',
    searchPlaceholder: '例如：AI、法律、金融科技 …',
    collegeLabel: '學院',
    collegeAll: '所有學院',
    rankLabel: '職稱',
    rankAll: '所有職稱',
    domainLabel: '跨領域 AI 研究領域',
    domainAll: '全部領域',
    modeLabel: '多選領域時',
    modeAny: '符合任一',
    modeAll: '同時符合',
    crossOnly: '只看跨領域教師（2 個以上領域）',
    clear: '清除條件',
    countAll: n => `共 ${n} 位 AI 教師`,
    countFiltered: n => `符合條件：${n} 位教師`,
    loading: '教師資料載入中…',
    error: '目前無法載入教師資料，請稍後再試。',
    emptyTitle: '找不到符合條件的教師。',
    emptyHint: '請嘗試其他關鍵字，或清除篩選條件後重新瀏覽。',
    expertise: '研究專長',
    courses: '開設 AI 課程',
    domains: '研究領域',
    email: 'Email：',
    web: '個人網頁：',
    filterByDomain: name => `以研究領域篩選：${name}`,
    filterByCollege: name => `以學院篩選：${name}`
  },
  en: {
    searchLabel: 'Search faculty, expertise or AI courses',
    searchPlaceholder: 'e.g. AI, law, fintech …',
    collegeLabel: 'College',
    collegeAll: 'All colleges',
    rankLabel: 'Rank',
    rankAll: 'All ranks',
    domainLabel: 'Cross-disciplinary AI domains',
    domainAll: 'All domains',
    modeLabel: 'With several domains',
    modeAny: 'Match any',
    modeAll: 'Match all',
    crossOnly: 'Cross-domain faculty only (2+ domains)',
    clear: 'Clear filters',
    countAll: n => `${n} AI faculty members`,
    countFiltered: n => `${n} faculty match`,
    loading: 'Loading faculty…',
    error: 'The faculty data cannot be loaded right now. Please try again later.',
    emptyTitle: 'No faculty match these filters.',
    emptyHint: 'Try another keyword, or clear the filters and browse the full list.',
    expertise: 'Expertise',
    courses: 'AI courses taught',
    domains: 'Research domains',
    email: 'Email: ',
    web: 'Web: ',
    filterByDomain: name => `Filter by research domain: ${name}`,
    filterByCollege: name => `Filter by college: ${name}`
  }
};

function lang() {
  const value = (document.documentElement.lang || '').toLowerCase();
  return /^zh/.test(value) || !value ? 'zh' : 'en';
}

function strings() {
  return I18N[lang()];
}

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */

const root = document.querySelector('[data-faculty]');
if (root) init(root);

async function init(container) {
  const dom = {
    container,
    results: container.querySelector('[data-faculty-results]'),
    count: container.querySelector('[data-faculty-count]'),
    search: container.querySelector('[data-faculty-search]'),
    chips: {
      domain: container.querySelector('[data-faculty-chips="domain"]'),
      college: container.querySelector('[data-faculty-chips="college"]'),
      rank: container.querySelector('[data-faculty-chips="rank"]')
    },
    mode: container.querySelector('[data-faculty-mode]'),
    cross: container.querySelector('[data-faculty-cross]'),
    clear: container.querySelector('[data-faculty-clear]')
  };

  const s = strings();
  let data;
  try {
    data = await loadFaculty(container.dataset.facultySrc);
  } catch (err) {
    renderMessage(dom.results, err.message || s.error, 'faculty-message--error');
    if (dom.count) dom.count.textContent = '';
    return;
  }

  const people = data.faculty.map(person => view(person, data));
  Object.entries(dom.chips).forEach(([kind, group]) => buildChips(group, kind, data));
  labelControls(dom, s);

  const search = await createSearcher(people, data);

  const render = () => {
    const state = readState(data);
    syncControls(dom, state);
    const matches = applyFilters(people, state, search);
    renderCount(dom.count, matches.length, state);
    renderResults(dom.results, matches);
  };

  bindControls(dom, render);
  window.addEventListener('popstate', render);
  render();
}

/* -------------------------------------------------------------------------
   Data
   ------------------------------------------------------------------------- */

async function loadFaculty(url) {
  let payload;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (err) {
    console.error('[faculty] failed to load', url, err);
    throw new Error(strings().error);
  }
  if (!payload || !Array.isArray(payload.faculty)) {
    console.error('[faculty] unexpected payload shape', payload);
    throw new Error(strings().error);
  }
  return payload;
}

/** Flattens one person into the current language — the shape Fuse indexes. */
function view(person, data) {
  const code = lang();
  const local = person[code] || person.zh;
  const domains = person.domains
    .map(key => data.domains.find(d => d.key === key))
    .filter(Boolean);
  const college = data.colleges.find(c => c.key === person.college);
  return {
    id: person.id,
    college: person.college,
    college_label: college ? college[code] : '',
    rank: person.rank,
    photo: person.photo,
    initials: person.initials,
    email: person.email,
    web: person.web,
    domain_keys: person.domains,
    domain_labels: domains.map(d => d[code]),
    domains,
    name: local.name,
    alt_name: local.alt_name,
    alt_lang: code === 'zh' ? 'en' : 'zh-Hant',
    role: local.role,
    affiliation: local.affiliation,
    expertise: local.expertise || [],
    courses: local.courses || ''
  };
}

/* -------------------------------------------------------------------------
   URL state
   ------------------------------------------------------------------------- */

const EMPTY_STATE = { q: '', college: '', rank: '', domain: '', mode: '', cross: '' };

function readState(data) {
  const params = new URLSearchParams(location.search);
  const domainKeys = data.domains.map(d => d.key);
  const domains = (params.get('domain') || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => domainKeys.includes(value));
  return {
    q: (params.get('q') || '').trim(),
    college: keyIn(params.get('college'), data.colleges),
    rank: keyIn(params.get('rank'), data.ranks),
    domains: [...new Set(domains)],
    mode: params.get('mode') === 'all' ? 'all' : 'any',
    cross: params.get('cross') === '1'
  };
}

function keyIn(value, list) {
  return value && list.some(entry => entry.key === value) ? value : '';
}

function writeState(patch) {
  const params = new URLSearchParams(location.search);
  Object.entries(patch).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });
  const query = params.toString();
  const url = `${location.pathname}${query ? '?' + query : ''}${location.hash}`;
  if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
}

function isEmptyState(state) {
  return !state.q && !state.college && !state.rank && !state.domains.length && !state.cross;
}

/* -------------------------------------------------------------------------
   Controls
   ------------------------------------------------------------------------- */

/* Every filter is a row of chips: research domain, college and rank all read
   the same way and are one click apart. They are built here rather than in the
   HTML so both language editions take their labels from the one JSON file.
   Real <button>s: keyboard and screen-reader support come for free, and
   aria-pressed carries the selected state.

   Domains multi-select (several can be combined); college and rank are
   single-select, where clicking the active chip clears it, same as its "all"
   chip. Counts are of the whole roster, so a chip always says how much is
   behind it. */
const CHIP_GROUPS = {
  domain: {
    list: data => data.domains,
    label: s => s.domainLabel,
    all: s => s.domainAll,
    count: (person, key) => person.domains.includes(key)
  },
  college: {
    list: data => data.colleges,
    label: s => s.collegeLabel,
    all: s => s.collegeAll,
    count: (person, key) => person.college === key
  },
  rank: {
    list: data => data.ranks,
    label: s => s.rankLabel,
    all: s => s.rankAll,
    count: (person, key) => person.rank === key
  }
};

function buildChips(group, kind, data) {
  if (!group) return;
  const spec = CHIP_GROUPS[kind];
  const s = strings();
  const code = lang();
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', spec.label(s));
  const entries = [{ key: '', label: spec.all(s) }].concat(
    spec.list(data).map(entry => ({ key: entry.key, label: entry[code] }))
  );
  entries.forEach(({ key, label }) => {
    const chip = el('button', 'faculty-chip', label);
    chip.type = 'button';
    chip.dataset.chipKey = key;
    chip.setAttribute('aria-pressed', 'false');
    const count = data.faculty.filter(person => !key || spec.count(person, key)).length;
    chip.append(el('span', 'faculty-chip__count', count));
    group.append(chip);
  });
}

/** Labels that the HTML leaves empty, so no string is duplicated per edition. */
function labelControls(dom, s) {
  setText(dom.container.querySelector('[data-faculty-label="search"]'), s.searchLabel);
  setText(dom.container.querySelector('[data-faculty-label="college"]'), s.collegeLabel);
  setText(dom.container.querySelector('[data-faculty-label="rank"]'), s.rankLabel);
  setText(dom.container.querySelector('[data-faculty-label="domain"]'), s.domainLabel);
  setText(dom.container.querySelector('[data-faculty-label="mode"]'), s.modeLabel);
  setText(dom.container.querySelector('[data-faculty-label="cross"]'), s.crossOnly);
  setText(dom.clear, s.clear);
  if (dom.search) {
    dom.search.placeholder = s.searchPlaceholder;
    dom.search.setAttribute('aria-label', s.searchLabel);
  }
  if (dom.mode) {
    setText(dom.mode.querySelector('[data-faculty-mode-value="any"]'), s.modeAny);
    setText(dom.mode.querySelector('[data-faculty-mode-value="all"]'), s.modeAll);
  }
}

function setText(node, text) {
  if (node) node.textContent = text;
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
  Object.entries(dom.chips).forEach(([kind, group]) => {
    if (!group) return;
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.faculty-chip');
      if (!chip || !group.contains(chip)) return;
      const key = chip.dataset.chipKey;
      writeState(kind === 'domain'
        ? { domain: nextDomains(key).join(',') }
        : { [kind]: key === currentValue(kind) ? '' : key });
      render();
    });
  });
  if (dom.mode) {
    dom.mode.addEventListener('click', (e) => {
      const button = e.target.closest('[data-faculty-mode-value]');
      if (!button || !dom.mode.contains(button)) return;
      const value = button.dataset.facultyModeValue;
      writeState({ mode: value === 'all' ? 'all' : '' });
      render();
    });
  }
  if (dom.cross) {
    dom.cross.addEventListener('change', () => {
      writeState({ cross: dom.cross.checked ? '1' : '' });
      render();
    });
  }
  if (dom.clear) {
    dom.clear.addEventListener('click', () => {
      if (dom.search) dom.search.value = '';
      writeState(EMPTY_STATE);
      render();
    });
  }
  // Cards carry their own college and domain chips; clicking one filters by it,
  // and clicking the one already selected clears it again.
  if (dom.results) {
    dom.results.addEventListener('click', (e) => {
      const tag = e.target.closest('[data-domain-filter], [data-college-filter]');
      if (!tag || !dom.results.contains(tag)) return;
      if (tag.dataset.collegeFilter) {
        const college = tag.dataset.collegeFilter;
        writeState({ college: college === currentValue('college') ? '' : college });
      } else {
        writeState({ domain: nextDomains(tag.dataset.domainFilter).join(',') });
      }
      render();
      dom.container.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
}

/** Toggles one domain in the current selection; the "all" chip clears it. */
function nextDomains(key) {
  const current = (new URLSearchParams(location.search).get('domain') || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  if (!key) return [];
  return current.includes(key) ? current.filter(v => v !== key) : current.concat(key);
}

/** The value a single-select filter currently holds, straight from the URL. */
function currentValue(kind) {
  return new URLSearchParams(location.search).get(kind) || '';
}

function syncControls(dom, state) {
  if (dom.search && dom.search.value.trim() !== state.q) dom.search.value = state.q;
  Object.entries(dom.chips).forEach(([kind, group]) => {
    if (!group) return;
    const selected = kind === 'domain' ? state.domains : [state[kind]].filter(Boolean);
    group.querySelectorAll('.faculty-chip').forEach(chip => {
      const key = chip.dataset.chipKey;
      const active = key ? selected.includes(key) : !selected.length;
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      chip.classList.toggle('is-active', active);
    });
  });
  if (dom.mode) {
    dom.mode.hidden = state.domains.length < 2;
    dom.mode.querySelectorAll('[data-faculty-mode-value]').forEach(button => {
      const active = button.dataset.facultyModeValue === state.mode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }
  if (dom.cross) dom.cross.checked = state.cross;
  if (dom.clear) dom.clear.hidden = isEmptyState(state);
}

/* -------------------------------------------------------------------------
   Search & filters
   ------------------------------------------------------------------------- */

/* Every person here is an AI faculty member, so "AI" on its own says nothing
   about who to keep. It is treated as matching everyone, which is what makes
   "AI 社會" or "AI public affairs" read as "the AI faculty of that college". */
const UNIVERSAL_TERMS = ['ai', 'a.i.', '人工智慧', '人工智能', 'artificial intelligence'];

/* Belonging to a matched college or domain counts, but ranks below a profile
   that says the word itself. Kept under Fuse's own 0…1 scores. */
const VOCABULARY_SCORE = 0.5;

async function createSearcher(people, data) {
  const index = people.map(person => ({ id: person.id, text: searchableText(person) }));
  let fuzzy = null;
  try {
    const { default: Fuse } = await import(FUSE_URL);
    const fuse = new Fuse(people, FUSE_OPTIONS);
    fuzzy = (term) => fuse.search(term);
  } catch (err) {
    // The directory stays usable (exact matching only) if the CDN is unreachable.
    console.error('[faculty] Fuse.js unavailable, falling back to substring search', err);
  }
  return (query) => searchAllTerms(terms(query), people, (term) => matchTerm(term, people, index, data, fuzzy));
}

/* Splits the query the way a person reads it. Chinese is typed with 、and ，
   far more often than with a space, so every common list separator counts, not
   just whitespace. Hyphens are left alone: "Human-centered AI" is two terms,
   not three. */
const TERM_SEPARATORS = /[\s、，,；;。：:／/|｜＋+]+/;

function terms(query) {
  return query.split(TERM_SEPARATORS).filter(Boolean);
}

/**
 * Who matches one term, as a Map of id → score (lower is better).
 * `null` means "everyone", so the term adds no constraint.
 *
 * A term can name a **college or a research domain** (by label or by one of the
 * aliases in faculty.json), and that reading is kept alongside the text match
 * rather than replacing it: "社會" finds the whole 社會科學學院 *and* everyone
 * whose expertise mentions 社會. Fuzzy matching only steps in when a term finds
 * nothing exactly, so a precise term like 商學院 returns the 16 people of that
 * college instead of the loose bitap noise a short CJK pattern produces.
 */
function matchTerm(term, people, index, data, fuzzy) {
  const needle = term.toLowerCase();
  if (UNIVERSAL_TERMS.includes(needle)) return null;

  const hits = new Map();
  const colleges = vocabularyKeys(data.colleges, needle);
  const domains = vocabularyKeys(data.domains, needle);
  people.forEach(person => {
    if (colleges.has(person.college) || person.domain_keys.some(key => domains.has(key))) {
      hits.set(person.id, VOCABULARY_SCORE);
    }
  });

  // Written after the vocabulary pass so that someone whose own profile says
  // 深度學習 outranks the rest of the 人工智慧與機器學習 domain.
  index.forEach(entry => {
    if (matchesText(entry.text, needle)) hits.set(entry.id, 0);
  });

  if (!hits.size && fuzzy) {
    fuzzy(term).forEach(hit => hits.set(hit.item.id, hit.score || 0));
  }
  return hits;
}

/** Vocabulary entries whose label (either language) or alias contains the term. */
function vocabularyKeys(list, needle) {
  const keys = new Set();
  list.forEach(entry => {
    const names = [entry.zh, entry.en].concat(entry.aliases || []);
    if (names.some(name => name && name.toLowerCase().includes(needle))) keys.add(entry.key);
  });
  return keys;
}

/* Latin terms match on word boundaries; without that, "ai" would hit every
   English record through "Taipei". CJK has no such boundaries, and no such
   problem — a substring is the right test there. */
function matchesText(text, needle) {
  if (!/^[\x00-\x7F]+$/.test(needle)) return text.includes(needle);
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
}

/**
 * Fuse matches its query as one pattern, so "人工智慧 金融" would be looked for
 * as that whole seven-character string and find nobody. A person typing two
 * terms means "both", so each term is matched on its own and only the people
 * matching **every** term are kept, ranked by their combined score (0 for an
 * exact or vocabulary match, the Fuse score for a fuzzy one).
 */
function searchAllTerms(list, people, matchOne) {
  if (!list.length) return [];
  let survivors = people.map(item => ({ item, score: 0 }));
  for (const term of list) {
    const hits = matchOne(term);
    if (hits === null) continue; // a term that says nothing narrows nothing
    survivors = survivors
      .filter(entry => hits.has(entry.item.id))
      .map(entry => ({ item: entry.item, score: entry.score + hits.get(entry.item.id) }));
    if (!survivors.length) return [];
  }
  return survivors.sort((a, b) => a.score - b.score).map(entry => entry.item);
}

/* What the person's own profile says. College and domain labels are left out
   on purpose: they are matched as vocabulary instead, which keeps "金融科技"
   ranking the professor who lists it above the rest of that domain. */
function searchableText(person) {
  return [person.name, person.alt_name, person.affiliation, person.courses]
    .concat(person.expertise)
    .filter(Boolean).join(' ').toLowerCase();
}

function applyFilters(people, state, search) {
  const base = state.q ? search(state.q) : people;
  return base.filter(person => {
    if (state.college && person.college !== state.college) return false;
    if (state.rank && person.rank !== state.rank) return false;
    if (state.cross && person.domain_keys.length < 2) return false;
    if (state.domains.length) {
      const hits = state.domains.filter(key => person.domain_keys.includes(key));
      if (state.mode === 'all' ? hits.length !== state.domains.length : !hits.length) return false;
    }
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

function renderResults(node, people) {
  if (!node) return;
  clear(node);
  if (!people.length) {
    const s = strings();
    const empty = el('div', 'faculty-empty');
    empty.append(
      el('p', 'faculty-empty__title', s.emptyTitle),
      el('p', 'faculty-empty__hint', s.emptyHint)
    );
    node.append(empty);
    return;
  }
  people.forEach((person, i) => node.append(card(person, i)));
}

/* Same card anatomy as the rest of the members page: portrait, rank, name,
   affiliation, expertise, AI courses, contact. The research-domain chips are
   the one addition — they are buttons, so a card is also a way to filter. */
function card(person, index) {
  const accent = ['', ' a2', ' a3', ' a4'][index % 4];
  const article = el('article', `member-card card-accent${accent} faculty-card`);

  if (person.photo) {
    const img = el('img', 'member-photo');
    img.src = photoSrc(person.photo);
    img.alt = person.name;
    img.width = 118;
    img.height = 118;
    img.loading = 'lazy';
    img.decoding = 'async';
    article.append(img);
  } else {
    const avatar = el('span', 'member-avatar', person.initials || initialsOf(person.name));
    avatar.setAttribute('aria-hidden', 'true');
    article.append(avatar);
  }

  const s = strings();
  const body = el('div', 'member-body');

  /* Rank chip + college. The card already names the department; the college is
     what places that department in the university, and it filters on click. */
  const labels = el('div', 'faculty-card__labels');
  labels.append(el('span', 'member-role', person.role));
  if (person.college_label) {
    const college = el('button', 'faculty-college', person.college_label);
    college.type = 'button';
    college.dataset.collegeFilter = person.college;
    college.setAttribute('aria-label', s.filterByCollege(person.college_label));
    labels.append(college);
  }
  body.append(labels);

  const heading = el('h4', 'member-name', person.name);
  if (person.alt_name) {
    const alt = el('span', 'latin', person.alt_name);
    alt.lang = person.alt_lang;
    heading.append(alt);
  }
  body.append(heading, el('p', 'member-affil', person.affiliation));

  if (person.expertise.length) {
    const areas = el('div', 'member-areas');
    areas.append(el('strong', null, s.expertise));
    const list = el('ul', 'member-tags');
    person.expertise.forEach(item => list.append(el('li', null, item)));
    areas.append(list);
    body.append(areas);
  }

  if (person.domains.length) {
    const code = lang();
    const areas = el('div', 'member-areas');
    areas.append(el('strong', null, s.domains));
    const list = el('ul', 'faculty-domains');
    person.domains.forEach(domain => {
      const item = el('li');
      const button = el('button', 'faculty-domain', domain[code]);
      button.type = 'button';
      button.dataset.domainFilter = domain.key;
      button.setAttribute('aria-label', s.filterByDomain(domain[code]));
      item.append(button);
      list.append(item);
    });
    areas.append(list);
    body.append(areas);
  }

  if (person.courses) {
    const facts = el('div', 'member-facts');
    const row = el('div');
    row.append(el('strong', null, s.courses), document.createTextNode(person.courses));
    facts.append(row);
    body.append(facts);
  }

  const meta = el('ul', 'member-meta');
  if (person.email) meta.append(metaRow(s.email, `mailto:${person.email}`, person.email, false));
  if (person.web) meta.append(metaRow(s.web, person.web, prettyUrl(person.web), true));
  if (meta.childNodes.length) body.append(meta);

  article.append(body);
  return article;
}

function metaRow(label, href, text, external) {
  const li = el('li');
  li.append(el('strong', null, label));
  const link = el('a', null, text);
  link.href = href;
  if (external) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  li.append(link);
  return li;
}

/* The zh edition lives one directory down, so the repo-root paths in the JSON
   need the `../` prefix there. */
function photoSrc(path) {
  return /\/zh\//.test(location.pathname) ? `../${path}` : path;
}

function prettyUrl(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function initialsOf(name) {
  return name.replace(/[^\p{L}\p{N} -]/gu, '').split(/[\s-]+/).filter(Boolean)
    .slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

/* -------------------------------------------------------------------------
   Small DOM helpers (textContent only — never innerHTML with data)
   ------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== '') node.textContent = String(text);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderMessage(container, message, modifier = '') {
  if (!container) return;
  clear(container);
  container.append(el('p', `faculty-message${modifier ? ' ' + modifier : ''}`, message));
}
