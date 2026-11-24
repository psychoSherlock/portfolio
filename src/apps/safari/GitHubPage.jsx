// sherlock://github[/user[/repo]] — a native GitHub viewer built on the public REST API
// (github.com itself refuses to be framed).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  LuArchive,
  LuBookOpen,
  LuBuilding2,
  LuCheck,
  LuCopy,
  LuExternalLink,
  LuEye,
  LuGitBranch,
  LuGitFork,
  LuGithub,
  LuCircleDot,
  LuLink,
  LuMapPin,
  LuScale,
  LuSearch,
  LuStar,
  LuUsers,
} from "react-icons/lu";
import { openExternal } from "../../os/open";
import {
  getLanguages,
  getReadme,
  getRepo,
  getRepos,
  getUser,
  langColor,
  peekRepo,
  peekRepos,
  peekUser,
  prepareReadme,
} from "./github";
import { compact, linkProps, relTime } from "./lib";
import { safari } from "./store";
import { GITHUB_USER } from "./urls";

const ghUrl = (...parts) => `https://github.com/${parts.filter(Boolean).join("/")}`;
const internal = (...parts) => `sherlock://github/${parts.filter(Boolean).join("/")}`;

function Loading({ label }) {
  return (
    <div className="safari-page safari-center">
      <div className="os-spinner" />
      <span className="safari-center-label">{label}</span>
    </div>
  );
}

function GhError({ error, user, repo }) {
  const href = ghUrl(user, repo);
  let title = "GitHub Is Not Responding";
  let body = "The GitHub API could not be reached. Check your connection or open the page on github.com.";
  if (error?.kind === "notfound") {
    title = repo ? "Repository Not Found" : "User Not Found";
    body = repo ? `There is no public repository ${user}/${repo}.` : `There is no GitHub user called “${user}”.`;
  } else if (error?.kind === "rate") {
    title = "GitHub Needs a Break";
    body = `GitHub allows 60 API requests an hour for visitors who aren't signed in, and that limit was reached${
      error.reset ? `. It resets at ${error.reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""
    }. The page is still available on github.com.`;
  } else if (error?.kind === "http") {
    body = `${error.message} Try again in a moment, or open the page on github.com.`;
  }
  return (
    <div className="safari-page safari-message os-scroll">
      <LuGithub size={44} className="safari-message-icon" />
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="safari-message-actions">
        <button type="button" className="os-btn os-btn--primary" onClick={() => openExternal(href)}>
          <LuExternalLink size={13} /> Open on github.com
        </button>
      </div>
    </div>
  );
}

// ---- profile ----------------------------------------------------------------
const RepoCard = memo(function RepoCard({ repo, user, nav }) {
  return (
    <a className="safari-gh-card" {...linkProps(internal(user, repo.name), nav)} draggable={false}>
      <div className="safari-gh-card-head">
        <LuBookOpen size={14} aria-hidden="true" />
        <span className="safari-gh-card-name">{repo.name}</span>
        {repo.fork && <span className="safari-gh-badge">Fork</span>}
        {repo.archived && <span className="safari-gh-badge safari-gh-badge--warn">Archived</span>}
      </div>
      <p className="safari-gh-card-desc">{repo.description || "No description provided."}</p>
      <div className="safari-gh-card-meta">
        {repo.language && (
          <span>
            <i className="safari-gh-dot" style={{ background: langColor(repo.language) }} />
            {repo.language}
          </span>
        )}
        {repo.stargazers_count > 0 && (
          <span>
            <LuStar size={12} /> {compact(repo.stargazers_count)}
          </span>
        )}
        {repo.forks_count > 0 && (
          <span>
            <LuGitFork size={12} /> {compact(repo.forks_count)}
          </span>
        )}
        <span className="safari-gh-card-updated">Updated {relTime(repo.pushed_at || repo.updated_at)}</span>
      </div>
    </a>
  );
});

const SORTS = {
  updated: (a, b) => Date.parse(b.pushed_at || b.updated_at) - Date.parse(a.pushed_at || a.updated_at),
  stars: (a, b) => b.stargazers_count - a.stargazers_count || SORTS.updated(a, b),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
};

function ProfileView({ tabId, url, user, nav }) {
  const [state, setState] = useState(() => {
    const u = peekUser(user);
    const r = peekRepos(user);
    return u && r ? { user: u, repos: r } : null;
  });
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("updated");
  const [forks, setForks] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getUser(user), getRepos(user)]).then(([u, r]) => {
      if (!alive) return;
      if (u.status === "rejected") return setError(u.reason);
      setState({ user: u.value, repos: r.status === "fulfilled" ? r.value : null, reposError: r.reason });
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const profile = state?.user;
  useEffect(() => {
    if (profile) safari.setTitle(tabId, url, profile.name ? `${profile.login} (${profile.name})` : profile.login);
  }, [profile, tabId, url]);

  const repos = useMemo(() => {
    if (!Array.isArray(state?.repos)) return [];
    const s = q.trim().toLowerCase();
    return state.repos
      .filter((r) => forks || !r.fork)
      .filter(
        (r) =>
          !s ||
          r.name.toLowerCase().includes(s) ||
          (r.description || "").toLowerCase().includes(s) ||
          (r.language || "").toLowerCase().includes(s) ||
          (r.topics || []).some((t) => t.includes(s))
      )
      .sort(SORTS[sort]);
  }, [state, q, sort, forks]);

  if (error) return <GhError error={error} user={user} />;
  if (!profile) return <Loading label={`Loading ${user} from GitHub…`} />;

  const forkCount = Array.isArray(state.repos) ? state.repos.filter((r) => r.fork).length : 0;
  const blog = profile.blog ? (/^https?:\/\//i.test(profile.blog) ? profile.blog : `https://${profile.blog}`) : null;

  return (
    <div className="safari-page safari-gh os-scroll">
      <div className="safari-gh-inner">
        <header className="safari-gh-profile">
          <img
            className="safari-gh-avatar"
            src={`${profile.avatar_url}${profile.avatar_url.includes("?") ? "&" : "?"}s=192`}
            alt=""
            width={96}
            height={96}
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <div className="safari-gh-profile-main">
            <h1 className="os-selectable">{profile.name || profile.login}</h1>
            <div className="safari-gh-login os-selectable">{profile.login}</div>
            {profile.bio && <p className="safari-gh-bio os-selectable">{profile.bio}</p>}
            <div className="safari-gh-facts">
              <span>
                <LuUsers size={13} /> <b>{compact(profile.followers)}</b> followers · <b>{compact(profile.following)}</b>{" "}
                following
              </span>
              {profile.company && (
                <span>
                  <LuBuilding2 size={13} /> {profile.company}
                </span>
              )}
              {profile.location && (
                <span>
                  <LuMapPin size={13} /> {profile.location}
                </span>
              )}
              {blog && (
                <a {...linkProps(blog, nav)}>
                  <LuLink size={13} /> {profile.blog.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
            </div>
          </div>
          <button type="button" className="os-btn safari-gh-open" onClick={() => openExternal(profile.html_url)}>
            <LuExternalLink size={13} /> Open on GitHub
          </button>
        </header>

        <div className="safari-gh-toolbar">
          <h2>
            Repositories <span className="safari-gh-count">{profile.public_repos}</span>
          </h2>
          <label className="safari-search-field">
            <LuSearch size={13} aria-hidden="true" />
            <input
              className="os-selectable"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a repository…"
              aria-label="Find a repository"
              spellCheck={false}
            />
          </label>
          <div className="safari-segmented" role="group" aria-label="Sort repositories">
            {[
              ["updated", "Updated"],
              ["stars", "Stars"],
              ["name", "Name"],
            ].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
          {forkCount > 0 && (
            <label className="safari-gh-check">
              <input type="checkbox" checked={forks} onChange={(e) => setForks(e.target.checked)} /> Forks ({forkCount})
            </label>
          )}
        </div>

        {state.repos === null ? (
          <div className="safari-gh-inline-error">
            Repositories couldn't be loaded{state.reposError?.kind === "rate" ? " (GitHub's rate limit was reached)" : ""}.{" "}
            <button type="button" className="safari-linklike" onClick={() => openExternal(`${profile.html_url}?tab=repositories`)}>
              Open on github.com
            </button>
          </div>
        ) : repos.length === 0 ? (
          <p className="safari-empty">{q ? `No repositories match “${q}”.` : "No public repositories yet."}</p>
        ) : (
          <div className="safari-gh-grid">
            {repos.map((r) => (
              <RepoCard key={r.id} repo={r} user={profile.login} nav={nav} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- repository -------------------------------------------------------------
function Languages({ langs }) {
  const entries = Object.entries(langs || {});
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return null;
  const list = entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => ({ name, pct: (v / total) * 100 }));
  return (
    <section className="safari-gh-langs" aria-label="Languages">
      <div className="safari-gh-langbar">
        {list.map((l) => (
          <span key={l.name} style={{ flexGrow: l.pct, background: langColor(l.name) }} title={`${l.name} ${l.pct.toFixed(1)}%`} />
        ))}
      </div>
      <div className="safari-gh-langlist">
        {list.slice(0, 8).map((l) => (
          <span key={l.name}>
            <i className="safari-gh-dot" style={{ background: langColor(l.name) }} />
            <b>{l.name}</b> {l.pct < 0.1 ? "<0.1" : l.pct.toFixed(1)}%
          </span>
        ))}
      </div>
    </section>
  );
}

function Readme({ html, user, repo, branch, nav }) {
  const ref = useRef(null);
  const clean = useMemo(() => (html ? prepareReadme(html, user, repo, branch) : ""), [html, user, repo, branch]);
  const follow = (e, newTab) => {
    const a = e.target.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    e.preventDefault();
    if (href.startsWith("#")) {
      const id = decodeURIComponent(href.slice(1));
      const el =
        ref.current?.querySelector(`[id="user-content-${CSS.escape(id)}"]`) ||
        ref.current?.querySelector(`[id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "start" });
      return;
    }
    nav(href, newTab ? { newTab: true, background: true } : undefined);
  };
  if (!clean) return null;
  return (
    <section className="safari-gh-readme">
      <header>
        <LuBookOpen size={14} /> README
      </header>
      <div
        ref={ref}
        className="safari-md os-selectable"
        onClick={(e) => follow(e, e.metaKey || e.ctrlKey)}
        onAuxClick={(e) => e.button === 1 && follow(e, true)}
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </section>
  );
}

function RepoView({ tabId, url, user, repo: name, nav }) {
  const [repo, setRepo] = useState(() => peekRepo(user, name) || null);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState({ readme: undefined, langs: undefined });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getRepo(user, name).then(
      (r) => alive && setRepo(r),
      (e) => alive && setError(e)
    );
    Promise.allSettled([getReadme(user, name), getLanguages(user, name)]).then(([rd, lg]) => {
      if (alive) setExtra({ readme: rd.value ?? null, langs: lg.value ?? null });
    });
    return () => {
      alive = false;
    };
  }, [user, name]);

  useEffect(() => {
    if (repo) safari.setTitle(tabId, url, repo.description ? `${repo.full_name}: ${repo.description}` : repo.full_name);
  }, [repo, tabId, url]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  if (error) return <GhError error={error} user={user} repo={name} />;
  if (!repo) return <Loading label={`Loading ${user}/${name}…`} />;

  const owner = repo.owner?.login || user;
  const homepage = repo.homepage ? (/^https?:\/\//i.test(repo.homepage) ? repo.homepage : `https://${repo.homepage}`) : null;
  const stats = [
    [LuStar, compact(repo.stargazers_count), repo.stargazers_count === 1 ? "star" : "stars"],
    [LuGitFork, compact(repo.forks_count), repo.forks_count === 1 ? "fork" : "forks"],
    [LuEye, compact(repo.subscribers_count ?? repo.watchers_count), "watching"],
    [LuCircleDot, compact(repo.open_issues_count), "open issues"],
  ];

  return (
    <div className="safari-page safari-gh os-scroll">
      <div className="safari-gh-inner">
        <nav className="safari-gh-crumbs" aria-label="Breadcrumb">
          <img src={repo.owner?.avatar_url} alt="" width={22} height={22} decoding="async" referrerPolicy="no-referrer" />
          <a {...linkProps(internal(owner), nav)}>{owner}</a>
          <span aria-hidden="true">/</span>
          <b className="os-selectable">{repo.name}</b>
          <span className="safari-gh-badge">{repo.private ? "Private" : "Public"}</span>
          {repo.archived && (
            <span className="safari-gh-badge safari-gh-badge--warn">
              <LuArchive size={11} /> Archived
            </span>
          )}
        </nav>
        {repo.fork && repo.parent && (
          <div className="safari-gh-forked">
            forked from <a {...linkProps(internal(repo.parent.full_name), nav)}>{repo.parent.full_name}</a>
          </div>
        )}

        <div className="safari-gh-repo-head">
          <div className="safari-gh-repo-about">
            {repo.description && <p className="safari-gh-repo-desc os-selectable">{repo.description}</p>}
            {homepage && (
              <a className="safari-gh-homepage" {...linkProps(homepage, nav)}>
                <LuLink size={13} /> {repo.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
            {repo.topics?.length > 0 && (
              <div className="safari-gh-topics">
                {repo.topics.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            )}
            <div className="safari-gh-stats">
              {stats.map((stat) => {
                const [Icon, v, label] = stat;
                return (
                  <span key={label}>
                    <Icon size={13} /> <b>{v}</b> {label}
                  </span>
                );
              })}
              {repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" && (
                <span>
                  <LuScale size={13} /> {repo.license.spdx_id}
                </span>
              )}
              <span>
                <LuGitBranch size={13} /> {repo.default_branch}
              </span>
              <span>Updated {relTime(repo.pushed_at || repo.updated_at)}</span>
            </div>
          </div>
          <div className="safari-gh-repo-actions">
            <button type="button" className="os-btn os-btn--primary" onClick={() => openExternal(repo.html_url)}>
              <LuExternalLink size={13} /> Open on GitHub
            </button>
            <button
              type="button"
              className="os-btn"
              onClick={() =>
                navigator.clipboard?.writeText(`git clone ${repo.clone_url}`).then(() => setCopied(true), () => {})
              }
            >
              {copied ? <LuCheck size={13} /> : <LuCopy size={13} />} {copied ? "Copied" : "Copy git clone"}
            </button>
          </div>
        </div>

        <Languages langs={extra.langs} />

        {extra.readme === undefined ? (
          <div className="safari-gh-readme-loading">
            <div className="os-spinner" />
          </div>
        ) : extra.readme ? (
          <Readme html={extra.readme} user={owner} repo={repo.name} branch={repo.default_branch} nav={nav} />
        ) : (
          <p className="safari-empty">This repository has no README.</p>
        )}
      </div>
    </div>
  );
}

export default function GitHubPage({ tabId, url, args, nav }) {
  const user = args[0] || GITHUB_USER;
  const repo = args[1];
  return repo ? (
    <RepoView tabId={tabId} url={url} user={user} repo={repo} nav={nav} />
  ) : (
    <ProfileView tabId={tabId} url={url} user={user} nav={nav} />
  );
}
