/**
 * Parent-report helpers (pure, no I/O).
 * PRIVACY: nothing that identifies a child leaves the server. The AI request carries only the lesson
 * content, rubric scores and the teacher's notes with every known child name removed; students are
 * referred to as S1, S2, … and the reply is mapped back locally. Reports say "your child" /
 * "ລູກຂອງທ່ານ" — the parent already knows which child it is.
 */
export const RUBRIC_SKILLS = ["problem_solving", "programming", "mechanics", "teamwork"] as const;
export type RubricSkill = (typeof RUBRIC_SKILLS)[number];
export type Rubric = Partial<Record<RubricSkill, 1 | 2 | 3 | 4>>;

export const SKILL_LABELS: Record<RubricSkill, { en: string; lo: string }> = {
  problem_solving: { en: "problem solving", lo: "ການແກ້ໄຂບັນຫາ" },
  programming: { en: "programming", lo: "ການຂຽນໂປຣແກຣມ" },
  mechanics: { en: "building & mechanics", lo: "ການປະກອບ ແລະ ກົນໄກ" },
  teamwork: { en: "teamwork", lo: "ການເຮັດວຽກເປັນທີມ" },
};

export const SCORE_LABELS: Record<1 | 2 | 3 | 4, { en: string; lo: string }> = {
  1: { en: "beginning", lo: "ກຳລັງເລີ່ມຕົ້ນ" },
  2: { en: "developing", lo: "ກຳລັງພັດທະນາ" },
  3: { en: "confident", lo: "ໝັ້ນໃຈ" },
  4: { en: "excellent", lo: "ດີເລີດ" },
};

export interface LessonInfo { unit: string | null; lesson_title: string; level: string | null; covered: string | null; next_plan: string | null }
export interface StudentInput { packageId: string; name: string; rubric: Rubric; teacherNote: string | null; attendance: "Present" | "Absent" | null }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remove every given name (and each word of it, 2+ chars) from free text. Works for Lao and Latin script. */
export function scrubNames(text: string | null, names: string[]): string | null {
  if (!text) return text;
  const parts = new Set<string>();
  for (const n of names) {
    const full = n.trim();
    if (full.length >= 2) parts.add(full);
    for (const w of full.split(/\s+/)) if (w.length >= 2) parts.add(w);
  }
  let out = text;
  // Longest first so "Test Child" is replaced before "Test".
  for (const p of [...parts].sort((a, b) => b.length - a.length)) out = out.replace(namePattern(p, "giu"), "[child]");
  return out;
}

/**
 * Contact and identity details that must never reach an external AI service, whoever they belong to:
 * e-mail addresses, web links, phone numbers, ID / account / student codes and calendar dates
 * (a date in a note may be a birthday). Applied to EVERY free-text field after name removal.
 */
const PII_PATTERNS: [RegExp, string][] = [
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, "[email]"],
  [/\b(?:https?:\/\/|www\.)\S+/giu, "[link]"],
  [/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/gu, "[date]"],
  [/(?:\+?\d[\d\s().-]{6,}\d)/gu, "[number]"],
  [/\b[A-Z]{2,5}[-_ ]?\d{2,}\b/gu, "[code]"],
  [/\b\d{5,}\b/gu, "[number]"],
];
export function scrubPII(text: string | null): string | null {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of PII_PATTERNS) out = out.replace(re, rep);
  return out;
}
/** True if any contact/ID-like detail is present (pre-send check). */
export function containsPII(text: string): boolean {
  return PII_PATTERNS.some(([re]) => new RegExp(re.source, re.flags.replace("g", "")).test(text));
}

/**
 * Latin-script names match whole words only ("An" must not hit "and"). Lao is written without spaces
 * between words, so Lao names match as substrings — erring towards removing too much, never too little.
 */
function namePattern(p: string, flags: string): RegExp {
  const latin = /^[\p{Script=Latin}\p{N}.'-]+$/u.test(p.replace(/\s+/g, ""));
  return latin ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, flags) : new RegExp(escapeRe(p), flags);
}

export function isValidRubric(r: unknown): r is Rubric {
  if (!r || typeof r !== "object" || Array.isArray(r)) return false;
  return Object.entries(r as Record<string, unknown>).every(([k, v]) => (RUBRIC_SKILLS as readonly string[]).includes(k) && [1, 2, 3, 4].includes(v as number));
}

export interface DraftRequest {
  lesson: LessonInfo;
  students: { ref: string; attendance: "Present" | "Absent" | null; rubric: Rubric; teacher_note: string | null }[];
  refs: Record<string, string>; // ref → packageId (never sent)
}

/**
 * Build the de-identified payload. Every name of every student given — plus `otherNames` (the rest of
 * the class) — is scrubbed from every note and from the lesson text.
 */
export function buildDraftRequest(lesson: LessonInfo, students: StudentInput[], otherNames: string[] = []): DraftRequest {
  const allNames = [...students.map((s) => s.name), ...otherNames];
  const refs: Record<string, string> = {};
  // Contact / ID details first (an e-mail like "kham@…" must go whole), then names (children,
  // classmates, guardians). Applied to every free-text field, titles included.
  const scrub = (t: string | null) => scrubNames(scrubPII(t), allNames);
  const out = students.map((s, i) => {
    const ref = `S${i + 1}`;
    refs[ref] = s.packageId;
    return { ref, attendance: s.attendance, rubric: s.rubric, teacher_note: scrub(s.teacherNote) };
  });
  return {
    lesson: {
      unit: scrub(lesson.unit), lesson_title: scrub(lesson.lesson_title) ?? "", level: scrub(lesson.level),
      covered: scrub(lesson.covered), next_plan: scrub(lesson.next_plan),
    },
    students: out,
    refs,
  };
}

/** True if any known name survives in a string (defence-in-depth check before sending). */
export function containsAnyName(text: string, names: string[]): boolean {
  return names.some((n) => n.trim().split(/\s+/).some((w) => w.length >= 2 && namePattern(w, "iu").test(text)));
}

export interface Draft { en: string; lo: string }

/** Map validated AI output back to packages; drop unknown refs, keep only non-empty texts within limits. */
export function mapDrafts(reports: { ref: string; en: string; lo: string }[], refs: Record<string, string>): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const r of reports) {
    const pkg = refs[r.ref];
    if (!pkg || out[pkg]) continue;
    const en = r.en.trim().slice(0, 3000), lo = r.lo.trim().slice(0, 3000);
    if (en || lo) out[pkg] = { en, lo };
  }
  return out;
}

/** Deterministic report (no AI) from the lesson and rubric — useful offline or without an API key. */
export function templateReport(lesson: LessonInfo, rubric: Rubric, attendance: "Present" | "Absent" | null): Draft {
  const topic = [lesson.unit, lesson.lesson_title].filter(Boolean).join(" — ");
  if (attendance === "Absent") {
    return {
      en: `Your child missed today's class (${topic}). We will help them catch up next time${lesson.next_plan ? `; next we will work on: ${lesson.next_plan}` : ""}.`,
      lo: `ມື້ນີ້ລູກຂອງທ່ານບໍ່ໄດ້ເຂົ້າຮຽນ (${topic}). ພວກເຮົາຈະຊ່ວຍໃຫ້ຕາມທັນໃນຄັ້ງໜ້າ${lesson.next_plan ? `; ຄັ້ງໜ້າຈະຮຽນ: ${lesson.next_plan}` : ""}.`,
    };
  }
  const skills = RUBRIC_SKILLS.filter((k) => rubric[k] !== undefined);
  const strong = skills.filter((k) => (rubric[k] ?? 0) >= 3);
  const growing = skills.filter((k) => (rubric[k] ?? 5) <= 2);
  const list = (ks: RubricSkill[], lang: "en" | "lo") => ks.map((k) => SKILL_LABELS[k][lang]).join(lang === "en" ? ", " : ", ");
  const en = [
    `Today your child worked on ${topic}${lesson.level ? ` (${lesson.level})` : ""}.`,
    strong.length ? `They showed strength in ${list(strong, "en")}.` : "",
    growing.length ? `We will keep practising ${list(growing, "en")}.` : "",
    lesson.next_plan ? `Next class: ${lesson.next_plan}.` : "",
  ].filter(Boolean).join(" ");
  const lo = [
    `ມື້ນີ້ລູກຂອງທ່ານໄດ້ຮຽນ ${topic}${lesson.level ? ` (${lesson.level})` : ""}.`,
    strong.length ? `ລູກເຮັດໄດ້ດີໃນດ້ານ ${list(strong, "lo")}.` : "",
    growing.length ? `ພວກເຮົາຈະຝຶກຕໍ່ໃນດ້ານ ${list(growing, "lo")}.` : "",
    lesson.next_plan ? `ຄັ້ງໜ້າ: ${lesson.next_plan}.` : "",
  ].filter(Boolean).join(" ");
  return { en, lo };
}
