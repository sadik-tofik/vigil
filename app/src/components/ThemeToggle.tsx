"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "@phosphor-icons/react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const syncTheme = () => {
      const docTheme = document.documentElement.getAttribute("data-theme") as "dark" | "light" | null;
      const stored = localStorage.getItem("vigil_theme") as "dark" | "light" | null;
      const systemLight = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      const current = stored || docTheme || (systemLight ? "light" : "dark");
      setTheme(current);
      document.documentElement.setAttribute("data-theme", current);
    };

    syncTheme();
    setMounted(true);

    window.addEventListener("vigil-theme-change", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("vigil-theme-change", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("vigil_theme", next);
    window.dispatchEvent(new Event("vigil-theme-change"));
  };

  if (!mounted) {
    return (
      <div
        className={`w-8 h-8 rounded-full border border-neutral-200 bg-neutral-100 flex items-center justify-center opacity-70 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={`w-8 h-8 rounded-full border border-neutral-200 bg-neutral-100 hover:bg-neutral-200/50 hover:border-neutral-300 text-neutral-900 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-signal-amber/30 cursor-pointer ${className}`}
    >
      {theme === "dark" ? (
        <Sun size={18} weight="light" className="text-signal-amber" />
      ) : (
        <Moon size={18} weight="light" className="text-neutral-900" />
      )}
    </button>
  );
}
