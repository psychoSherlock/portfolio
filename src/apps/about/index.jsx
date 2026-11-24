// About Me — a single scrolling profile page.
import { memo } from "react";
import { LuFileText, LuFolderGit2, LuMail, LuMapPin, LuTrophy, LuFolderOpen } from "react-icons/lu";
import fs, { useFs } from "../../os/fs";
import { wm } from "../../os/windowStore";
import { openPath, openUrl } from "../../os/open";
import profile from "./profile";
import "./about.css";

const Chips = memo(function Chips({ items }) {
  return (
    <div className="about-chips">
      {items.map((s) => (
        <span key={s} className="about-chip">
          {s}
        </span>
      ))}
    </div>
  );
});

export default function About() {
  useFs();
  const avatar = fs.url(profile.avatar);
  const hasResume = fs.exists(profile.resume);

  return (
    <div className="about-root">
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">About Me</span>
        <div className="os-toolbar-spacer" />
        {hasResume && (
          <button className="os-btn" onClick={() => openPath(profile.resume, { app: "preview" })}>
            <LuFileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Resume
          </button>
        )}
      </div>
      <div className="about-scroll os-scroll os-selectable">
        <div className="about-page">
          <header className="about-hero">
            {avatar && <img className="about-avatar" src={avatar} alt={profile.name} decoding="async" />}
            <div className="about-hero-text">
              <h1>{profile.name}</h1>
              <div className="about-alias">
                @{profile.alias} · {profile.title}
              </div>
              <div className="about-loc">
                <LuMapPin size={13} /> {profile.location}
              </div>
              <p className="about-tagline">{profile.tagline}</p>
              <div className="about-actions">
                {hasResume && (
                  <button className="os-btn os-btn--primary" onClick={() => openPath(profile.resume, { app: "preview" })}>
                    <LuFileText size={14} /> View Resume
                  </button>
                )}
                <button className="os-btn" onClick={() => wm.open("projects")}>
                  <LuFolderGit2 size={14} /> Projects
                </button>
                <button className="os-btn" onClick={() => wm.open("mail")}>
                  <LuMail size={14} /> Contact
                </button>
              </div>
            </div>
          </header>

          <section>
            {profile.bio.map((p) => (
              <p key={p} className="about-bio">
                {p}
              </p>
            ))}
            <div className="about-stats">
              {profile.stats.map((s) => (
                <div key={s.label} className="about-stat">
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Experience</h2>
            {profile.experience.map((x) => (
              <article key={x.org + x.role} className="about-job">
                <div className="about-job-head">
                  <div>
                    <button className="about-link" onClick={() => openUrl(x.url)}>
                      {x.org}
                    </button>
                    <span className="about-role"> · {x.role}</span>
                  </div>
                  <span className="about-period">{x.period}</span>
                </div>
                <ul>
                  {x.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>

          <section>
            <h2>Education</h2>
            {profile.education.map((e) => (
              <div key={e.school} className="about-job-head about-edu">
                <div>
                  <b>{e.school}</b>
                  <div className="about-role">{e.degree}</div>
                </div>
                <span className="about-period">{e.period}</span>
              </div>
            ))}
          </section>

          <section>
            <h2>Skills</h2>
            {profile.skills.map((g) => (
              <div key={g.id} className="about-skill-group">
                <h3>{g.title}</h3>
                <Chips items={g.items} />
              </div>
            ))}
          </section>

          <section>
            <h2>Achievements</h2>
            <ul className="about-ach">
              {profile.achievements.map((a) => (
                <li key={a.id}>
                  <LuTrophy size={16} className="about-ach-icon" />
                  <div className="about-ach-text">
                    <b>{a.title}</b>
                    <span>
                      {a.event} · {a.date}
                    </span>
                    {a.description && <p>{a.description}</p>}
                  </div>
                  {a.album && fs.isDir(a.album) && (
                    <button className="os-btn" onClick={() => openPath(a.album)} title="Open photo album">
                      <LuFolderOpen size={14} style={{ verticalAlign: -2 }} /> Album
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
