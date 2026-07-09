"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "./supabase";

export type Branch = { id: string; name: string };
export type Program = { id: string; name: string };

export type AppContextValue = {
  loading: boolean;
  userId: string | null;
  userName: string;
  role: string;                       // 'admin' | 'manager' | 'finance' | 'staff' | 'viewer'
  branchId: string | null;
  branches: Branch[];
  programs: Program[];
  rates: Record<string, number>;      // { LAK:1, USD:22000, THB:620 }
  displayCurrency: string;
  setDisplayCurrency: (c: string) => void;
  refreshMeta: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AppCtx = createContext<AppContextValue | null>(null);
export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("viewer");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ LAK: 1, USD: 22000, THB: 620 });
  const [displayCurrency, setDisplayCurrency] = useState("LAK");

  async function loadEverything(uid: string) {
    // 1. read user row
    const { data: u } = await supabase.from("users").select("id,name,role,branch_id").eq("id", uid).single();
    if (u) { setUserName(u.name); setRole(u.role); setBranchId(u.branch_id); }

    // 2. lookup lists
    const [b, p, r] = await Promise.all([
      supabase.from("branches").select("id,name").eq("active", true).order("name"),
      supabase.from("programs").select("id,name").eq("active", true).order("name"),
      supabase.from("exchange_rates").select("currency,rate_to_lak,effective_date").order("effective_date", { ascending: false }),
    ]);
    setBranches(b.data || []);
    setPrograms(p.data || []);
    const latest: Record<string, number> = { LAK: 1 };
    (r.data || []).forEach((row: any) => { if (latest[row.currency] === undefined) latest[row.currency] = Number(row.rate_to_lak); });
    setRates({ LAK: 1, USD: latest.USD || 22000, THB: latest.THB || 620 });
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        if (path !== "/login") router.replace("/login");
        return;
      }
      setUserId(session.user.id);
      await loadEverything(session.user.id);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (!session) {
        setUserId(null); setRole("viewer"); setUserName("");
        if (path !== "/login") router.replace("/login");
      } else {
        setUserId(session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  const value: AppContextValue = {
    loading, userId, userName, role, branchId, branches, programs, rates,
    displayCurrency, setDisplayCurrency,
    refreshMeta: async () => { if (userId) await loadEverything(userId); },
    signOut: async () => { await supabase.auth.signOut(); router.replace("/login"); },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
