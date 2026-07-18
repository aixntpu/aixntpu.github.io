# NTPU AI4X: Advanced Research Center for Cross-Disciplinary AI

Bilingual (English / 繁體中文) static website for the **跨域人工智慧前瞻研究中心
（AI4X Research Center）** at National Taipei University, officially operational
from **August 1, 2026 (2026 年 8 月 1 日正式營運)**. Pure HTML / CSS / JS, no build
step, ready for GitHub Pages.

## Structure

```
site/
├── index.html            # English homepage (launch info, news, first-wave work,
│                         #   research themes, targets 2029–2031, prep progress)
├── objectives.html       # 成立目的  Establishment Objectives
├── positioning.html      # 中心定位  Center Positioning
├── organization.html     # 組織架構  Organization + current leadership & contacts
├── services.html         # 業務範圍  Scope of Service (with per-service status)
├── facilities.html       # 運作空間  Operating Space & Facilities
├── roadmap.html          # 財務規劃 + 預期成果 + 配合措施
├── news.html             # 消息與活動  News & Events (launch announcements)
├── contact.html          # 合作聯絡  Contact & Collaboration (windows, inquiry types)
├── zh/                   # 繁體中文 mirror of every page
│   ├── index.html  objectives.html  positioning.html  organization.html
│   ├── services.html  facilities.html  roadmap.html  news.html  contact.html
├── assets/
│   ├── styles.css        # shared design system
│   ├── main.js           # nav, scroll-reveal, animated counters
│   ├── launch-cover.png  # 1200×630 Open Graph share image
│   └── logo.svg          # AI4X mark / favicon
└── .nojekyll             # serve folders as-is on GitHub Pages
```

- **SEO / sharing:** every page carries canonical + `hreflang` (`en`,
  `zh-Hant-TW`, `x-default`) links and Open Graph tags with the launch cover
  image. URLs currently point at `https://aixntpu.github.io/`; update them
  site-wide if the official `ai4x.ntpu.edu.tw` domain is bound later.
- **Status labels:** first-wave work, services, and preparation progress use
  status tags (已完成 / 啟動中 / 預計時程 / 規劃中); update these as items launch.
- **Last updated:** each footer shows a "Last updated" date; bump it when
  content changes.

- **Language switch:** the `EN / 中文` button in the nav links each page to its
  counterpart. English lives at the root; Chinese under `zh/`.
- Responsive, accessible (skip link, ARIA nav, focus styles), and honors
  `prefers-reduced-motion`.

## Local preview

```bash
cd site
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a repo, e.g. `NTPUAI4X` (or `<user>.github.io` for the root site).
2. Put the **contents of `site/`** at the repository root (so `index.html` is at
   the top level), then push.
3. In **Settings → Pages**, set **Source = Deploy from a branch**, branch
   `main`, folder `/ (root)`. Save.
4. The site goes live at `https://<user>.github.io/NTPUAI4X/`
   (or `https://<user>.github.io/` for a user/org site).

All links are relative, so the site works both at a repo subpath and at a domain root.
