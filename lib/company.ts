"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Company = { name?: string; logo_url?: string; address?: string; phone?: string; email?: string; tax_id?: string };

// Cache to avoid refetching on every render
let cached: Company | null = null;
let cachedAt = 0;
const TTL = 60_000; // 1 min

export function useCompany(): Company {
  const [c, setC] = useState<Company>(cached || {});
  useEffect(() => {
    // Use cache if fresh
    if (cached && Date.now() - cachedAt < TTL) { setC(cached); return; }
    supabase.from("settings").select("value").eq("key", "company").maybeSingle().then(({ data }) => {
      const v = (data?.value as Company) || {};
      cached = v; cachedAt = Date.now();
      setC(v);
    });
  }, []);
  return c;
}

// For anonymous pages (parent portal, printed views) — uses v_public_settings
export function useCompanyPublic(): Company {
  const [c, setC] = useState<Company>(cached || {});
  useEffect(() => {
    if (cached && Date.now() - cachedAt < TTL) { setC(cached); return; }
    supabase.from("v_public_settings").select("*").then(({ data }) => {
      const v = ((data || []).find((r: any) => r.key === "company")?.value as Company) || {};
      cached = v; cachedAt = Date.now();
      setC(v);
    });
  }, []);
  return c;
}
