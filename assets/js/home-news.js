/* ==========================================================================
   NTPU AI4X | Home page — 最新公告
   Renders the featured items of the shared news file. No search on the home
   page, so Fuse.js is deliberately not loaded here.
   ========================================================================== */
import {
  loadNews, getEventStatus, categoryLabel, sourceLabel, isExternal,
  detailHref, formatDate, el, clear, renderMessage, strings
} from './news-core.js';

const MAX_ITEMS = 5;

const container = document.querySelector('[data-news-home]');
if (container) init(container);

async function init(root) {
  const src = root.dataset.newsSrc;
  const detailBase = root.dataset.newsDetail || 'news-detail.html';
  try {
    const items = await loadNews(src);
    const featured = items.filter(item => item.featured === true).slice(0, MAX_ITEMS);
    if (!featured.length) {
      renderMessage(root, strings().noFeatured);
      return;
    }
    clear(root);
    featured.forEach(item => root.append(card(item, detailBase)));
  } catch (err) {
    renderMessage(root, err.message || strings().error, 'news-message--error');
  }
}

function card(item, detailBase) {
  const article = el('article', 'news-item');
  article.append(el('span', 'news-date', formatDate(item.publish_date)));

  const body = el('div');
  const tags = el('div', 'news-card__tags');
  tags.append(el('span', 'status-tag st-soon', categoryLabel(item)));
  if (isExternal(item)) tags.append(el('span', 'news-badge news-badge--external', sourceLabel(item)));
  const st = getEventStatus(item);
  tags.append(el('span', `news-status news-status--${st.key}`, st.label));
  body.append(tags);

  const h3 = el('h3');
  const link = el('a', null, item.title);
  link.href = detailHref(item, detailBase);
  h3.append(link);
  body.append(h3, el('p', null, item.summary));

  article.append(body);
  return article;
}
