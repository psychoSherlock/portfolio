import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaLinux, FaCog, FaMicrochip } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "../styles/Boot.css";
import { useSettings } from "../os/settingsStore";
import backgroundImage from "../assets/images/arthur-gun.png";

const LOAD_CAP_MS = 6000;

export default function Boot() {
  const [selectedOption, setSelectedOption] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("");
  const [timeLeft, setTimeLeft] = useState(3);
  const [autoBootEnabled, setAutoBootEnabled] = useState(true);
  const totalOptions = 3;
  const navigate = useNavigate();
  const wentRef = useRef(false);
  const skipBoot = useSettings.getState().skipBoot;

  const go = useCallback(() => {
    if (wentRef.current) return;
    wentRef.current = true;
    navigate("/plymouth", { replace: true });
  }, [navigate]);

  // skipBoot setting: straight to the desktop.
  useEffect(() => {
    if (!skipBoot || wentRef.current) return;
    wentRef.current = true;
    navigate("/desktop", { replace: true });
  }, [skipBoot, navigate]);

  // Loading sequence: typing effect + background preload (capped).
  useEffect(() => {
    if (skipBoot) return undefined;
    let alive = true;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));
    const fullText = "Loading GRUB...";
    let charIndex = 0;
    const typing = setInterval(() => {
      if (!alive) return;
      charIndex += 1;
      setLoadingText(fullText.substring(0, charIndex));
      if (charIndex >= fullText.length) clearInterval(typing);
    }, 50);

    let typed = false;
    let imgReady = false;
    const finish = () => {
      if (!alive) return;
      setLoadingText(fullText + " done!");
      later(() => setLoading(false), 500);
    };
    const check = () => typed && imgReady && finish();
    later(() => {
      typed = true;
      check();
    }, 900);

    const img = new Image();
    img.onload = img.onerror = () => {
      imgReady = true;
      check();
    };
    img.src = backgroundImage;
    later(() => {
      imgReady = true;
      typed = true;
      check();
    }, LOAD_CAP_MS);

    return () => {
      alive = false;
      clearInterval(typing);
      timers.forEach(clearTimeout);
      img.onload = img.onerror = null;
    };
  }, [skipBoot]);

  // Auto-boot countdown.
  useEffect(() => {
    if (loading || !autoBootEnabled || skipBoot) return undefined;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [loading, autoBootEnabled, skipBoot]);

  useEffect(() => {
    if (timeLeft <= 0 && !loading && autoBootEnabled) go();
  }, [timeLeft, loading, autoBootEnabled, go]);

  // Keyboard: arrows move the selection, any other key boots.
  useEffect(() => {
    if (skipBoot) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Shift") return;
      if (!loading && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        setAutoBootEnabled(false);
        setSelectedOption((p) => (e.key === "ArrowUp" ? Math.max(0, p - 1) : Math.min(totalOptions - 1, p + 1)));
        return;
      }
      go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, skipBoot, go]);

  return (
    <div className="boot-container" onClick={go}>
      {loading ? (
        <div className="boot-loading">
          <pre className="boot-loading-text">{loadingText}</pre>
          <div className="boot-loading-cursor"></div>
        </div>
      ) : (
        <>
          <div className="boot-background"></div>

          <div className="boot-menu">
            <h2 className="boot-title">GRUB BOOTLOADER</h2>
            {autoBootEnabled && (
              <div className="boot-timer">Booting in {timeLeft} seconds...</div>
            )}

            <div className="boot-options">
              <div
                className={`boot-option ${
                  selectedOption === 0 ? "selected" : ""
                }`}
                onMouseEnter={() => setSelectedOption(0)}
              >
                <FaLinux className="boot-icon" />
                <span>
                  Boot into psychoSherlock
                  {selectedOption === 0 && (
                    <span className="blinking-underscore">_</span>
                  )}
                </span>
              </div>

              <div
                className={`boot-option ${
                  selectedOption === 1 ? "selected" : ""
                }`}
                onMouseEnter={() => setSelectedOption(1)}
              >
                <FaCog className="boot-icon" />
                <span>
                  Advanced Options
                  {selectedOption === 1 && (
                    <span className="blinking-underscore">_</span>
                  )}
                </span>
              </div>

              <div
                className={`boot-option ${
                  selectedOption === 2 ? "selected" : ""
                }`}
                onMouseEnter={() => setSelectedOption(2)}
              >
                <FaMicrochip className="boot-icon" />
                <span>
                  Firmware Settings
                  {selectedOption === 2 && (
                    <span className="blinking-underscore">_</span>
                  )}
                </span>
              </div>
            </div>

            <div className="boot-footer">
              Use ↑ and ↓ keys to select, Enter to boot
            </div>
          </div>
        </>
      )}
    </div>
  );
}
