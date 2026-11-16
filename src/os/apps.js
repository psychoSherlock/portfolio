// App registry. Every app lives in src/apps/<id>/index.jsx (default export = component).
// Components receive: { windowId, ...props } where props are whatever was passed to wm.open().
import { lazy } from "react";

import finderIcon from "../assets/images/icons/finder.png";
import safariIcon from "../assets/images/icons/safari.png";
import photosIcon from "../assets/images/icons/photos.png";
import notesIcon from "../assets/images/icons/notes.png";
import musicIcon from "../assets/images/icons/music.png";
import launchpadIcon from "../assets/images/icons/launchpad.png";
import trashIcon from "../assets/images/icons/trash.png";
import terminalIcon from "../apps/terminal/icon.svg";
import previewIcon from "../apps/preview/icon.svg";
import texteditIcon from "../apps/textedit/icon.svg";
import settingsIcon from "../apps/settings/icon.svg";
import aboutIcon from "../apps/about/icon.svg";
import projectsIcon from "../apps/projects/icon.svg";
import mailIcon from "../apps/mail/icon.svg";
import calculatorIcon from "../apps/calculator/icon.svg";

export const SYSTEM_ICONS = { launchpad: launchpadIcon, trash: trashIcon };

/**
 * chrome:
 *  - "default": the window draws a title bar (traffic lights + centered title).
 *  - "unified": no title bar; traffic lights float at the top-left over the app.
 *      The app must render its own toolbar, leave ~78px free on the toolbar's left
 *      (class "os-toolbar" does this), and mark draggable regions with data-window-drag.
 */
export const APPS = [
  {
    id: "finder",
    name: "Finder",
    icon: finderIcon,
    component: lazy(() => import("../apps/finder/index.jsx")),
    defaultSize: { w: 900, h: 560 },
    minSize: { w: 420, h: 300 },
    singleton: false,
    chrome: "unified",
    dock: true,
    launchpad: false,
  },
  {
    id: "safari",
    name: "Safari",
    icon: safariIcon,
    component: lazy(() => import("../apps/safari/index.jsx")),
    defaultSize: { w: 1040, h: 660 },
    minSize: { w: 420, h: 320 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "terminal",
    name: "Terminal",
    icon: terminalIcon,
    component: lazy(() => import("../apps/terminal/index.jsx")),
    defaultSize: { w: 720, h: 460 },
    minSize: { w: 360, h: 220 },
    singleton: false,
    chrome: "default",
    dock: true,
  },
  {
    id: "about",
    name: "About Me",
    icon: aboutIcon,
    component: lazy(() => import("../apps/about/index.jsx")),
    defaultSize: { w: 860, h: 600 },
    minSize: { w: 380, h: 360 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "projects",
    name: "Projects",
    icon: projectsIcon,
    component: lazy(() => import("../apps/projects/index.jsx")),
    defaultSize: { w: 960, h: 640 },
    minSize: { w: 380, h: 360 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "photos",
    name: "Photos",
    icon: photosIcon,
    component: lazy(() => import("../apps/photos/index.jsx")),
    defaultSize: { w: 980, h: 640 },
    minSize: { w: 380, h: 320 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "preview",
    name: "Preview",
    icon: previewIcon,
    component: lazy(() => import("../apps/preview/index.jsx")),
    defaultSize: { w: 860, h: 640 },
    minSize: { w: 360, h: 300 },
    singleton: false,
    chrome: "unified",
    dock: false,
  },
  {
    id: "textedit",
    name: "TextEdit",
    icon: texteditIcon,
    component: lazy(() => import("../apps/textedit/index.jsx")),
    defaultSize: { w: 760, h: 560 },
    minSize: { w: 340, h: 260 },
    singleton: false,
    chrome: "unified",
    dock: false,
  },
  {
    id: "notes",
    name: "Notes",
    icon: notesIcon,
    component: lazy(() => import("../apps/notes/index.jsx")),
    defaultSize: { w: 820, h: 540 },
    minSize: { w: 380, h: 300 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "mail",
    name: "Contact",
    icon: mailIcon,
    component: lazy(() => import("../apps/mail/index.jsx")),
    defaultSize: { w: 720, h: 560 },
    minSize: { w: 360, h: 360 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "music",
    name: "Music",
    icon: musicIcon,
    component: lazy(() => import("../apps/music/index.jsx")),
    defaultSize: { w: 880, h: 580 },
    minSize: { w: 360, h: 320 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
  {
    id: "calculator",
    name: "Calculator",
    icon: calculatorIcon,
    component: lazy(() => import("../apps/calculator/index.jsx")),
    defaultSize: { w: 260, h: 420 },
    minSize: { w: 232, h: 380 },
    singleton: true,
    chrome: "default",
    dock: false,
  },
  {
    id: "settings",
    name: "System Settings",
    icon: settingsIcon,
    component: lazy(() => import("../apps/settings/index.jsx")),
    defaultSize: { w: 820, h: 580 },
    minSize: { w: 380, h: 360 },
    singleton: true,
    chrome: "unified",
    dock: true,
  },
];

const byId = Object.fromEntries(APPS.map((a) => [a.id, a]));
export const getApp = (id) => byId[id] || null;
export const dockApps = () => APPS.filter((a) => a.dock);
export const launchpadApps = () => APPS.filter((a) => a.launchpad !== false);
