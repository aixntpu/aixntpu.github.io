/* ==========================================================================
   NTPU AI4X | Shared JS
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Navigation: mobile slide-out drawer ---- */
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  const primaryNav = document.getElementById('primary-nav');
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  const isMobile = () => mobileQuery.matches;

  if (toggle && links) {
    const navInner = toggle.closest('.nav-inner');
    // Localized labels come from the page markup so shared JS never
    // writes English text into non-English pages; <html lang> is the
    // fallback for pages missing the data attributes
    const isZh = (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0;
    const labelOpen = toggle.dataset.labelOpen || (isZh ? '開啟選單' : 'Open menu');
    const labelClose = toggle.dataset.labelClose || (isZh ? '關閉選單' : 'Close menu');
    const textOpen = toggle.dataset.textOpen || (isZh ? '選單' : 'Menu');
    const textClose = toggle.dataset.textClose || (isZh ? '關閉' : 'Close');
    const toggleText = toggle.querySelector('.nav-toggle-text');
    const hasIcon = !!toggle.querySelector('.nav-toggle-icon');

    // aria-hidden only marks the closed drawer on mobile; the desktop
    // nav must never carry it
    const syncNavHidden = () => {
      if (!primaryNav) return;
      if (isMobile() && !links.classList.contains('open')) {
        primaryNav.setAttribute('aria-hidden', 'true');
      } else {
        primaryNav.removeAttribute('aria-hidden');
      }
    };

    const setMenu = (open) => {
      links.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? labelClose : labelOpen);
      if (toggleText) {
        toggleText.textContent = open ? textClose : textOpen;
      } else if (!hasIcon) {
        toggle.textContent = open ? textClose : textOpen;
      }
      // never leave focus inside an aria-hidden drawer
      if (!open && links.contains(document.activeElement)) toggle.focus();
      syncNavHidden();
    };

    toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));

    // Close on link click (mobile)
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => { if (isMobile()) setMenu(false); });
    });

    // Close on outside click — includes taps on the drawer backdrop
    document.addEventListener('click', (e) => {
      if (!links.classList.contains('open')) return;
      if (navInner && !navInner.contains(e.target)) setMenu(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('open')) setMenu(false);
    });

    // Crossing the breakpoint: close the drawer and clear mobile-only
    // aria state in both directions. window resize doubles as a fallback
    // where the media-query change event is unreliable.
    const onViewportChange = () => {
      if (!isMobile() && links.classList.contains('open')) setMenu(false);
      else syncNavHidden();
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onViewportChange);
    window.addEventListener('resize', onViewportChange);

    syncNavHidden();
  }

  /* ---- Active nav state (by filename) ---- */
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.classList.contains('lang-switch')) return;
    const href = (a.getAttribute('href') || '').split('/').pop();
    if (href === path || (path === '' && href === 'index.html')) a.classList.add('active');
  });

  /* ---- Scroll reveal ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---- Animated stat counters ---- */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = (el) => {
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      if (reduce) { el.textContent = target + suffix; return; }
      const dur = 1200; const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { run(e.target); io2.unobserve(e.target); } });
    }, { threshold: 0.5 });
    counters.forEach(el => io2.observe(el));
  }

  /* ---- Current year in footer ---- */
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
})();
