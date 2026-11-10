# ClickRobot Laos — Records + ClickRobot 360

> **ClickRobot 360 (Phase 0/1 slice)** lives at `/360`. Start with [docs/cr360/00_AUDIT_AND_BLOCKERS.md](docs/cr360/00_AUDIT_AND_BLOCKERS.md) — it lists **critical security issues in the live database** that need approval to fix. Setup: [docs/cr360/02_SETUP_DEPLOY.md](docs/cr360/02_SETUP_DEPLOY.md). Architecture: [docs/cr360/01_ARCHITECTURE_AND_ADRS.md](docs/cr360/01_ARCHITECTURE_AND_ADRS.md).

---

# Self-Edit Lock

When a co-admin (or any non-CEO user) edits their OWN profile, the following fields become **read-only**:
- 🔒 Role
- 🔒 Base salary
- 🔒 Salary currency

They can still edit everything else: personal info, contact, education, contract, address, bank, notes.

The CEO (`admin` role) is exempt — you can edit anything on your own profile.

## Files

```
self-lock-bundle/
└── app/staff/page.tsx        ← REPLACE
```

**No SQL needed.**

## Install

### Step 1 — Copy the file
Copy the `app` folder into `C:\Users\Vixat\clickrobot-records`.
Windows asks to replace 1 file → **Replace the files in the destination**.

### Step 2 — Refresh browser (Ctrl+Shift+R)

## Verify
- You (CEO): open your own profile → Edit → salary and role work normally (nothing changes for you)
- Douangmany logs in → opens her own profile → Edit → salary and role fields show 🔒 and are disabled
- Douangmany opens someone else's profile → she can edit everything including their salary

## Note
This adds both client-side (visual disabled + padlock icon) AND client-side value-guard (locked fields keep their original value even if forced). For strongest protection, a future DB trigger could enforce this at the database level too.
