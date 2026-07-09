"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";

export default function ProfilePage() {
  const app = useApp();
  const router = useRouter();
  useEffect(() => {
    if (!app.loading && app.userId) router.replace(`/staff/${app.userId}`);
    else if (!app.loading && !app.userId) router.replace("/login");
  }, [app.loading, app.userId, router]);
  return <div style={{ padding: 40 }}>Loading…</div>;
}
