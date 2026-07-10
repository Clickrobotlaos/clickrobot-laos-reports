"use client";
import { useEffect } from "react";
import { supabase } from "./supabase";

export const THEMES: Record<string, { label: string; accent: string; accent2: string; emoji: string }> = {
  blue:    { label: "Classic Blue",   accent: "#2050C8", accent2: "#EBF0FC", emoji: "🔵" },
  purple:  { label: "Royal Purple",   accent: "#7C3AED", accent2: "#F3EEFD", emoji: "🟣" },
  green:   { label: "Fresh Green",    accent: "#16A34A", accent2: "#E9F9EF", emoji: "🟢" },
  orange:  { label: "Energy Orange",  accent: "#EA580C", accent2: "#FDF0E7", emoji: "🟠" },
  pink:    { label: "Playful Pink",   accent: "#DB2777", accent2: "#FCEAF3", emoji: "🌸" },
  teal:    { label: "Ocean Teal",     accent: "#0D9488", accent2: "#E6F7F5", emoji: "🩵" },
  red:     { label: "Bold Red",       accent: "#DC2626", accent2: "#FDEAEA", emoji: "🔴" },
  dark:    { label: "Midnight Navy",  accent: "#1E293B", accent2: "#EDF1F7", emoji: "⚫" },
};

export function applyTheme(themeKey: string) {
  const t = THEMES[themeKey] || THEMES.blue;
  const root = document.documentElement;
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent2", t.accent2);
}

// Hook: loads theme from settings and applies it
export function useTheme() {
  useEffect(() => {
    supabase.from("settings").select("value").eq("key", "theme").maybeSingle().then(({ data }) => {
      const themeKey = (data?.value as string) || "blue";
      applyTheme(typeof themeKey === "string" ? themeKey.replace(/"/g, "") : "blue");
    });
  }, []);
}
