"use client";
import { useState } from "react";
import { fmt } from "@/lib/util";

export function publicInvoiceUrl(token: string) {
  if (typeof window === "undefined") return `/i/${token}`;
  return `${window.location.origin}/i/${token}`;
}

export function buildWhatsAppText(invoice: any, ctx: {
  branchName: string; programName: string;
  company: any; bank: any; terms: string; shareUrl: string;
}) {
  const paid = invoice.status === "Paid";
  const header = paid ? `Receipt from ${ctx.company.name || "ClickRobot Laos"}` : `Invoice from ${ctx.company.name || "ClickRobot Laos"}`;
  const bankLines = ctx.bank?.bank_name ? `
How to pay:
Bank: ${ctx.bank.bank_name}
Account name: ${ctx.bank.account_name || ""}
Account no: ${ctx.bank.account_no || ""}` : "";
  const terms = ctx.terms && !paid ? `\n\n${ctx.terms}` : "";
  return `${header}

Invoice #: ${invoice.invoice_no}
Date: ${invoice.date}${paid ? "" : `\nDue: ${invoice.due_date}`}
Branch: ${ctx.branchName}

Student: ${invoice.student_name}
Parent: ${invoice.parent_name || "—"}
Program: ${ctx.programName}
Package: ${invoice.package || "—"}${invoice.sessions ? ` (${invoice.sessions} sessions)` : ""}

Amount: ${fmt(invoice.amount, invoice.currency)} ${invoice.currency}
Equivalent: ${fmt(invoice.amount_lak)} LAK

Status: ${invoice.status}${paid && invoice.payment_method ? ` (${invoice.payment_method})` : ""}${bankLines}${terms}

View / print: ${ctx.shareUrl}`;
}

export function InvoiceDocument({ invoice, branchName, programName, company, bank, terms, paid }: {
  invoice: any; branchName: string; programName: string;
  company: any; bank: any; terms: string; paid: boolean;
}) {
  const [copies, setCopies] = useState(1);
  const css = `
        .doc { background:#fff; color:#111; border:1px solid #ddd; border-radius:12px; padding:28px; max-width:780px; margin:0 auto; position:relative; }
        .doc h1 { font-size:22px; margin-bottom:2px }
        .doc .muted { color:#666; font-size:13px }
        .doc .row { display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap }
        .doc .row .col { flex:1; min-width:220px }
        .doc .title { font-family:'Space Grotesk',sans-serif; font-size:26px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#182136 }
        .doc table { width:100%; border-collapse:collapse; margin-top:18px }
        .doc th { text-align:left; background:#F8FAFD; padding:10px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#5A6478; border-bottom:1px solid #eee }
        .doc td { padding:12px; border-bottom:1px solid #f0f0f0; vertical-align:top }
        .doc td.num { text-align:right; font-variant-numeric:tabular-nums }
        .doc .total { font-size:18px; font-weight:700 }
        .doc .stamp {
          position:absolute; top:80px; right:40px;
          border:5px solid #17804C; color:#17804C;
          font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:38px;
          padding:6px 24px; border-radius:8px; transform:rotate(-14deg);
          opacity:.85; letter-spacing:0.06em; pointer-events:none;
        }
        .doc .sig { display:flex; gap:24px; margin-top:36px }
        .doc .sig div { flex:1; text-align:center; font-size:13px; color:#444 }
        .doc .sig div span { display:block; border-top:1.5px solid #999; margin-top:38px; padding-top:6px }
        .doc .payinfo { background:#F5F7FB; border:1px solid #E3E7EE; border-radius:8px; padding:12px; margin-top:16px; font-size:13.5px }
        .doc .payinfo b { color:#182136 }
        .doc .qr { text-align:right }
        .doc .qr img { max-width:140px; border:1px solid #E3E7EE; border-radius:6px; padding:4px; background:#fff }
        @media print {
          @page { size: A4 portrait; margin: 8mm }
          body * { visibility:hidden !important }
          .printarea, .printarea * { visibility:visible !important }
          .printarea { position:absolute; top:0; left:0; width:100% }
          .doc { border:none; box-shadow:none; margin:0 auto; max-width:none; page-break-inside:avoid }

          /* 1 copy — full size */
          .printarea.copies-1 .doc { padding:16px }

          /* 2 copies — each scaled to fit half of A4 (~138mm each) */
          .printarea.copies-2 { display:flex; flex-direction:column }
          .printarea.copies-2 .copywrap { height:135mm; overflow:hidden; display:flex; align-items:flex-start; justify-content:center }
          .printarea.copies-2 .doc { transform:scale(0.60); transform-origin:top center; padding:10px; width:166% }

          /* 3 copies — each scaled to fit a third of A4 (~90mm each) */
          .printarea.copies-3 { display:flex; flex-direction:column }
          .printarea.copies-3 .copywrap { height:89mm; overflow:hidden; display:flex; align-items:flex-start; justify-content:center }
          .printarea.copies-3 .doc { transform:scale(0.40); transform-origin:top center; padding:6px; width:250% }

          .cutline { display:block !important; border-top:2px dashed #999; margin:0; text-align:center; color:#999; font-size:9px; line-height:1; height:4mm }
          .noprint { display:none !important }
        }
        .cutline { display:none }
        .copywrap { display:contents }
        @media print { .copywrap { display:flex } .printarea.copies-1 .copywrap { display:block; height:auto } }
      `;

  const docBody = (
      <div className="doc">
        {paid && <div className="stamp">PAID</div>}

        <div className="row">
          <div className="col">
            {company.logo_url ? <img src={company.logo_url} alt="" style={{ maxHeight: 60, marginBottom: 8 }} /> : null}
            <h1 style={{ margin: 0 }}>{company.name || "ClickRobot Laos"}</h1>
            <div className="muted">
              {company.address && <>{company.address}<br /></>}
              {company.phone && <>Phone: {company.phone}<br /></>}
              {company.email && <>Email: {company.email}<br /></>}
              {company.tax_id && <>Tax ID: {company.tax_id}</>}
            </div>
          </div>
          <div className="col" style={{ textAlign: "right" }}>
            <div className="title">{paid ? "Receipt" : "Invoice"}</div>
            <div style={{ marginTop: 8, fontSize: 14 }}>
              <div><b>{invoice.invoice_no}</b></div>
              <div>Date: {invoice.date}</div>
              {!paid && <div>Due: {invoice.due_date}</div>}
              {paid && invoice.paid_at && <div>Paid: {new Date(invoice.paid_at).toLocaleDateString()}</div>}
              <div>Branch: {branchName}</div>
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 22 }}>
          <div className="col">
            <div className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>Bill to</div>
            <div><b>{invoice.parent_name || invoice.student_name}</b></div>
            {invoice.parent_name && <div className="muted">Student: {invoice.student_name}</div>}
            {invoice.phone && <div className="muted">Phone: {invoice.phone}</div>}
          </div>
          <div className="col">
            <div className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>Enrolment</div>
            <div><b>{programName}</b></div>
            {invoice.package && <div className="muted">{invoice.package}{invoice.sessions ? ` · ${invoice.sessions} sessions` : ""}</div>}
            <div className="muted">Type: {invoice.payment_type}</div>
          </div>
        </div>

        <table>
          <thead><tr>
            <th>Description</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>
                <b>{programName}</b><br />
                <span className="muted">{invoice.package || ""}{invoice.sessions ? ` · ${invoice.sessions} sessions` : ""}</span>
                {invoice.notes ? <><br /><span className="muted">Note: {invoice.notes}</span></> : null}
              </td>
              <td className="num">{fmt(invoice.amount, invoice.currency)} {invoice.currency}</td>
            </tr>
            <tr>
              <td className="total" style={{ textAlign: "right" }}>Total</td>
              <td className="num total">{fmt(invoice.amount, invoice.currency)} {invoice.currency}</td>
            </tr>
            {invoice.currency !== "LAK" && (
              <tr>
                <td className="muted" style={{ textAlign: "right" }}>Equivalent in LAK (rate {fmt(invoice.rate_to_lak)})</td>
                <td className="num muted">{fmt(invoice.amount_lak)} LAK</td>
              </tr>
            )}
          </tbody>
        </table>

        {!paid && (bank?.bank_name || bank?.qr_url) && (
          <div className="payinfo">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div>
                <b>How to pay</b><br />
                {bank.bank_name && <>Bank: {bank.bank_name}<br /></>}
                {bank.account_name && <>Account name: {bank.account_name}<br /></>}
                {bank.account_no && <>Account no: {bank.account_no}<br /></>}
              </div>
              {bank.qr_url && (
                <div className="qr"><img src={bank.qr_url} alt="Payment QR" /></div>
              )}
            </div>
          </div>
        )}

        {!paid && terms && <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>{terms}</div>}
        {paid && invoice.payment_method && <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>Payment method: {invoice.payment_method}</div>}

        <div className="sig">
          <div><span>{paid ? "Received by (staff)" : "Prepared by"}</span></div>
          <div><span>{paid ? "Parent signature" : "Parent signature"}</span></div>
        </div>
      </div>
  );

  return (
    <>
      <style>{css}</style>

      <div className={"printarea copies-" + copies}>
        <div className="copywrap">{docBody}</div>
        {copies >= 2 && <>
          <div className="cutline">✂ — — — — — — — — — — — — — — — — — — — —</div>
          <div className="copywrap">{docBody}</div>
        </>}
        {copies >= 3 && <>
          <div className="cutline">✂ — — — — — — — — — — — — — — — — — — — —</div>
          <div className="copywrap">{docBody}</div>
        </>}
      </div>

      <div className="btnrow noprint" style={{ justifyContent: "center", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--ink2)" }}>Copies per page:</span>
          {[1, 2, 3].map((n) => (
            <button key={n} className={"btn sm " + (copies === n ? "" : "ghost")} onClick={() => setCopies(n)}
              style={{ minWidth: 42 }}>{n}</button>
          ))}
        </div>
        <button className="btn" onClick={() => window.print()}>🖨️ Print / Export PDF</button>
      </div>
    </>
  );
}
