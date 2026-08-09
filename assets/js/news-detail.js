/* ==========================================================================
   NTPU AI4X | Shared news detail page
   One HTML page renders every item: /zh/news-detail.html?id=<item id>
   ========================================================================== */
import {
  loadNews, getEventStatus, categoryLabel, sourceLabel, isExternal,
  formatDate, safeUrl, el, clear, renderMessage, externalLink, strings
} from './news-core.js';

const root = document.querySelector('[data-news-detail]');
if (root) init(root);

async function init(container) {
  const id = new URLSearchParams(location.search).get('id');
  const slug = new URLSearchParams(location.search).get('slug');

  let items;
  try {
    items = await loadNews(datasetUrl(container));
  } catch (err) {
    renderMessage(container, err.message || strings().error, 'news-message--error');
    return;
  }

  const item = items.find(entry => entry.id === id) || (slug ? items.find(entry => entry.slug === slug) : null);
  if (!item) {
    renderNotFound(container);
    return;
  }
  renderItem(container, item);
}

function datasetUrl(container) {
  const wantsDev = new URLSearchParams(location.search).get('dataset') === 'dev';
  return (wantsDev && container.dataset.newsSrcDev) || container.dataset.newsSrc;
}

/* -------------------------------------------------------------------------
   Rendering
   ------------------------------------------------------------------------- */

function renderItem(container, item) {
  const s = strings();
  clear(container);
  document.title = s.detailTitle(item.title);
  syncLanguageSwitch(item);

  const article = el('article', 'news-detail');

  const meta = el('div', 'news-detail__meta');
  meta.append(el('span', 'status-tag st-soon', categoryLabel(item)));
  meta.append(el('span', `news-badge news-badge--${item.source_type}`, sourceLabel(item)));
  const st = getEventStatus(item);
  meta.append(el('span', `news-status news-status--${st.key}`, st.label));
  article.append(meta);

  article.append(el('h1', 'news-detail__title', item.title));
  article.append(el('p', 'news-detail__summary', item.summary));

  const facts = factList(item);
  if (facts) article.append(facts);

  const body = contentBlock(item);
  if (body) article.append(body);

  const tags = tagList(item);
  if (tags) article.append(tags);

  const source = sourceBlock(item);
  if (source) article.append(source);

  if (isExternal(item)) article.append(disclaimer());

  const back = el('p', 'news-detail__back');
  const link = el('a', null, s.back);
  link.href = 'news.html';
  back.append(link);
  article.append(back);

  container.append(article);
}

function factList(item) {
  const { facts } = strings();
  const rows = [
    [facts.publish_date, formatDate(item.publish_date)],
    [facts.event_date, formatDate(item.event_date)],
    [facts.deadline, formatDate(item.deadline)],
    [facts.location, item.location],
    [facts.eligibility, item.eligibility],
    [facts.organizers, joinList(item.organizers)]
  ].filter(([, value]) => !!value);
  if (!rows.length) return null;

  const dl = el('dl', 'news-detail__facts');
  rows.forEach(([label, value]) => {
    dl.append(el('dt', null, label), el('dd', null, value));
  });
  return dl;
}

function joinList(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(strings().listSeparator) : '';
}

function contentBlock(item) {
  const paragraphs = Array.isArray(item.content) ? item.content.filter(Boolean) : [];
  if (!paragraphs.length) return null;
  const section = el('div', 'news-detail__content');
  paragraphs.forEach(text => section.append(el('p', null, text)));
  return section;
}

function tagList(item) {
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  if (!tags.length) return null;
  const wrapper = el('div', 'news-detail__tags');
  wrapper.append(el('h2', 'news-detail__subhead', strings().keywords));
  const ul = el('ul', 'news-tags');
  tags.forEach(tag => ul.append(el('li', 'news-tag', tag)));
  wrapper.append(ul);
  return wrapper;
}

function sourceBlock(item) {
  const href = safeUrl(item.external_url);
  if (!href) return null;
  const s = strings();
  const section = el('section', 'news-detail__source');
  section.append(el('h2', 'news-detail__subhead', isExternal(item) ? s.sourceHead : s.relatedHead));
  const p = el('p');
  p.append(externalLink(href, item.source_name || href));
  section.append(p);
  return section;
}

function disclaimer() {
  const s = strings();
  const box = el('aside', 'news-disclaimer');
  box.setAttribute('aria-label', s.disclaimerTitle);
  box.append(
    el('h2', 'news-disclaimer__title', s.disclaimerTitle),
    el('p', 'news-disclaimer__body', s.disclaimerBody)
  );
  return box;
}

/** Keeps the EN / 中文 switch on the same item instead of the list page. */
function syncLanguageSwitch(item) {
  const link = document.querySelector('.nav-links .lang-switch');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (!href.endsWith('news.html')) return;
  link.setAttribute('href', href.replace(/news\.html$/, `news-detail.html?id=${encodeURIComponent(item.id)}`));
}

function renderNotFound(container) {
  const s = strings();
  clear(container);
  document.title = s.missingDocTitle;
  const box = el('div', 'news-detail news-detail--missing');
  box.append(
    el('h1', 'news-detail__title', s.missingTitle),
    el('p', 'news-detail__summary', s.missingBody)
  );
  const p = el('p', 'news-detail__back');
  const link = el('a', null, s.back);
  link.href = 'news.html';
  p.append(link);
  box.append(p);
  container.append(box);
}
