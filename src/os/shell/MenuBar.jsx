// The macOS-style menu bar: logo menu, active app + its menus, status items and the clock.
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LuSearch, LuWifi, LuWifiOff } from "react-icons/lu";
import { getApp } from "../apps";
import { MENUBAR_H, useActiveWindow, useWindows } from "../windowStore";
import { useSettings } from "../settingsStore";
import { ui, useUI } from "../ui";
import Menu from "./system/Menu";
import { BatteryGlyph, ControlCenterGlyph, SherlockMark } from "./system/Glyphs";
import { formatShortDate, formatTime, useBattery, useNarrow, useNow, useOnline } from "./system/hooks";
import { useSys } from "./system/sysStore";
import { APP_MENUS, appMenu, logoMenu } from "./system/menus";
import "./system/system.css";

const SHELL_PANELS = new Set(["controlCenter", "notificationCenter"]);
const isInside = (t) => !!t.closest("[data-mb-menu]");

const Clock = memo(function Clock({ narrow }) {
  const h24 = useSettings((s) => s.clock24h);
  const now = useNow(60000);
  const open = useUI((s) => s.overlay === "notificationCenter");
  return (
    <button
      type="button"
      className="sys-mb-item sys-mb-clock"
      data-overlay-toggle
      data-open={open}
      aria-label="Notification Center"
      aria-expanded={open}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => ui.toggleOverlay("notificationCenter")}
    >
      {!narrow && <span>{formatShortDate(now)}</span>}
      <span>{formatTime(now, h24)}</span>
    </button>
  );
});

function OverlayButton({ name, label, children, className = "" }) {
  const open = useUI((s) => s.overlay === name);
  return (
    <button
      type="button"
      className={`sys-mb-item sys-mb-status ${className}`}
      data-overlay-toggle
      data-open={open}
      aria-label={label}
      aria-expanded={open}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => ui.toggleOverlay(name)}
    >
      {children}
    </button>
  );
}

export default function MenuBar() {
  const narrow = useNarrow();
  const active = useActiveWindow();
  const appId = active && !active.minimized ? active.appId : "finder";
  const appName = getApp(appId)?.name || "Finder";

  // Re-render dropdowns live while open (window list, checkmarks).
  const windows = useWindows((s) => s.windows);
  const activeId = useWindows((s) => s.activeId);
  const theme = useSettings((s) => s.theme);
  const icons = useSettings((s) => s.showDesktopIcons);
  const h24 = useSettings((s) => s.clock24h);

  const online = useOnline();
  const battery = useBattery();
  const wifi = useSys((s) => s.wifi);
  const showPct = useSys((s) => s.batteryPct);

  const [menu, setMenu] = useState(null); // { key, x, kbd }
  const refs = useRef({});

  const order = useMemo(
    () => (narrow ? ["logo", "app"] : ["logo", "app", ...APP_MENUS.map((m) => m.key)]),
    [narrow]
  );

  const openMenu = useCallback((key, kbd = false) => {
    const el = refs.current[key];
    if (!el) return;
    const r = el.getBoundingClientRect();
    ui.hideContextMenu();
    if (SHELL_PANELS.has(useUI.getState().overlay)) ui.setOverlay(null);
    setMenu({ key, x: Math.round(r.left), kbd });
  }, []);
  const close = useCallback(() => setMenu(null), []);

  const onSide = useCallback(
    (dir) => {
      setMenu((m) => {
        if (!m) return m;
        const i = order.indexOf(m.key);
        if (i < 0) return m;
        const key = order[(i + dir + order.length) % order.length];
        const el = refs.current[key];
        if (!el) return m;
        return { key, x: Math.round(el.getBoundingClientRect().left), kbd: true };
      });
    },
    [order]
  );

  const items = useMemo(() => {
    if (!menu) return null;
    switch (menu.key) {
      case "logo":
        return logoMenu();
      case "app":
        return appMenu(appId);
      case "wifi":
        return [
          { label: "Wi-Fi", checked: wifi, onClick: () => useSys.setState({ wifi: !wifi }) },
          { separator: true },
          { label: online ? "Connected to the internet" : "No internet connection", disabled: true },
          { label: wifi ? "Network: SherlockNet" : "Wi-Fi is turned off", disabled: true },
        ];
      case "battery":
        return battery
          ? [
              { label: `Battery ${Math.round(battery.level * 100)}%`, disabled: true },
              { label: `Power Source: ${battery.charging ? "Power Adapter" : "Battery"}`, disabled: true },
              { separator: true },
              { label: "Show Percentage", checked: showPct, onClick: () => useSys.setState({ batteryPct: !showPct }) },
            ]
          : null;
      default:
        return APP_MENUS.find((m) => m.key === menu.key)?.build(appId) || null;
    }
    // windows/activeId/theme/icons/h24 are deliberate triggers: builders read live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, appId, windows, activeId, theme, icons, h24, wifi, online, battery, showPct]);

  // A menu title: opens on press (like macOS), then hover switches between titles.
  const title = (key) => ({
    ref: (el) => {
      refs.current[key] = el;
    },
    "data-mb-menu": key,
    role: "menuitem",
    "data-open": menu?.key === key,
    "aria-haspopup": "menu",
    "aria-expanded": menu?.key === key,
    onMouseDown: (e) => e.preventDefault(),
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      if (menu?.key === key) close();
      else openMenu(key);
    },
    onPointerEnter: () => {
      if (menu && menu.key !== key) openMenu(key);
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu(key, true);
      }
    },
  });

  const level = battery ? Math.round(battery.level * 100) : 0;

  return (
    <>
      <header className="sys-menubar" aria-label="Menu bar" onContextMenu={(e) => e.preventDefault()}>
        <nav className="sys-mb-left" role="menubar" aria-label="Application menus">
          <button type="button" className="sys-mb-item sys-mb-logo" aria-label="SherlockOS menu" {...title("logo")}>
            <SherlockMark size={15} />
          </button>
          <button type="button" className="sys-mb-item sys-mb-app" {...title("app")}>
            {appName}
          </button>
          {!narrow &&
            APP_MENUS.map((m) => (
              <button key={m.key} type="button" className="sys-mb-item" {...title(m.key)}>
                {m.label}
              </button>
            ))}
        </nav>

        <div className="sys-mb-right">
          {battery && !narrow && (
            <button
              type="button"
              className="sys-mb-item sys-mb-status"
              aria-label={`Battery ${level}%${battery.charging ? ", charging" : ""}`}
              title={`Battery ${level}%`}
              {...title("battery")}
              role="button"
            >
              {showPct && <span className="sys-mb-battery-pct">{level}%</span>}
              <BatteryGlyph level={battery.level} charging={battery.charging} />
            </button>
          )}
          <button
            type="button"
            className={`sys-mb-item sys-mb-status${!online ? " sys-mb-offline" : ""}`}
            aria-label={wifi && online ? "Wi-Fi: connected" : "Wi-Fi: not connected"}
            title={wifi && online ? "Wi-Fi: connected" : "Wi-Fi: not connected"}
            {...title("wifi")}
            role="button"
          >
            {wifi && online ? <LuWifi /> : <LuWifiOff />}
          </button>
          <OverlayButton name="spotlight" label="Spotlight">
            <LuSearch />
          </OverlayButton>
          <OverlayButton name="controlCenter" label="Control Center">
            <ControlCenterGlyph />
          </OverlayButton>
          <Clock narrow={narrow} />
        </div>
      </header>

      {/* Rendered beside (not inside) the bar: a backdrop-filtered parent would trap the menu's own blur. */}
      <AnimatePresence>
        {menu && items && (
          <Menu
            key="bar"
            items={items}
            x={menu.x}
            y={MENUBAR_H + 1}
            origin="bar"
            autoHighlight={menu.kbd}
            resetKey={menu.key}
            onClose={close}
            onSide={onSide}
            isInside={isInside}
          />
        )}
      </AnimatePresence>
    </>
  );
}
