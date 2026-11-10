/**
 * Lao / English dictionaries. Lao strings are a first pass and MUST be reviewed
 * by a native Lao speaker on staff before launch (tracked in docs/cr360/00_AUDIT_AND_BLOCKERS.md).
 */
export type Locale = "en" | "lo";
export const LOCALES: Locale[] = ["en", "lo"];
export const LOCALE_COOKIE = "cr360_locale";

const en = {
  app: "ClickRobot 360",
  tagline: "Management System",
  language: "Language",
  signOut: "Sign out",
  signIn: "Sign in",
  loading: "Loading…",
  home: "Overview",
  ws_ceo: "CEO",
  ws_manager: "Manager",
  ws_staff: "My StaffOS",
  ws_parent: "Parent",
  ws_finance: "Finance",
  ws_schools: "Schools & Franchise",
  legacy: "Legacy Records app",
  unauthorized: "You do not have access to this workspace.",
  unauthorizedHint: "Access is granted by an administrator through a membership record. Changing the URL does not grant access.",
  noMembership: "Your account has no ClickRobot 360 membership yet.",
  noMembershipHint: "Ask the CEO or HR to provision your membership. Until then you can keep using the legacy Records app.",
  notConnected: "Not yet connected",
  plannedPhase: "Planned for",
  blockedBy: "Blocked by",
  // staff
  myShifts: "My shifts (next 7 days)",
  noShifts: "No scheduled shifts.",
  attendancePct: "Attendance (last 30 days)",
  attendanceHint: "Shifts with a check-in ÷ scheduled shifts that have ended.",
  timeClock: "Time clock",
  checkIn: "Check in",
  checkOut: "Check out",
  gpsAsk: "Your location is read once, only when you tap. No background tracking.",
  gpsAccuracy: "Measured accuracy",
  gpsThreshold: "Required ≤ 10 m",
  gpsUnavailable: "Location unavailable on this device. Submit an attendance correction instead.",
  recentPunches: "Recent punches",
  noPunches: "No punches yet.",
  serverTime: "Server time",
  requests: "My requests",
  noRequests: "No requests yet.",
  leave: "Leave",
  ot: "Overtime",
  correction: "Attendance correction",
  type: "Type",
  startDate: "Start date",
  endDate: "End date",
  date: "Date",
  minutes: "Minutes",
  reason: "Reason",
  submit: "Submit",
  submitting: "Submitting…",
  submitted: "Submitted — waiting for review.",
  status: "Status",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  moneyHidden: "Salary, bonus and deductions are not shown in StaffOS.",
  // manager
  branchStaff: "Branch staff",
  pendingQueue: "Pending requests",
  approvalsPending: "Approve / reject needs migration 0004 (audited decision RPC). Read-only for now.",
  // ceo
  kpis: "Key figures",
  asOf: "As of",
  activePackages: "Active packages",
  lowSessions: "Packages ≤ 2 sessions",
  attendanceToday: "Student attendance today",
  openLeads: "Open leads",
  unpaidInvoices: "Unpaid invoices",
  byBranch: "By branch",
  sourceNote: "Live counts from the existing Records tables, read with your own permissions.",
  // errors
  err_low_accuracy: "GPS accuracy is worse than 10 m. Move outdoors/near the entrance or request a correction.",
  err_site_disabled: "GPS check-in is not enabled for your branch yet (entrance not verified on site). Request a correction.",
  err_outside_zone: "You appear to be outside the 10 m entrance zone. No penalty is applied; request a correction if this is wrong.",
  err_sequence_invalid: "Check-in/out order is invalid (already checked in, or no open check-in).",
  err_not_employee: "Your account is not linked to an active employee record.",
  err_unauthenticated: "Please sign in again.",
  err_validation: "Please check the form fields.",
  err_server_error: "Something went wrong. Nothing was recorded.",
  ok_clock: "Recorded with server timestamp.",
} as const;

export type DictKey = keyof typeof en;
export type Dict = Record<DictKey, string>;

const lo: Dict = {
  app: "ClickRobot 360",
  tagline: "ລະບົບບໍລິຫານ",
  language: "ພາສາ",
  signOut: "ອອກຈາກລະບົບ",
  signIn: "ເຂົ້າສູ່ລະບົບ",
  loading: "ກຳລັງໂຫຼດ…",
  home: "ພາບລວມ",
  ws_ceo: "ຜູ້ບໍລິຫານ",
  ws_manager: "ຜູ້ຈັດການ",
  ws_staff: "StaffOS ຂອງຂ້ອຍ",
  ws_parent: "ຜູ້ປົກຄອງ",
  ws_finance: "ການເງິນ",
  ws_schools: "ໂຮງຮຽນ ແລະ ແຟຣນໄຊ",
  legacy: "ແອັບບັນທຶກເກົ່າ",
  unauthorized: "ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້.",
  unauthorizedHint: "ສິດເຂົ້າເຖິງຖືກມອບໃຫ້ໂດຍຜູ້ດູແລລະບົບ. ການປ່ຽນ URL ບໍ່ໄດ້ໃຫ້ສິດເພີ່ມ.",
  noMembership: "ບັນຊີຂອງທ່ານຍັງບໍ່ມີສິດສະມາຊິກ ClickRobot 360.",
  noMembershipHint: "ກະລຸນາຂໍໃຫ້ CEO ຫຼື HR ເປີດສິດໃຫ້. ລະຫວ່າງນີ້ທ່ານຍັງໃຊ້ແອັບບັນທຶກເກົ່າໄດ້.",
  notConnected: "ຍັງບໍ່ໄດ້ເຊື່ອມຕໍ່",
  plannedPhase: "ກຳນົດໄວ້ໃນ",
  blockedBy: "ຕິດຂັດຍ້ອນ",
  myShifts: "ກະວຽກຂອງຂ້ອຍ (7 ວັນຂ້າງໜ້າ)",
  noShifts: "ບໍ່ມີກະວຽກທີ່ກຳນົດໄວ້.",
  attendancePct: "ການມາວຽກ (30 ວັນຜ່ານມາ)",
  attendanceHint: "ກະທີ່ມີການລົງເວລາເຂົ້າ ÷ ກະທີ່ສິ້ນສຸດແລ້ວ.",
  timeClock: "ລົງເວລາ",
  checkIn: "ລົງເວລາເຂົ້າ",
  checkOut: "ລົງເວລາອອກ",
  gpsAsk: "ລະບົບອ່ານສະຖານທີ່ພຽງຄັ້ງດຽວເມື່ອທ່ານກົດເທົ່ານັ້ນ. ບໍ່ມີການຕິດຕາມຢູ່ເບື້ອງຫຼັງ.",
  gpsAccuracy: "ຄວາມແມ່ນຍຳທີ່ວັດໄດ້",
  gpsThreshold: "ຕ້ອງການ ≤ 10 ແມັດ",
  gpsUnavailable: "ອຸປະກອນນີ້ບໍ່ສາມາດອ່ານສະຖານທີ່ໄດ້. ກະລຸນາສົ່ງຄຳຂໍແກ້ໄຂເວລາແທນ.",
  recentPunches: "ການລົງເວລາຫຼ້າສຸດ",
  noPunches: "ຍັງບໍ່ມີການລົງເວລາ.",
  serverTime: "ເວລາເຊີບເວີ",
  requests: "ຄຳຂໍຂອງຂ້ອຍ",
  noRequests: "ຍັງບໍ່ມີຄຳຂໍ.",
  leave: "ລາພັກ",
  ot: "ລ່ວງເວລາ",
  correction: "ຂໍແກ້ໄຂເວລາ",
  type: "ປະເພດ",
  startDate: "ວັນທີເລີ່ມ",
  endDate: "ວັນທີສິ້ນສຸດ",
  date: "ວັນທີ",
  minutes: "ນາທີ",
  reason: "ເຫດຜົນ",
  submit: "ສົ່ງ",
  submitting: "ກຳລັງສົ່ງ…",
  submitted: "ສົ່ງແລ້ວ — ລໍຖ້າການກວດສອບ.",
  status: "ສະຖານະ",
  pending: "ລໍຖ້າ",
  approved: "ອະນຸມັດແລ້ວ",
  rejected: "ປະຕິເສດ",
  cancelled: "ຍົກເລີກ",
  moneyHidden: "ເງິນເດືອນ, ໂບນັດ ແລະ ການຫັກເງິນ ບໍ່ສະແດງໃນ StaffOS.",
  branchStaff: "ພະນັກງານສາຂາ",
  pendingQueue: "ຄຳຂໍທີ່ລໍຖ້າ",
  approvalsPending: "ການອະນຸມັດ/ປະຕິເສດ ຕ້ອງການ migration 0004. ຕອນນີ້ເບິ່ງໄດ້ຢ່າງດຽວ.",
  kpis: "ຕົວເລກສຳຄັນ",
  asOf: "ຂໍ້ມູນ ณ",
  activePackages: "ແພັກເກດທີ່ໃຊ້ງານ",
  lowSessions: "ແພັກເກດເຫຼືອ ≤ 2 ຄັ້ງ",
  attendanceToday: "ນັກຮຽນມາຮຽນມື້ນີ້",
  openLeads: "ລູກຄ້າເປົ້າໝາຍທີ່ເປີດຢູ່",
  unpaidInvoices: "ໃບແຈ້ງໜີ້ຍັງບໍ່ຈ່າຍ",
  byBranch: "ຕາມສາຂາ",
  sourceNote: "ຕົວເລກສົດຈາກຕາຕະລາງບັນທຶກເດີມ, ອ່ານດ້ວຍສິດຂອງທ່ານເອງ.",
  err_low_accuracy: "ຄວາມແມ່ນຍຳ GPS ເກີນ 10 ແມັດ. ກະລຸນາເຂົ້າໃກ້ທາງເຂົ້າ ຫຼື ສົ່ງຄຳຂໍແກ້ໄຂ.",
  err_site_disabled: "ສາຂາຂອງທ່ານຍັງບໍ່ເປີດໃຊ້ GPS (ຍັງບໍ່ໄດ້ຢືນຢັນທາງເຂົ້າ). ກະລຸນາສົ່ງຄຳຂໍແກ້ໄຂ.",
  err_outside_zone: "ທ່ານຢູ່ນອກເຂດ 10 ແມັດ. ບໍ່ມີການລົງໂທດ; ສົ່ງຄຳຂໍແກ້ໄຂຖ້າບໍ່ຖືກຕ້ອງ.",
  err_sequence_invalid: "ລຳດັບເຂົ້າ/ອອກ ບໍ່ຖືກຕ້ອງ.",
  err_not_employee: "ບັນຊີຂອງທ່ານບໍ່ໄດ້ເຊື່ອມກັບພະນັກງານທີ່ເຮັດວຽກຢູ່.",
  err_unauthenticated: "ກະລຸນາເຂົ້າສູ່ລະບົບອີກຄັ້ງ.",
  err_validation: "ກະລຸນາກວດສອບຂໍ້ມູນໃນແບບຟອມ.",
  err_server_error: "ເກີດຂໍ້ຜິດພາດ. ບໍ່ມີຫຍັງຖືກບັນທຶກ.",
  ok_clock: "ບັນທຶກແລ້ວດ້ວຍເວລາເຊີບເວີ.",
};

const DICTS: Record<Locale, Dict> = { en, lo };

export function dict(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}

export function parseLocale(v: string | undefined | null): Locale {
  return v === "lo" ? "lo" : "en";
}

export const BUSINESS_TZ = "Asia/Vientiane";

/** Business date (YYYY-MM-DD) in Asia/Vientiane for a UTC instant. */
export function businessDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", {
    timeZone: BUSINESS_TZ, dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));
}
