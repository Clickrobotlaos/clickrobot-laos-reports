"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Brand, Field } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.replace("/");
  }

  return (
    <div className="loginpage">
      <div className="loginbox">
        <div style={{ marginBottom: 20 }}><Brand /></div>
        <h1>Sign in</h1>
        <div className="sub">Enter the email and password given by your administrator.</div>
        <form onSubmit={submit}>
          <div className="frow">
            <Field label="Email">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password">
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </div>
          {error && <div className="banner bad">{error}</div>}
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}
