// Projects — GitHub repo cards (bundled snapshot, silently refreshed from the GitHub API).
import { memo, useEffect, useMemo, useState } from "react";
import { LuSearch, LuStar, LuGitFork, LuExternalLink } from "react-icons/lu";
import { openUrl } from "../../os/open";
import snapshot from "./repos.snapshot.json";
import "./projects.css";

const USER = "psychoSherlock";
const slim = (r) => ({
  name: r.name,
  description: r.description,
  html_url: r.html_url,
  homepage: r.homepage,
  language: r.language,
  stargazers_count: r.stargazers_count,
  forks_count: r.forks_count,
  topics: r.topics || [],
  pushed_at: r.pushed_at,
  fork: r.fork,
  archived: r.archived,
});

const Card = memo(function Card({ r }) {
  return (
    <button className="projects-card" onClick={() => openUrl(r.html_url)} title={r.html_url}>
      <div className="projects-card-head">
        <b>{r.name}</b>
        {r.fork && <span className="projects-tag">fork</span>}
        {r.archived && <span className="projects-tag">archived</span>}
      </div>
      <p>{r.description || "No description provided."}</p>
      <div className="projects-card-foot">
        {r.language && <span className="projects-lang">{r.language}</span>}
        <span>
          <LuStar size={12} /> {r.stargazers_count}
        </span>
        <span>
          <LuGitFork size={12} /> {r.forks_count}
        </span>
        <span className="projects-date">{r.pushed_at ? new Date(r.pushed_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : ""}</span>
      </div>
    </button>
  );
});

export default function Projects() {
  const [repos, setRepos] = useState(snapshot);
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("All");
  const [forks, setForks] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => Array.isArray(d) && d.length && setRepos(d.map(slim)))
      .catch(() => {});
    return () => ctl.abort();
  }, []);

  const langs = useMemo(() => {
    const c = new Map();
    repos.forEach((r) => r.language && c.set(r.language, (c.get(r.language) || 0) + 1));
    return ["All", ...[...c.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)];
  }, [repos]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return repos
      .filter((r) => (forks || !r.fork) && (lang === "All" || r.language === lang))
      .filter((r) => !s || `${r.name} ${r.description || ""} ${(r.topics || []).join(" ")}`.toLowerCase().includes(s))
      .sort((a, b) => b.stargazers_count - a.stargazers_count || (b.pushed_at || "").localeCompare(a.pushed_at || ""));
  }, [repos, q, lang, forks]);

  return (
    <div className="projects-root">
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">Projects</span>
        <div className="os-toolbar-spacer" />
        <label className="projects-search">
          <LuSearch size={14} />
          <input className="os-input" placeholder="Search" aria-label="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="os-icon-btn" title="Open GitHub profile" aria-label="Open GitHub profile" onClick={() => openUrl(`https://github.com/${USER}`)}>
          <LuExternalLink size={16} />
        </button>
      </div>
      <div className="projects-filters">
        {langs.slice(0, 10).map((l) => (
          <button key={l} className="projects-pill" aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l}
          </button>
        ))}
        <label className="projects-forks">
          <input type="checkbox" checked={forks} onChange={(e) => setForks(e.target.checked)} /> Show forks
        </label>
      </div>
      <div className="projects-scroll os-scroll">
        {shown.length ? (
          <div className="projects-grid">
            {shown.map((r) => (
              <Card key={r.name} r={r} />
            ))}
          </div>
        ) : (
          <div className="projects-empty">No repositories match.</div>
        )}
      </div>
    </div>
  );
}
