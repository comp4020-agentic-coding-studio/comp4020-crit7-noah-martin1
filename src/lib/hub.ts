import { CURRENT_TERM, PLANNING_TERM, TERM_ORDER } from "./catalog";
import { allocationsFor, dismissedTasks, getCharges, getGroups, getRows, getStudent, slotsFor } from "./data";
import { todayISO } from "./format";
import { degreeProgress, deriveTasks, gpa, wam, type Row } from "./rules";

// Activities (tutorials, labs, workshops) a student still has to pick for
// courses they're enrolled in, this semester onward.
export function unallocated(rows: Row[]) {
  const out: { code: string; activity: string; term: string }[] = [];
  const terms = [...new Set(rows.filter((r) => r.status === "enrolled" && TERM_ORDER.indexOf(r.term) >= TERM_ORDER.indexOf(CURRENT_TERM)).map((r) => r.term))];
  for (const term of terms) {
    const codes = rows.filter((r) => r.term === term && r.status === "enrolled").map((r) => r.courseCode);
    const slots = slotsFor(term, codes);
    const taken = new Set(allocationsFor(term).map((a) => `${a.courseCode}|${a.activity}`));
    for (const code of codes) {
      for (const activity of new Set(slots.filter((s) => s.courseCode === code && s.activity !== "Lecture").map((s) => s.activity))) {
        if (!taken.has(`${code}|${activity}`)) out.push({ code, activity, term });
      }
    }
  }
  return out;
}

export function loadHub(today = todayISO()) {
  const student = getStudent();
  const rows = getRows();
  const groups = getGroups();
  const progress = degreeProgress(groups, rows, student.programUnits);
  const charges = getCharges();
  const unpaid = charges.filter((c) => c.status === "unpaid");
  const cart = rows.filter((r) => r.status === "cart");
  const missing = unallocated(rows);
  const tasks = deriveTasks({
    student,
    unpaid,
    cart,
    planningYear: PLANNING_TERM.slice(0, 4),
    planningTerm: PLANNING_TERM,
    unallocated: missing,
    progress,
    dismissed: dismissedTasks(),
    today,
  });
  return { student, rows, groups, progress, charges, unpaid, cart, tasks, missing, today, gpa: gpa(rows), wam: wam(rows) };
}

export type Hub = ReturnType<typeof loadHub>;
