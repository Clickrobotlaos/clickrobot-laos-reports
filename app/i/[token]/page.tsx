"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { InvoiceDocument } from "../../invoices/InvoiceDocument";

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [invoice, setInvoice] = useState<any | null>(null);
  const [branchName, setBranchName] = useState("");
  const [programName, setProgramName] = useState("");
  const [company, setCompany] = useState<any>({ name: "ClickRobot Laos" });
  const [bank, setBank] = useState<any>({});
  const [terms, setTerms] = useState("Please pay within 7 days. Thank you.");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: inv } = await supabase.from("invoices").select("*").eq("share_token", token).maybeSingle();
      if (!inv) { setNotFound(true); return; }
      setInvoice(inv);
      const [b, p, settings] = await Promise.all([
        inv.branch_id ? supabase.from("branches").select("name").eq("id", inv.branch_id).single() : Promise.resolve({ data: null }),
        inv.program_id ? supabase.from("programs").select("name").eq("id", inv.program_id).single() : Promise.resolve({ data: null }),
        supabase.from("settings").select("key,value").in("key", ["company", "bank", "invoice_terms"]),
      ]);
      setBranchName(b.data?.name || "");
      setProgramName(p.data?.name || "");
      (settings.data || []).forEach((r: any) => {
        if (r.key === "company") setCompany(r.value || {});
        if (r.key === "bank") setBank(r.value || {});
        if (r.key === "invoice_terms" && typeof r.value === "string") setTerms(r.value);
      });
    })();
  }, [token]);

  if (notFound) return <div style={{ padding: 60, textAlign: "center" }}>
    <h2>Invoice not found</h2>
    <p style={{ color: "#666" }}>This link may be expired or incorrect. Please contact the school.</p>
  </div>;

  if (!invoice) return <div style={{ padding: 60, textAlign: "center" }}>Loading…</div>;

  return (
    <div style={{ background: "#F4F6F9", minHeight: "100vh", padding: "24px 12px" }}>
      <InvoiceDocument
        invoice={invoice}
        branchName={branchName}
        programName={programName}
        company={company}
        bank={bank}
        terms={terms}
        paid={invoice.status === "Paid"}
      />
    </div>
  );
}
