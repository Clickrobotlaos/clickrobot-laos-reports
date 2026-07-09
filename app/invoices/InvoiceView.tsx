"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { supabase } from "@/lib/supabase";
import { Sel } from "@/components/ui";
import { PERMS, PAYMENT_METHODS, fmt, todayStr, copyText, toLAK } from "@/lib/util";
import { InvoiceDocument, buildWhatsAppText, publicInvoiceUrl } from "./InvoiceDocument";

export function InvoiceView({ invoice, onBack, onChanged }: {
  invoice: any; onBack: () => void; onChanged: (row: any) => void;
}) {
  const app = useApp();
  const can = PERMS[app.role];
  const [company, setCompany] = useState<any>({ name: "ClickRobot Laos" });
  const [bank, setBank] = useState<any>({});
  const [terms, setTerms] = useState<string>("Please pay within 7 days. Thank you.");
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("settings").select("key,value").in("key", ["company", "bank", "invoice_terms"]).then(({ data }) => {
      (data || []).forEach((r: any) => {
        if (r.key === "company") setCompany(r.value || {});
        if (r.key === "bank") setBank(r.value || {});
        if (r.key === "invoice_terms" && typeof r.value === "string") setTerms(r.value);
      });
    });
  }, []);

  const branchName = app.branches.find((b) => b.id === invoice.branch_id)?.name || "";
  const programName = app.programs.find((p) => p.id === invoice.program_id)?.name || "";

  async function markPaid() {
    setBusy(true); setErr("");

    // 1. Insert income record — linked to invoice both ways
    const { data: inc, error: incErr } = await supabase.from("income_records").insert({
      date: todayStr(), receipt_no: invoice.invoice_no,
      branch_id: invoice.branch_id, received_by: app.userId,
      student_name: invoice.student_name, parent_name: invoice.parent_name, phone: invoice.phone,
      program_id: invoice.program_id, payment_type: invoice.payment_type,
      package: invoice.package,
      amount: invoice.amount, currency: invoice.currency, rate_to_lak: invoice.rate_to_lak,
      amount_lak: invoice.amount_lak, unpaid_lak: 0,
      payment_method: payMethod, notes: `Auto-created from invoice ${invoice.invoice_no}`,
      invoice_id: invoice.id,
      created_by: app.userId,
    }).select("id").single();
    if (incErr) { setErr(incErr.message); setBusy(false); return; }

    // 2. Insert student registration record (unless one already exists for this invoice)
    const { data: existing } = await supabase.from("student_records").select("id").eq("invoice_id", invoice.id).maybeSingle();
    if (!existing) {
      const studentType: string = invoice.payment_type === "Extension" ? "Extension"
        : invoice.payment_type === "Trial Fee" ? "Trial"
        : "New";
      await supabase.from("student_records").insert({
        date: todayStr(), branch_id: invoice.branch_id,
        student_name: invoice.student_name, parent_name: invoice.parent_name, phone: invoice.phone,
        program_id: invoice.program_id, student_type: studentType,
        package: invoice.package, quantity: 1,
        trial_status: studentType === "Trial" ? "Scheduled" : "-",
        converted: false,
        amount: invoice.amount, currency: invoice.currency, rate_to_lak: invoice.rate_to_lak,
        amount_lak: invoice.amount_lak,
        notes: `Auto-created from invoice ${invoice.invoice_no}`,
        invoice_id: invoice.id,
        created_by: app.userId,
      });
    }

    // 3. Update invoice status
    const { data: updated, error: updErr } = await supabase.from("invoices").update({
      status: "Paid", paid_at: new Date().toISOString(),
      paid_by: app.userId, payment_method: payMethod,
      income_id: inc.id,
    }).eq("id", invoice.id).select("*").single();
    setBusy(false);
    if (updErr) { setErr(updErr.message); return; }
    if (updated) onChanged(updated);
    setShowPay(false);
  }

  async function markStatus(status: "Sent" | "Cancelled" | "Draft") {
    const { data, error } = await supabase.from("invoices").update({ status }).eq("id", invoice.id).select("*").single();
    if (error) { alert(error.message); return; }
    if (data) onChanged(data);
  }

  const isPaid = invoice.status === "Paid";
  const shareUrl = publicInvoiceUrl(invoice.share_token);
  const waText = buildWhatsAppText(invoice, { branchName, programName, company, bank, terms, shareUrl });
  const waPhone = (invoice.phone || "").replace(/[^0-9]/g, "");
  const waHref = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`
                         : `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div>
      <button className="btn sm ghost" onClick={onBack}>← Back to invoices</button>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3>{invoice.invoice_no} · {invoice.parent_name || invoice.student_name} <span className={"pill " + invoice.status}>{invoice.status}</span></h3>
          {can.addRecords && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {invoice.status === "Draft" && <button className="btn sm" onClick={() => markStatus("Sent")}>Mark as sent</button>}
              {invoice.status !== "Paid" && invoice.status !== "Cancelled" && (
                <button className="btn sm ok" onClick={() => setShowPay(true)}>Mark as paid</button>
              )}
              {invoice.status !== "Paid" && invoice.status !== "Cancelled" && (
                <button className="btn sm ghost" onClick={() => markStatus("Cancelled")}>Cancel</button>
              )}
            </div>
          )}
        </div>

        {showPay && (
          <div className="banner ok" style={{ display: "block", marginTop: 12 }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Confirm payment received</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>Payment method:</span>
              <div style={{ maxWidth: 220 }}><Sel value={payMethod} options={PAYMENT_METHODS} onChange={setPayMethod} /></div>
              <button className="btn sm ok" disabled={busy} onClick={markPaid}>{busy ? "Saving…" : "Confirm & record income"}</button>
              <button className="btn sm ghost" onClick={() => setShowPay(false)}>Cancel</button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              Two records will be created automatically:<br/>
              • Income record (receipt no. <b>{invoice.invoice_no}</b>)<br/>
              • Student registration record ({invoice.payment_type === "Extension" ? "Extension" : invoice.payment_type === "Trial Fee" ? "Trial" : "New"} student)
            </div>
          </div>
        )}

        {err && <div className="banner bad">{err}</div>}

        {isPaid && (
          <div className="banner ok" style={{ marginTop: 12 }}>
            ✓ Paid on {new Date(invoice.paid_at).toLocaleDateString()} via {invoice.payment_method}.
            Linked income & student records were auto-created. Receipt is available below.
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>WhatsApp message</h3>
          <div className="msgbox">{waText}</div>
          <div className="btnrow">
            <button className="btn sm ghost" onClick={() => copyText(waText)}>Copy message</button>
            <a className="btn sm wa" href={waHref} target="_blank" rel="noreferrer">
              {waPhone ? `Send to ${invoice.phone}` : "Open WhatsApp"}
            </a>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Parent can tap the link inside to view the invoice as a webpage (no login needed).</div>
        </div>

        <div className="panel">
          <h3>Public link</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input readOnly value={shareUrl} onClick={(e) => (e.target as HTMLInputElement).select()} />
            <button className="btn sm ghost" onClick={() => copyText(shareUrl)}>Copy link</button>
            <a className="btn sm ghost" href={shareUrl} target="_blank" rel="noreferrer">Preview</a>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>Anyone with this link can view the invoice. The token is random and unique.</div>
        </div>
      </div>

      <div className="panel">
        <h3>Printable {isPaid ? "receipt" : "invoice"}</h3>
        <InvoiceDocument invoice={invoice} branchName={branchName} programName={programName}
                         company={company} bank={bank} terms={terms} paid={isPaid} />
      </div>
    </div>
  );
}
