# Rules for parallel agents (temporary file — removed after integration)

You are one of ~6 agents building "SherlockOS", a macOS-style desktop portfolio website for
Athul Prakash NJ (alias psychoSherlock — security researcher / CTF player / Linux geek; GitHub
`psychoSherlock`, site https://psychosherlock.github.io). Project root:
`/home/psychosherlock/Desktop/projects/os_like_portfolio/portfolio`.

1. FIRST read `docs/ARCHITECTURE.md`, then the core sources you depend on in `src/os/` (they are short).
2. You own ONLY the files/folders listed in your task. Never edit anything else — especially
   `src/os/*.js|jsx|css` core files, `src/os/apps.js`, `package.json`, or another agent's folder.
   Other agents are editing their own files in this same working tree right now.
   If you truly need a core change, do NOT make it: put it in your final report under "CORE REQUEST"
   with the exact diff you want. Work around it meanwhile.
3. No new npm dependencies. Available: react 19, react-dom, framer-motion 12, zustand 5, react-icons 5,
   react-pdf 10, marked, dompurify, highlight.js, sharp (dev, for scripts). No CDN scripts.
4. Shell: `npm` is aliased to pnpm here — always use `command npm` / `command npx`.
   Do NOT run git commands that write (no add/commit/checkout/stash/reset). Do NOT start a dev server
   and do NOT use Playwright/browser tools (the orchestrator does browser QA centrally).
5. Verify your work with:
   `command npx eslint <your files>` and
   `command npx vite build --outDir /tmp/claude-1000/-home-psychosherlock-Desktop-projects-os-like-portfolio/80b58074-573d-4a4d-bea3-ff9c99b841e3/scratchpad/build-<yourname> --emptyOutDir`
   Build errors that come from files you don't own are another agent mid-edit: ignore them (retry later).
   Since you can't see the UI, re-read your JSX/CSS carefully for layout bugs before finishing.
6. Quality bar: this must feel like real macOS — polished, dense, precise. Smooth 60fps (animate only
   transform/opacity; no layout thrash; memoize lists; lazy-load images with loading="lazy" decoding="async").
   Works in dark AND light theme (CSS variables only). Adapts from ~360px to 1600px window widths
   (use container queries on your app root: `container-type: inline-size`). Keyboard accessible.
   Real content only — no lorem ipsum, no "coming soon", no TODO stubs, no invented facts about Athul.
   No console errors/warnings. No emoji as icons (use react-icons).
7. Final report (keep it under 250 words): what you built, files created, CORE REQUESTs, known gaps.

8. A previous agent may already have written PART of your files before being interrupted. Read what
   exists in your owned folders first, keep what is good, finish or rewrite the rest. Placeholder
   `index.jsx` files ("coming soon") must be replaced.
