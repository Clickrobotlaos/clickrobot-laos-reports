"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCompanyPublic } from "@/lib/company";

export default function LoginPage() {
  const router = useRouter();
  const company = useCompanyPublic();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) router.replace("/"); });
  }, [router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.replace("/");
  }

  const name = company.name || "ClickRobot Laos";

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={signIn}>
        <div className="loginlogo">
          {company.logo_url ? (
            <img src={company.logo_url} alt={name} className="loginlogo-img"
                 onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div className="mark" style={{ width: 64, height: 64, borderRadius: 16 }} aria-hidden="true" />
          )}
        </div>
        <h1 style={{ fontSize: 22, margin: "12px 0 4px", textAlign: "center" }}>{name}</h1>
        <div style={{ color: "var(--ink2)", fontSize: 13, textAlign: "center", marginBottom: 22 }}>Report & Record System</div>

        <div className="field">
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>

        {err && <div className="banner bad">{err}</div>}

        <button className="btn" disabled={busy || !email || !pass} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink2)", textAlign: "center" }}>
          Contact your admin if you don&apos;t have an account.
        </div>
      </form>

      <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "var(--ink2)" }}>
        © {new Date().getFullYear()} ClickRobot Laos. All rights reserved.<br/>
        Developed by Vixaty Phompanya
      </div>

      <style>{`
        .loginwrap { display: grid; place-items: center; min-height: 100vh; padding: 20px; background: linear-gradient(180deg, #F5F7FB 0%, #E8ECF3 100%); }
        .loginbox { width: 100%; max-width: 400px; background: white; padding: 28px 24px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); }
        .loginlogo { text-align: center; }
        .loginlogo-img { width: 88px; height: 88px; border-radius: 20px; object-fit: cover; border: 1px solid var(--line); background: white; }
      `}</style>
    </div>
  );
}
