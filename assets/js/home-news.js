/* ==========================================================================
   NTPU AI4X | Home page — 最新消息與活動 / News & Events
   Shows the few items that matter today (see getHomepageNews in news-core.js),
   scan-friendly rather than complete: the full browse experience lives on
   news.html. No search here, so Fuse.js is deliberately not loaded.
   ========================================================================== */
import {
  loadNews, getHomepageNews, HOME_NEWS_LIMIT, displayStatus, primaryDate,
  categoryLabel, sourceLabel, isExternal, detailHref, timeEl,
  el, clear, renderMessage, strings
} from './news-core.js';

const container = document.querySelector('[data-news-home]');
if (container) init(container);

async function init(root) {
  const src = root.dataset.newsSrc;
  const detailBase = root.dataset.newsDetail || 'news-detail.html';
  const limit = Number(root.dataset.newsLimit) || HOME_NEWS_LIMIT;
  try {
    const items = await loadNews(src);
    const featured = getHomepageNews(items, { limit });
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

/* Visual order matches the reading order we want: what it is → what it is
   called → what it is about → when it happens. */
function card(item, detailBase) {
  const article = el('article', 'news-item');

  const tags = el('div', 'news-item__tags');
  tags.append(el('span', 'status-tag st-soon', categoryLabel(item)));
  if (isExternal(item)) tags.append(el('span', 'news-badge news-badge--external', sourceLabel(item)));
  const st = displayStatus(item);
  if (st) tags.append(el('span', `news-status news-status--${st.key}`, st.label));
  article.append(tags);

  const h3 = el('h3');
  const link = el('a', null, item.title);
  link.href = detailHref(item, detailBase);
  h3.append(link);
  article.append(h3, el('p', 'news-item__summary', item.summary));

  const date = primaryDate(item);
  if (date) article.append(timeEl(date.value, `news-date news-date--${date.key}`, date.label));

  return article;
}
