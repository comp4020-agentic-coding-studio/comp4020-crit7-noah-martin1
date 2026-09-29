import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ENROLABLE_TERMS, SSAF_CENTS, TERMS, coursePriceCents } from "./catalog";
import { db } from "./db";
import { todayISO } from "./format";
import type { Row } from "./rules";
import {
  announcements,
  charges,
  classAllocations,
  classSlots,
  courses,
  enrolments,
  events,
  favourites,
  inbox,
  payments,
  requests,
  requirementGroups,
  students,
  taskStates,
  visits,
  type ClassSlot,
  type Course,
  type Student,
} from "./schema";

// --- student ----------------------------------------------------------------

export function getStudent(): Student {
  const s = db.select().from(students).limit(1).get();
  if (!s) throw new Error("no student seeded");
  return s;
}

type StudentPatch = Partial<Omit<Student, "id" | "uid">>;

export function updateStudent(patch: StudentPatch) {
  const s = getStudent();
  db.update(students)
    .set({ ...patch, updatedAt: sql`(datetime('now'))` })
    .where(eq(students.id, s.id))
    .run();
}

// --- catalogue and enrolments ---------------------------------------------

export function getCourses(): Course[] {
  return db.select().from(courses).orderBy(asc(courses.code)).all();
}

export function getCourse(code: string): Course | undefined {
  return db.select().from(courses).where(eq(courses.code, code)).get();
}

export function getGroups() {
  return db.select().from(requirementGroups).orderBy(asc(requirementGroups.sortOrder)).all();
}

export function getRows(): Row[] {
  return db
    .select()
    .from(enrolments)
    .innerJoin(courses, eq(enrolments.courseCode, courses.code))
    .all()
    .map(({ enrolments: e, courses: c }) => ({ ...e, course: c }));
}

export type Result = { ok: true; message: string } | { ok: false; message: string };

export function addToCart(code: string, term: string): Result {
  const course = getCourse(code);
  if (!course || !ENROLABLE_TERMS.includes(term)) return { ok: false, message: "That course or term isn't available." };
  const offered = term.endsWith("S1") ? course.offeredS1 : course.offeredS2;
  if (!offered) return { ok: false, message: `${code} isn't offered in ${TERMS[term].short}.` };
  const existing = db.select().from(enrolments).where(eq(enrolments.courseCode, code)).all();
  if (existing.some((e) => e.status === "completed" && e.grade !== "N")) return { ok: false, message: `You've already completed ${code}.` };
  if (existing.some((e) => e.term !== term && (e.status === "enrolled" || e.status === "cart"))) return { ok: false, message: `${code} is already planned for another semester.` };
  const here = existing.find((e) => e.term === term);
  if (here) {
    if (here.status === "cart" || here.status === "enrolled") return { ok: true, message: `${code} is already in your plan.` };
    db.update(enrolments).set({ status: "cart", updatedAt: sql`(datetime('now'))` }).where(eq(enrolments.id, here.id)).run();
  } else {
    db.insert(enrolments).values({ courseCode: code, term, status: "cart" }).run();
  }
  return { ok: true, message: `Added ${code} to your ${TERMS[term].short} cart` };
}

export function removeFromCart(code: string, term: string): Result {
  db.delete(enrolments)
    .where(and(eq(enrolments.courseCode, code), eq(enrolments.term, term), eq(enrolments.status, "cart")))
    .run();
  return { ok: true, message: `Removed ${code} from your cart` };
}

// Confirming turns the cart into enrolments and raises the matching charges:
// tuition deferred to HECS-HELP or payable at census, plus the term's SSAF.
export function confirmCart(term: string): Result {
  const student = getStudent();
  const rows = getRows().filter((r) => r.term === term && r.status === "cart");
  if (!rows.length) return { ok: false, message: "Your cart is empty." };
  const t = TERMS[term];
  db.transaction((tx) => {
    for (const r of rows) {
      tx.update(enrolments).set({ status: "enrolled", updatedAt: sql`(datetime('now'))` }).where(eq(enrolments.id, r.id)).run();
      tx.insert(charges)
        .values({
          term,
          kind: "tuition",
          courseCode: r.courseCode,
          description: `${r.courseCode} ${r.course.title}`,
          amountCents: coursePriceCents(r.course.band, r.course.units),
          dueDate: t.census,
          status: student.paymentOption === "help" ? "deferred" : "unpaid",
        })
        .run();
    }
    const hasSsaf = tx.select().from(charges).where(and(eq(charges.term, term), eq(charges.kind, "ssaf"))).get();
    if (!hasSsaf) {
      tx.insert(charges).values({ term, kind: "ssaf", description: `Student Services and Amenities Fee — ${t.label}`, amountCents: SSAF_CENTS, dueDate: t.census, status: "unpaid" }).run();
    }
  });
  return { ok: true, message: `Enrolled in ${rows.length} course${rows.length > 1 ? "s" : ""} for ${t.short}` };
}

// Before census a drop is free (charges removed); after census the charge
// stands — that's the rule students most need to see before they click.
export function dropCourse(code: string, term: string, today = todayISO()): Result {
  const t = TERMS[term];
  const row = db.select().from(enrolments).where(and(eq(enrolments.courseCode, code), eq(enrolments.term, term), eq(enrolments.status, "enrolled"))).get();
  if (!row || !t) return { ok: false, message: "That enrolment wasn't found." };
  const beforeCensus = today <= t.census;
  db.transaction((tx) => {
    tx.update(enrolments).set({ status: "dropped", updatedAt: sql`(datetime('now'))` }).where(eq(enrolments.id, row.id)).run();
    tx.delete(classAllocations).where(and(eq(classAllocations.courseCode, code), eq(classAllocations.term, term))).run();
    if (beforeCensus) {
      tx.update(charges)
        .set({ status: "credited" })
        .where(and(eq(charges.term, term), eq(charges.courseCode, code), inArray(charges.status, ["unpaid", "deferred"])))
        .run();
    }
  });
  return { ok: true, message: beforeCensus ? `Dropped ${code} — no charge, you're before census` : `Withdrew from ${code} — the census-date charge still applies` };
}

// --- classes ----------------------------------------------------------------

export function slotsFor(term: string, codes: string[]): ClassSlot[] {
  if (!codes.length) return [];
  return db
    .select()
    .from(classSlots)
    .where(and(eq(classSlots.term, term), inArray(classSlots.courseCode, codes)))
    .orderBy(asc(classSlots.courseCode), asc(classSlots.activity), asc(classSlots.label))
    .all();
}

export function allocationsFor(term: string) {
  return db.select().from(classAllocations).where(eq(classAllocations.term, term)).all();
}

export function allocate(slotId: number): Result {
  const slot = db.select().from(classSlots).where(eq(classSlots.id, slotId)).get();
  if (!slot) return { ok: false, message: "That class doesn't exist." };
  const enrolled = db.select().from(enrolments).where(and(eq(enrolments.courseCode, slot.courseCode), eq(enrolments.term, slot.term), eq(enrolments.status, "enrolled"))).get();
  if (!enrolled) return { ok: false, message: `Enrol in ${slot.courseCode} first.` };
  const current = db.select().from(classAllocations).where(and(eq(classAllocations.courseCode, slot.courseCode), eq(classAllocations.term, slot.term), eq(classAllocations.activity, slot.activity))).get();
  if (current?.slotId === slot.id) return { ok: true, message: `You're already in ${slot.label}` };
  if (slot.taken >= slot.capacity) return { ok: false, message: `${slot.label} is full — pick another time.` };
  db.transaction((tx) => {
    if (current) {
      tx.update(classSlots).set({ taken: sql`max(${classSlots.taken} - 1, 0)` }).where(eq(classSlots.id, current.slotId)).run();
      tx.delete(classAllocations).where(eq(classAllocations.id, current.id)).run();
    }
    tx.update(classSlots).set({ taken: sql`${classSlots.taken} + 1` }).where(eq(classSlots.id, slot.id)).run();
    tx.insert(classAllocations).values({ slotId: slot.id, courseCode: slot.courseCode, term: slot.term, activity: slot.activity }).run();
  });
  return { ok: true, message: `You're in ${slot.courseCode} ${slot.label}` };
}

// --- money ------------------------------------------------------------------

export function getCharges() {
  return db.select().from(charges).orderBy(desc(charges.dueDate), asc(charges.id)).all();
}

export function getPayments() {
  return db
    .select({ id: payments.id, amountCents: payments.amountCents, method: payments.method, reference: payments.reference, paidAt: payments.paidAt, description: charges.description })
    .from(payments)
    .innerJoin(charges, eq(payments.chargeId, charges.id))
    .orderBy(desc(payments.paidAt))
    .all();
}

export function payCharge(id: number, method: string): Result {
  const charge = db.select().from(charges).where(eq(charges.id, id)).get();
  if (!charge || charge.status !== "unpaid") return { ok: false, message: "Nothing to pay on that charge." };
  db.transaction((tx) => {
    tx.update(charges).set({ status: "paid" }).where(eq(charges.id, id)).run();
    tx.insert(payments).values({ chargeId: id, amountCents: charge.amountCents, method, reference: `PAY-${Date.now().toString(36).toUpperCase()}` }).run();
  });
  return { ok: true, message: `Payment received — thank you` };
}

export function deferCharge(id: number): Result {
  const charge = db.select().from(charges).where(eq(charges.id, id)).get();
  if (!charge || charge.status !== "unpaid" || charge.kind === "fine" || charge.kind === "other") return { ok: false, message: "That charge can't be deferred." };
  db.update(charges).set({ status: "deferred" }).where(eq(charges.id, id)).run();
  return { ok: true, message: charge.kind === "ssaf" ? "Deferred to SA-HELP" : "Deferred to HECS-HELP" };
}

// --- messages, announcements, events -------------------------------------

export function getInbox() {
  return db.select().from(inbox).orderBy(desc(inbox.sentAt)).all();
}

export function unreadCount() {
  return db.select({ n: sql<number>`count(*)` }).from(inbox).where(and(eq(inbox.read, false), eq(inbox.archived, false))).get()?.n ?? 0;
}

export function updateMessage(id: number, patch: { read?: boolean; starred?: boolean; archived?: boolean }) {
  db.update(inbox).set(patch).where(eq(inbox.id, id)).run();
}

export function markAllRead() {
  db.update(inbox).set({ read: true }).where(eq(inbox.read, false)).run();
}

export function getAnnouncements() {
  return db.select().from(announcements).orderBy(desc(announcements.publishedAt)).all();
}

export function upcomingEvents(from = todayISO(), limit = 50) {
  return db.select().from(events).where(sql`${events.date} >= ${from}`).orderBy(asc(events.date)).limit(limit).all();
}

// --- requests ---------------------------------------------------------------

export function getRequests() {
  return db.select().from(requests).orderBy(desc(requests.createdAt)).all();
}

export function createRequest(kind: string, subject: string, details: string) {
  return db.insert(requests).values({ kind, subject, details, status: "Submitted" }).returning().get();
}

// --- shell: favourites, recents, tasks -------------------------------------

export function getFavourites() {
  return db.select().from(favourites).orderBy(asc(favourites.createdAt)).all();
}

export function toggleFavourite(path: string, label: string): boolean {
  const existing = db.select().from(favourites).where(eq(favourites.path, path)).get();
  if (existing) {
    db.delete(favourites).where(eq(favourites.path, path)).run();
    return false;
  }
  db.insert(favourites).values({ path, label }).run();
  return true;
}

export function recordVisit(path: string, label: string) {
  db.insert(visits)
    .values({ path, label })
    .onConflictDoUpdate({ target: visits.path, set: { label, visitedAt: sql`(datetime('now'))` } })
    .run();
}

export function getVisits(limit = 6) {
  return db.select().from(visits).orderBy(desc(visits.visitedAt)).limit(limit).all();
}

export function dismissedTasks(): Set<string> {
  return new Set(db.select().from(taskStates).where(eq(taskStates.done, true)).all().map((t) => t.key));
}

export function setTask(key: string, done: boolean) {
  db.insert(taskStates)
    .values({ key, done })
    .onConflictDoUpdate({ target: taskStates.key, set: { done, updatedAt: sql`(datetime('now'))` } })
    .run();
}
