import {
  BANDS,
  GRADES,
  MAX_FIRST_YEAR_UNITS,
  MIN_ADVANCED_UNITS,
  SSAF_CENTS,
  STANDARD_LOAD,
  TERMS,
  TERM_ORDER,
  coursePriceCents,
} from "./catalog";
import { formatAUD, formatDate } from "./format";
import type { Charge, ClassSlot, Course, Enrolment, RequirementGroup, Student } from "./schema";

export type Row = Enrolment & { course: Course };

const STATUS_ORDER = { completed: 0, enrolled: 1, cart: 2, dropped: 3 } as const;
const termIndex = (t: string) => TERM_ORDER.indexOf(t);
const counts = (r: Row) => r.status !== "dropped" && r.grade !== "N";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// --- degree progress ------------------------------------------------------

export interface GroupProgress {
  group: RequirementGroup;
  codes: string[];
  completed: number;
  enrolled: number;
  planned: number;
  remaining: number;
  items: { row: Row; units: number }[];
}

export interface DegreeProgress {
  groups: GroupProgress[];
  total: number;
  completed: number;
  enrolled: number;
  planned: number;
  remaining: number;
  excess: Row[];
  placement: Map<string, string>;
}

// Each course counts once, toward the first requirement it can still fill
// (specific groups before electives), in the order it was taken.
export function degreeProgress(groups: RequirementGroup[], rows: Row[], total: number): DegreeProgress {
  const gps: GroupProgress[] = [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => ({ group, codes: group.codes ? group.codes.split(",") : [], completed: 0, enrolled: 0, planned: 0, remaining: group.units, items: [] }));
  const excess: Row[] = [];
  const placement = new Map<string, string>();
  const ordered = rows.filter(counts).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || termIndex(a.term) - termIndex(b.term));
  for (const row of ordered) {
    const target =
      gps.find((g) => g.remaining > 0 && g.codes.includes(row.courseCode)) ??
      gps.find((g) => g.remaining > 0 && g.codes.length === 0 && row.course.level >= g.group.minLevel);
    if (!target) {
      excess.push(row);
      continue;
    }
    const units = Math.min(row.course.units, target.remaining);
    target.remaining -= units;
    target.items.push({ row, units });
    placement.set(row.courseCode, target.group.key);
    if (row.status === "completed") target.completed += units;
    else if (row.status === "enrolled") target.enrolled += units;
    else target.planned += units;
  }
  const completed = sum(gps.map((g) => g.completed));
  const enrolled = sum(gps.map((g) => g.enrolled));
  const planned = sum(gps.map((g) => g.planned));
  return { groups: gps, total, completed, enrolled, planned, remaining: total - completed - enrolled - planned, excess, placement };
}

export function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

// --- results --------------------------------------------------------------

export function gpa(rows: Row[]) {
  const graded = rows.filter((r) => r.status === "completed" && r.grade);
  const units = sum(graded.map((r) => r.course.units));
  const points = sum(graded.map((r) => (GRADES.find((g) => g.grade === r.grade)?.points ?? 0) * r.course.units));
  return units ? points / units : 0;
}

export function wam(rows: Row[]) {
  const marked = rows.filter((r) => r.status === "completed" && r.mark !== null);
  const units = sum(marked.map((r) => r.course.units));
  return units ? sum(marked.map((r) => (r.mark ?? 0) * r.course.units)) / units : 0;
}

export function unitsIn(rows: Row[], term: string, statuses: Row["status"][] = ["enrolled", "cart"]) {
  return sum(rows.filter((r) => r.term === term && statuses.includes(r.status)).map((r) => r.course.units));
}

export function firstYearUnits(rows: Row[]) {
  return sum(rows.filter((r) => counts(r) && r.course.level === 1000).map((r) => r.course.units));
}

// --- prerequisites --------------------------------------------------------

export function prereqsOf(course: Course) {
  return course.prerequisites ? course.prerequisites.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// A prerequisite is met by a pass in an earlier term, or "pending" when the
// student is taking it in an earlier term right now.
export function prereqState(course: Course, term: string, rows: Row[]) {
  const missing: string[] = [];
  const pending: string[] = [];
  for (const code of prereqsOf(course)) {
    const earlier = rows.filter((r) => r.courseCode === code && termIndex(r.term) < termIndex(term));
    if (earlier.some((r) => r.status === "completed" && r.grade !== "N")) continue;
    if (earlier.some((r) => r.status === "enrolled")) pending.push(code);
    else missing.push(code);
  }
  return { missing, pending };
}

export const offeredIn = (course: Course, term: string) => (term.endsWith("S1") ? course.offeredS1 : course.offeredS2);

// --- policy checks --------------------------------------------------------

export type Level = "ok" | "info" | "warn" | "block";

export interface Check {
  id: string;
  level: Level;
  title: string;
  detail: string;
  meter?: { value: number; max: number; label: string };
}

export function policyChecks(opts: { rows: Row[]; term: string; progress: DegreeProgress; gpaValue: number }): Check[] {
  const { rows, term, progress, gpaValue } = opts;
  const t = TERMS[term];
  const checks: Check[] = [];

  const fy = firstYearUnits(rows);
  const fyCourses = fy / 6;
  const fyPlanned = rows.filter((r) => r.status === "cart" && r.course.level === 1000);
  if (fy > MAX_FIRST_YEAR_UNITS) {
    checks.push({
      id: "first-year",
      level: "warn",
      title: `Over the limit: ${fyCourses} first-year courses`,
      detail: `A bachelor degree counts at most ${MAX_FIRST_YEAR_UNITS} units (10 courses) of 1000-level study. Courses past the cap are still charged but add nothing toward your ${progress.total} units${fyPlanned.length ? ` — consider removing ${fyPlanned.map((r) => r.courseCode).join(", ")}` : ""}.`,
      meter: { value: fyCourses, max: 10, label: "first-year courses" },
    });
  } else {
    const left = (MAX_FIRST_YEAR_UNITS - fy) / 6;
    checks.push({
      id: "first-year",
      level: left === 0 ? "info" : "ok",
      title: left === 0 ? "First-year limit reached (10 of 10)" : `${fyCourses} of 10 first-year courses used`,
      detail:
        left === 0
          ? "Any further 1000-level course won't count toward your degree."
          : `Max 10 first-year (1000-level) courses count toward a bachelor degree — you have room for ${left} more.`,
      meter: { value: fyCourses, max: 10, label: "first-year courses" },
    });
  }

  const load = unitsIn(rows, term);
  if (load > STANDARD_LOAD) {
    checks.push({
      id: "load",
      level: "warn",
      title: `${load} units in ${t.short} is an overload`,
      detail: `Full-time is ${STANDARD_LOAD} units. Anything more needs Associate Dean approval, which usually requires a GPA of 5.0 or higher — yours is ${gpaValue.toFixed(2)}. Submit an overload request in Requests before census (${formatDate(t.census)}).`,
      meter: { value: load, max: STANDARD_LOAD, label: "units" },
    });
  } else if (load === 0) {
    checks.push({ id: "load", level: "info", title: `Nothing planned for ${t.short} yet`, detail: "Add courses to your cart — suggestions below are chosen to finish your degree on time.", meter: { value: 0, max: STANDARD_LOAD, label: "units" } });
  } else {
    checks.push({ id: "load", level: "ok", title: `${load} of ${STANDARD_LOAD} units planned for ${t.short}`, detail: load === STANDARD_LOAD ? "A standard full-time load." : `A part-time load — ${STANDARD_LOAD - load} more units makes it full-time.`, meter: { value: load, max: STANDARD_LOAD, label: "units" } });
  }

  for (const r of rows.filter((r) => r.term === term && (r.status === "cart" || r.status === "enrolled"))) {
    if (!offeredIn(r.course, term)) {
      checks.push({ id: `offered-${r.courseCode}`, level: "block", title: `${r.courseCode} isn't offered in ${t.short}`, detail: `${r.course.title} only runs in ${r.course.offeredS1 ? "Semester 1" : "Semester 2"}. Remove it or move it to another semester.` });
    }
    const { missing, pending } = prereqState(r.course, term, rows);
    if (missing.length) {
      checks.push({ id: `prereq-${r.courseCode}`, level: "warn", title: `${r.courseCode} needs ${missing.join(" and ")}`, detail: `You haven't completed ${missing.join(", ")}, so enrolment in ${r.course.title} will be refused without a prerequisite waiver.` });
    } else if (pending.length) {
      checks.push({ id: `prereq-${r.courseCode}`, level: "info", title: `${r.courseCode} depends on ${pending.join(", ")}`, detail: `You're taking ${pending.join(", ")} now — passing it keeps your ${r.courseCode} enrolment valid.` });
    }
  }

  const advanced = sum(rows.filter((r) => counts(r) && r.course.level >= 3000).map((r) => r.course.units));
  checks.push({
    id: "advanced",
    level: advanced >= MIN_ADVANCED_UNITS ? "ok" : "warn",
    title: `${advanced} units at 3000-level or above`,
    detail: advanced >= MIN_ADVANCED_UNITS ? `Comfortably past the ${MIN_ADVANCED_UNITS}-unit minimum for advanced study.` : `You need at least ${MIN_ADVANCED_UNITS} units of 3000-level or higher courses.`,
    meter: { value: Math.min(advanced, MIN_ADVANCED_UNITS), max: MIN_ADVANCED_UNITS, label: "units" },
  });

  const noCredit = progress.excess.filter((r) => r.status !== "completed");
  if (noCredit.length) {
    checks.push({
      id: "excess",
      level: "warn",
      title: `${noCredit.map((r) => r.courseCode).join(", ")} won't count toward your degree`,
      detail: `Every requirement those courses could fill is already full. You'd pay ${formatAUD(sum(noCredit.map((r) => coursePriceCents(r.course.band, r.course.units))))} for units that don't bring graduation closer.`,
    });
  }

  if (t) {
    checks.push({ id: "census", level: "info", title: `Census date: ${formatDate(t.census, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`, detail: "Drop a course on or before this date and you're not charged for it. After census, the full student contribution applies even if you withdraw." });
  }
  return checks;
}

// --- catalogue card status --------------------------------------------------

export interface CourseStatus {
  state: "completed" | "enrolled" | "cart" | "available";
  grade?: string | null;
  term?: string;
  blockers: string[];
  warnings: string[];
  fills: string;
  fillsKey: string | null;
  priceCents: number;
}

export function courseStatus(course: Course, term: string, rows: Row[], progress: DegreeProgress): CourseStatus {
  const priceCents = coursePriceCents(course.band, course.units);
  const mine = rows.filter((r) => r.courseCode === course.code && counts(r));
  const done = mine.find((r) => r.status === "completed");
  const inTerm = mine.find((r) => r.term === term && (r.status === "cart" || r.status === "enrolled"));
  const elsewhere = mine.find((r) => r.status === "enrolled" || r.status === "cart");
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!offeredIn(course, term)) blockers.push(`Not offered in ${TERMS[term].short}`);
  if (done) blockers.push(`Completed ${TERMS[done.term]?.short ?? ""} · ${done.grade}`);
  else if (elsewhere && !inTerm) blockers.push(`Already in ${TERMS[elsewhere.term]?.short}`);
  const { missing, pending } = prereqState(course, term, rows);
  if (missing.length) warnings.push(`Needs ${missing.join(", ")}`);
  if (pending.length) warnings.push(`Needs ${pending.join(", ")} (in progress)`);
  if (course.level === 1000 && !inTerm && firstYearUnits(rows) + course.units > MAX_FIRST_YEAR_UNITS) warnings.push("Over the 10 first-year course limit");

  const placedKey = progress.placement.get(course.code);
  const group =
    (placedKey && progress.groups.find((g) => g.group.key === placedKey)) ||
    progress.groups.find((g) => g.remaining > 0 && g.codes.includes(course.code)) ||
    progress.groups.find((g) => g.remaining > 0 && g.codes.length === 0 && course.level >= g.group.minLevel);
  return {
    state: done ? "completed" : inTerm ? (inTerm.status === "enrolled" ? "enrolled" : "cart") : "available",
    grade: done?.grade,
    term: inTerm?.term,
    blockers,
    warnings,
    fills: group ? (group.codes.length ? `Counts toward ${group.group.title}` : "Counts as an elective") : "Won't count toward your degree",
    fillsKey: group ? group.group.key : null,
    priceCents,
  };
}

// --- suggestions ------------------------------------------------------------

export interface Suggestion {
  course: Course;
  reason: string;
  priceCents: number;
  groupKey: string;
}

export function suggestions(courses: Course[], term: string, rows: Row[], progress: DegreeProgress, limit = 4): Suggestion[] {
  const taken = new Set(rows.filter((r) => counts(r)).map((r) => r.courseCode));
  const out: (Suggestion & { score: number })[] = [];
  for (const g of progress.groups) {
    if (g.remaining <= 0 || g.codes.length === 0) continue;
    for (const code of g.codes) {
      const course = courses.find((c) => c.code === code);
      if (!course || taken.has(code) || !offeredIn(course, term)) continue;
      if (prereqState(course, term, rows).missing.length) continue;
      const fillsAll = course.units >= g.remaining;
      out.push({
        course,
        groupKey: g.group.key,
        priceCents: coursePriceCents(course.band, course.units),
        reason: fillsAll ? `Completes ${g.group.title}` : `${g.remaining} units left in ${g.group.title}`,
        score: (fillsAll ? 40 : 20) + course.level / 1000 + (g.group.key === "honours" ? 6 : 0) + (g.group.key === "rnd" ? 8 : 0),
      });
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((s) => (seen.has(s.course.code) ? false : (seen.add(s.course.code), true)))
    .slice(0, limit);
}

// --- money ----------------------------------------------------------------------

export interface TermCost {
  items: { row: Row; priceCents: number }[];
  tuitionCents: number;
  ssafCents: number;
  dueNowCents: number;
  helpCents: number;
  census: string;
}

export function termCost(rows: Row[], term: string, student: Student, statuses: Row["status"][] = ["cart", "enrolled"]): TermCost {
  const items = rows.filter((r) => r.term === term && statuses.includes(r.status)).map((row) => ({ row, priceCents: coursePriceCents(row.course.band, row.course.units) }));
  const tuitionCents = sum(items.map((i) => i.priceCents));
  const ssafCents = items.length ? SSAF_CENTS : 0;
  const upfront = student.paymentOption === "upfront";
  return {
    items,
    tuitionCents,
    ssafCents,
    dueNowCents: upfront ? tuitionCents + ssafCents : ssafCents,
    helpCents: upfront ? 0 : tuitionCents,
    census: TERMS[term]?.census ?? "",
  };
}

export const bandFor = (course: Course) => BANDS[course.band];

// --- timetable ----------------------------------------------------------------

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function overlaps(a: ClassSlot, b: ClassSlot) {
  return a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

export { minutes };

// --- tasks ----------------------------------------------------------------------

export interface Task {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: "urgent" | "normal";
}

export function deriveTasks(opts: {
  student: Student;
  unpaid: Charge[];
  cart: Row[];
  planningYear: string;
  planningTerm: string;
  unallocated: { code: string; activity: string }[];
  progress: DegreeProgress;
  dismissed: Set<string>;
  today: string;
}): Task[] {
  const { student, unpaid, cart, planningYear, planningTerm, unallocated, progress, dismissed, today } = opts;
  const tasks: Task[] = [];
  if (unpaid.length) {
    const total = sum(unpaid.map((c) => c.amountCents));
    const next = [...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    tasks.push({ key: "pay", title: `Pay ${formatAUD(total)} in charges`, detail: `${unpaid.length} item${unpaid.length > 1 ? "s" : ""} · next due ${formatDate(next.dueDate)}`, href: "/account/#charges", tone: next.dueDate <= today ? "urgent" : "normal" });
  }
  for (const u of unallocated) {
    tasks.push({ key: `alloc-${u.code}-${u.activity}`, title: `Choose a ${u.activity.toLowerCase()} for ${u.code}`, detail: "Allocate to your class before spots fill up.", href: `/timetable/#allocate-${u.code}`, tone: "urgent" });
  }
  if (cart.length) {
    tasks.push({ key: "cart", title: `Confirm ${cart.length} course${cart.length > 1 ? "s" : ""} in your ${TERMS[planningTerm].short} cart`, detail: "Planned courses aren't enrolled until you confirm.", href: "/enrolment/#cart", tone: "normal" });
  } else if (!dismissed.has("plan")) {
    tasks.push({ key: "plan", title: `Plan ${TERMS[planningTerm].label}`, detail: `${progress.remaining} units to go — see suggested courses.`, href: "/enrolment/", tone: "normal" });
  }
  if (student.cafSubmittedFor !== planningYear) {
    tasks.push({ key: "caf", title: `Submit your ${planningYear} Commonwealth Assistance Form`, detail: "Needed to defer fees with HECS-HELP next year.", href: "/account/#caf", tone: "normal" });
  }
  const stale = new Date(`${today}T00:00:00`).getTime() - new Date(`${student.emergencyUpdatedAt.replace(" ", "T")}`).getTime() > 365 * 864e5;
  if (stale && !dismissed.has("emergency")) {
    tasks.push({ key: "emergency", title: "Check your emergency contact", detail: `Last confirmed ${formatDate(student.emergencyUpdatedAt.slice(0, 10))}.`, href: "/personal/#emergency", tone: "normal" });
  }
  if (!student.graduationCeremony && progress.remaining <= 48 && !dismissed.has("graduate")) {
    tasks.push({ key: "graduate", title: "Register your intention to graduate", detail: "You're in your final stretch — pick a ceremony.", href: "/graduation/#intent", tone: "normal" });
  }
  return tasks.filter((t) => !dismissed.has(t.key));
}

// --- milestones ---------------------------------------------------------------

export interface Milestone {
  term: string;
  title: string;
  detail: string;
}

export function milestones(rows: Row[], total: number): Milestone[] {
  const done = rows.filter((r) => r.status === "completed" && r.grade !== "N").sort((a, b) => termIndex(a.term) - termIndex(b.term));
  if (!done.length) return [];
  const out: Milestone[] = [{ term: done[0].term, title: "Your first semester", detail: `Started with ${done[0].courseCode} ${done[0].course.title}.` }];
  const firstHD = done.find((r) => r.grade === "HD");
  if (firstHD) out.push({ term: firstHD.term, title: "First High Distinction", detail: `${firstHD.mark} in ${firstHD.courseCode} ${firstHD.course.title}.` });
  let running = 0;
  const marks = [0.25, 0.5, 0.75];
  for (const r of done) {
    const before = running;
    running += r.course.units;
    for (const m of marks) {
      if (before < total * m && running >= total * m) out.push({ term: r.term, title: `${m * 100}% of your degree`, detail: `${running} of ${total} units complete.` });
    }
  }
  const best = [...done].sort((a, b) => (b.mark ?? 0) - (a.mark ?? 0))[0];
  if (best) out.push({ term: best.term, title: "Personal best", detail: `${best.mark} in ${best.courseCode} ${best.course.title}.` });
  return out.sort((a, b) => termIndex(a.term) - termIndex(b.term));
}
