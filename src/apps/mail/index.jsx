// Contact — compose a mailto: message and jump to social profiles.
import { useState } from "react";
import { LuMail, LuSend, LuGithub, LuTwitter, LuLinkedin, LuGlobe, LuLink, LuBookOpen, LuShield } from "react-icons/lu";
import { openExternal } from "../../os/open";
import profile from "../about/profile";
import "./mail.css";

const ICONS = { github: LuGithub, x: LuTwitter, linkedin: LuLinkedin, website: LuGlobe, medium: LuBookOpen, hackerone: LuShield, linktree: LuLink };

export default function Mail() {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const email = profile.email;

  const send = (e) => {
    e.preventDefault();
    const text = from.trim() ? `${body}\n\n-- ${from.trim()}` : body;
    const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = `mailto:${email}?${q}`;
  };

  return (
    <div className="mail-root">
      <div className="os-toolbar" data-window-drag>
        <span className="os-toolbar-title">Contact</span>
      </div>
      <div className="mail-scroll os-scroll">
        <div className="mail-page">
          {email && (
            <form className="mail-form" onSubmit={send}>
              <h2>
                <LuMail size={16} /> Say hello
              </h2>
              <div className="mail-to">
                To: <b className="os-selectable">{email}</b>
              </div>
              <input className="os-input" placeholder="Your name" aria-label="Your name" value={from} onChange={(e) => setFrom(e.target.value)} />
              <input className="os-input" placeholder="Subject" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <textarea className="os-input mail-body" placeholder="Message" aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} required />
              <button className="os-btn os-btn--primary mail-send" type="submit">
                <LuSend size={14} /> Open in mail app
              </button>
            </form>
          )}
          <h2>Find me online</h2>
          <div className="mail-socials">
            {profile.socials.map((s) => {
              const Icon = ICONS[s.id] || LuLink;
              return (
                <button key={s.id} className="mail-social" onClick={() => openExternal(s.url)}>
                  <Icon size={20} />
                  <span>
                    <b>{s.label}</b>
                    <small>{s.handle}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
