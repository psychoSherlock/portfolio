# SherlockOS — psychoSherlock's portfolio

A macOS-style desktop that boots in the browser: GRUB menu → splash → desktop.
Live: https://psychosherlock.github.io

## Develop

```sh
npm install
npm run dev        # regenerates the virtual filesystem, starts Vite on :5173
npm run build      # production build into dist/
npm run deploy:live  # build + publish dist/ to psychosherlock.github.io (branch os-live)
```

Add files to the OS by dropping them into `src/assets/Documents`, `src/assets/images/{Wallpappers,personal,achievements}`
or `src/content/home/**` (text/markdown), then run `npm run generate-fs`.
After adding images, run `node scripts/optimizeImages.mjs` to create thumbnails (and `--resize-originals` to shrink big photos).

## Apps

Finder, Terminal (zsh-like shell over the virtual filesystem), Safari (tabs, Google search, native GitHub pages),
About Me, Projects, Photos, Preview, TextEdit, Notes, Contact, Music (SomaFM radio), Calculator, System Settings.
Shell: menu bar, dock, Spotlight (Ctrl/Cmd+K), Launchpad (F4), Mission Control (F3), Control Center,
Notification Center, lock screen (Alt+L), window snapping, desktop icons.

See `docs/ARCHITECTURE.md` for how the window manager, filesystem and apps fit together.
