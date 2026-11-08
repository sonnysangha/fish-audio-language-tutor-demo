"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function readPreference() {
  try { return localStorage.getItem("sona-theme"); } catch { return null; }
}

function subscribe(onChange: () => void) {
  const system = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    const saved = readPreference();
    document.documentElement.dataset.theme = saved === "dark" || (saved !== "light" && system.matches) ? "dark" : "light";
    onChange();
  };
  window.addEventListener("sona-theme", onChange);
  window.addEventListener("storage", sync);
  system.addEventListener("change", sync);
  return () => {
    window.removeEventListener("sona-theme", onChange);
    window.removeEventListener("storage", sync);
    system.removeEventListener("change", sync);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === "dark", () => false);
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("sona-theme", theme); } catch { /* The toggle also works without persistent storage. */ }
    window.dispatchEvent(new Event("sona-theme"));
  }}>
    {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
  </button>;
}
