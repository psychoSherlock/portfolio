// One tab's content: an internal sherlock:// page, a framed website, or the
// "can't be displayed" interstitial. Every tab stays mounted while hidden so
// switching tabs never reloads an iframe.
import { lazy, memo, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LuExternalLink, LuShieldAlert, LuWifiOff, LuX } from "react-icons/lu";
import { openExternal } from "../../os/open";
import { embedInfo } from "./embeddable";
import { currentEntry, safari } from "./store";
import { classify, stripWww } from "./urls";
import { InternalPage } from "./InternalPage";

const GitHubPage = lazy(() => import("./GitHubPage.jsx"));

const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";
const ALLOW = "fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write";

const subscribeOnline = (cb) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

function Frame({ tabId, src, title }) {
  useEffect(() => {
    safari.setLoading(tabId, true);
    // onLoad always fires, even for refused frames; this only guards hung connections.
    const t = setTimeout(() => safari.setLoading(tabId, false), 25000);
    return () => {
      clearTimeout(t);
      safari.setLoading(tabId, false);
    };
  }, [tabId]);
  return (
    <iframe
      className="safari-frame"
      src={src}
      title={title}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      allow={ALLOW}
      allowFullScreen
      onLoad={() => safari.setLoading(tabId, false)}
    />
  );
}

export function Interstitial({ tabId, url, host }) {
  const name = stripWww(host);
  return (
    <div className="safari-page safari-interstitial os-scroll">
      <div className="safari-interstitial-card">
        <div className="safari-interstitial-icon">
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
            alt=""
            width={40}
            height={40}
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <span className="safari-interstitial-badge" aria-hidden="true">
            <LuShieldAlert size={14} />
          </span>
        </div>
        <h1>{name} can't be displayed inside SherlockOS</h1>
        <p>
          This website tells browsers not to show it inside other pages (it sends an{" "}
          <code>X-Frame-Options</code> or <code>frame-ancestors</code> header), so it only works in a
          real browser tab.
        </p>
        <div className="safari-interstitial-url os-selectable">{url}</div>
        <div className="safari-interstitial-actions">
          <button type="button" className="os-btn os-btn--primary" onClick={() => openExternal(url)}>
            <LuExternalLink size={13} /> Open in a real browser tab
          </button>
          <button type="button" className="os-btn" onClick={() => safari.setOverride(tabId, "force")}>
            Try anyway
          </button>
        </div>
      </div>
    </div>
  );
}

function OfflinePage({ tabId }) {
  return (
    <div className="safari-page safari-message os-scroll">
      <LuWifiOff size={44} className="safari-message-icon" />
      <h1>You Are Not Connected to the Internet</h1>
      <p>This page can't be displayed because your computer is currently offline.</p>
      <button type="button" className="os-btn" onClick={() => safari.reload(tabId)}>
        Try Again
      </button>
    </div>
  );
}

function WebPage({ tab, url, reloadKey, index }) {
  const online = useOnline();
  const info = useMemo(() => embedInfo(url), [url]);
  const [dismissed, setDismissed] = useState(null);
  const override = tab.override?.url === url ? tab.override.mode : null;
  const blocked = override === "block" || (info.policy === "deny" && override !== "force");

  if (!online) return <OfflinePage tabId={tab.id} />;
  if (blocked) return <Interstitial tabId={tab.id} url={url} host={info.host} />;

  const showBar = info.policy !== "allow" && dismissed !== url;
  return (
    <div className="safari-webpage">
      {showBar && (
        <div className="safari-infobar" role="status">
          <span className="safari-infobar-text">
            <b>Blank page?</b> This site may block embedding.
          </span>
          <button type="button" className="safari-infobar-btn" onClick={() => openExternal(url)}>
            Open in new tab
          </button>
          <button
            type="button"
            className="safari-infobar-close"
            aria-label="Dismiss"
            onClick={() => setDismissed(url)}
          >
            <LuX size={12} />
          </button>
        </div>
      )}
      <Frame
        key={`${index}|${info.src}|${reloadKey}`}
        tabId={tab.id}
        src={info.src}
        title={currentEntry(tab).title}
      />
    </div>
  );
}

export const TabView = memo(function TabView({ tab, active, nav }) {
  const entry = currentEntry(tab);
  const c = classify(entry.url);
  const internal = c.kind !== "web";

  useEffect(() => {
    if (internal) safari.setLoading(tab.id, false);
  }, [internal, tab.id, entry.url]);

  let body;
  if (c.kind === "web") {
    body = <WebPage tab={tab} url={entry.url} reloadKey={tab.reloadKey} index={tab.index} />;
  } else if (c.kind === "internal" && c.page === "github") {
    body = (
      <Suspense fallback={<div className="safari-page safari-center"><div className="os-spinner" /></div>}>
        <GitHubPage key={`${entry.url}|${tab.reloadKey}`} tabId={tab.id} url={entry.url} args={c.args} nav={nav} />
      </Suspense>
    );
  } else {
    body = <InternalPage key={`${entry.url}|${tab.reloadKey}`} tabId={tab.id} url={entry.url} info={c} nav={nav} />;
  }

  return (
    <div className={`safari-view${active ? " is-active" : ""}`} inert={!active} aria-hidden={!active}>
      {body}
    </div>
  );
});
