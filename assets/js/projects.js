/* ==========================================================================
   NTPU AI4X | Industry Collaboration / 產學合作
   Renders the summary figures and project cards from the JSON file named in
   `data-collab-src`. Strings follow <html lang>. Status is computed from the
   start / end dates, so nothing needs editing when a project begins or ends.
   Per-project funding is shown only when an item carries `amount_ntd`.
   ========================================================================== */
const ZH = document.documentElement.lang.toLowerCase().startsWith('zh');

const S = ZH ? {
  projects: '合作計畫', partners: '合作單位', totalLabel: y => `${y} 學年度合作經費總額`,
  
  types: { industry: '企業合作', institute: '法人研究機構', government: '政府計畫' },
  status: { upcoming: '即將開始', ongoing: '進行中', completed: '已完成' },
  period: '執行期間', pi: '計畫主持人', copi: '共同主持人', amount: '計畫經費',
  months: n => `${n} 個月`, sep: '、', to: ' 至 ',
  tags: { hr: '人力資源', assessment: '智慧評量', transformation: '數位轉型', training: '教育訓練',
    esg: 'ESG 永續', materials: '循環材料', education: '課程教學', manufacturing: '智慧製造',
    agentic: 'Agentic AI', network: '開放網路' },
  error: '資料載入失敗，請稍後再試。', updated: '資料更新'
} : {
  projects: 'Projects', partners: 'Partners', totalLabel: y => `Total funding, academic year ${y}`,
  
  types: { industry: 'Industry partners', institute: 'Research institutes', government: 'Government programs' },
  status: { upcoming: 'Upcoming', ongoing: 'Ongoing', completed: 'Completed' },
  period: 'Period', pi: 'Principal investigator', copi: 'Co-investigator', amount: 'Funding',
  months: n => `${n} months`, sep: ', ', to: ' to ',
  tags: { hr: 'Human resources', assessment: 'AI assessment', transformation: 'Digital transformation',
    training: 'Training', esg: 'ESG', materials: 'Circular materials', education: 'Education',
    manufacturing: 'Smart manufacturing', agentic: 'Agentic AI', network: 'Open networks' },
  error: 'Could not load the data. Please try again later.', updated: 'Updated'
};

const STATUS_CLASS = { upcoming: 'st-soon', ongoing: 'st-active', completed: 'st-done' };
const TYPE_ORDER = ['industry', 'institute', 'government'];

const root = document.querySelector('[data-collab-src]');
if (root) init(root);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* Local-date parse: `new Date('2026-09-01')` is UTC and can land on the wrong day. */
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return ZH ? `${y} 年 ${m} 月 ${d} 日` : `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function statusOf(item, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < parseDate(item.start)) return 'upcoming';
  if (today > parseDate(item.end)) return 'completed';
  return 'ongoing';
}

function money(n) {
  return `NT$ ${n.toLocaleString('en-US')}`;
}

async function init(host) {
  try {
    const res = await fetch(host.dataset.collabSrc, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    render(host, data);
  } catch (err) {
    host.replaceChildren(el('p', 'contact-note', S.error));
  }
}

function render(host, { meta, items }) {
  const summary = document.querySelector('[data-collab-summary]');
  if (summary) {
    const partners = new Set(items.map(i => i.partner)).size;
    summary.replaceChildren(
      stat(String(items.length), S.projects),
      stat(String(partners), S.partners),
      stat(money(meta.total_ntd), S.totalLabel(meta.academic_year))
    );
  }

  const nav = document.querySelector('[data-collab-nav]');
  const navLinks = [];
  const frag = document.createDocumentFragment();
  TYPE_ORDER.forEach(type => {
    const group = items.filter(i => i.type === type);
    if (!group.length) return;
    const section = el('section', 'collab-group');
    section.id = `collab-${type}`;
    const link = el('a', 'collab-nav__link', S.types[type]);
    link.href = `#collab-${type}`;
    link.append(el('span', 'collab-nav__count', String(group.length)));
    navLinks.push(link);
    section.append(el('h2', 'collab-group__title', S.types[type]));
    const grid = el('div', 'feature-grid cols-2');
    group.forEach(i => grid.append(card(i)));
    section.append(grid);
    frag.append(section);
  });
  host.replaceChildren(frag);
  if (nav) nav.replaceChildren(...navLinks);

  const stamp = document.querySelector('[data-collab-updated]');
  if (stamp && meta.updated) stamp.textContent = `${S.updated}: ${meta.updated}`;
}

function stat(value, label) {
  const box = el('div', 'stat');
  box.append(el('span', 'n collab-n', value), el('span', 'stat-label', label));
  return box;
}

function row(label, value) {
  const wrap = el('div', 'collab-row');
  wrap.append(el('dt', null, label), el('dd', null, value));
  return wrap;
}

function card(item) {
  const st = statusOf(item);
  const art = el('article', 'feature card-accent collab-card');
  art.id = item.id;
  art.append(el('span', `status-tag ${STATUS_CLASS[st]}`, S.status[st]));
  art.append(el('p', 'collab-partner', item.partner));
  art.append(el('h3', null, item.title));

  const dl = el('dl', 'collab-meta');
  dl.append(row(S.period, `${fmtDate(item.start)}${S.to}${fmtDate(item.end)} (${S.months(item.duration_months)})`));
  dl.append(row(S.pi, item.pi));
  if (item.co_pi && item.co_pi.length) dl.append(row(S.copi, item.co_pi.join(S.sep)));
  if (typeof item.amount_ntd === 'number') dl.append(row(S.amount, money(item.amount_ntd)));
  art.append(dl);

  if (item.tags && item.tags.length) {
    const tags = el('ul', 'collab-tags');
    item.tags.forEach(t => tags.append(el('li', null, S.tags[t] || t)));
    art.append(tags);
  }
  return art;
}
