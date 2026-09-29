import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SEED_COURSES, SEED_HISTORY, SEED_REQUIREMENTS, SSAF_CENTS, TERMS, coursePriceCents, gradeFor } from "./catalog";
import {
  announcements,
  charges,
  classAllocations,
  classSlots,
  courses,
  enrolments,
  events,
  inbox,
  payments,
  requests as requestsTable,
  requirementGroups,
  students,
} from "./schema";

type Slot = [activity: "Lecture" | "Tutorial" | "Lab" | "Workshop", label: string, day: number, start: string, end: string, location: string, capacity: number, taken: number, allocated?: boolean];

// The current semester's classes, hand-placed so the week reads like a real one.
const CURRENT_SLOTS: Record<string, Slot[]> = {
  COMP4020: [
    ["Lecture", "LEC 01", 2, "14:00", "16:00", "Kambri Cultural Centre T2", 180, 142, true],
    ["Workshop", "WKS 01", 1, "09:00", "11:00", "Marie Reay Building 4.03", 24, 24],
    ["Workshop", "WKS 02", 1, "14:00", "16:00", "Marie Reay Building 4.03", 24, 21, true],
    ["Workshop", "WKS 03", 3, "10:00", "12:00", "Marie Reay Building 4.03", 24, 17],
  ],
  COMP3670: [
    ["Lecture", "LEC 01", 1, "11:00", "13:00", "Manning Clark Hall", 400, 356, true],
    ["Tutorial", "TUT 01", 3, "09:00", "10:00", "CSIT Building N113", 30, 28, true],
    ["Tutorial", "TUT 02", 3, "15:00", "16:00", "CSIT Building N114", 30, 19],
    ["Tutorial", "TUT 03", 4, "11:00", "12:00", "CSIT Building N113", 30, 30],
    ["Tutorial", "TUT 04", 5, "13:00", "14:00", "CSIT Building N114", 30, 12],
  ],
  COMP4650: [
    ["Lecture", "LEC 01", 4, "14:00", "16:00", "Hanna Neumann Building 1.33", 160, 131, true],
    ["Lab", "LAB 01", 2, "10:00", "12:00", "CSIT Building N111", 28, 27],
    ["Lab", "LAB 02", 5, "10:00", "12:00", "CSIT Building N112", 28, 22, true],
  ],
  COMP3900: [
    ["Lecture", "LEC 01", 3, "12:00", "14:00", "Birch Building 1.18", 220, 187, true],
    ["Lab", "LAB 01", 1, "16:00", "18:00", "Marie Reay Building 5.02", 26, 25],
    ["Lab", "LAB 02", 2, "16:00", "18:00", "Marie Reay Building 5.02", 26, 14],
    ["Lab", "LAB 03", 4, "09:00", "11:00", "Marie Reay Building 5.02", 26, 26],
  ],
};

const ROOMS = ["CSIT Building N101", "CSIT Building N113", "Hanna Neumann Building 1.33", "Birch Building 1.18", "Marie Reay Building 5.02", "Copland Building G030", "Llewellyn Hall"];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Next semester's classes, placed deterministically from the course code.
function plannedSlots(code: string, level: number): Slot[] {
  const h = hash(code);
  const lecDay = (h % 5) + 1;
  const lecHour = 9 + ((h >>> 3) % 7);
  const pad = (n: number) => `${String(n).padStart(2, "0")}:00`;
  const activity = level >= 3000 && h % 2 ? "Lab" : "Tutorial";
  const len = activity === "Lab" ? 2 : 1;
  const slots: Slot[] = [["Lecture", "LEC 01", lecDay, pad(lecHour), pad(lecHour + 2), ROOMS[h % ROOMS.length], 200, 40 + (h % 120)]];
  for (let i = 0; i < 3; i++) {
    const day = ((lecDay + i + 1) % 5) + 1;
    const hour = 9 + ((h >>> (5 + i * 3)) % 8);
    slots.push([activity, `${activity === "Lab" ? "LAB" : "TUT"} 0${i + 1}`, day, pad(hour), pad(hour + len), ROOMS[(h >>> i) % ROOMS.length], 30, (h >>> (i * 4)) % 31]);
  }
  return slots;
}

export function seed(db: BetterSQLite3Database) {
  if (db.select({ id: students.id }).from(students).limit(1).all().length) return;

  db.transaction((tx) => {
    tx.insert(students)
      .values({
        uid: "u7412038",
        legalGiven: "Noah",
        legalFamily: "Martin",
        preferredName: "Noah",
        dateOfBirth: "2004-03-17",
        email: "u7412038@anu.edu.au",
        personalEmail: "noah.martin@example.com",
        phone: "0412 345 678",
        homeAddress: "18 Wattle Grove, Orange NSW 2800",
        termAddress: "Unit 4, 12 Lonsdale Street, Braddon ACT 2612",
        emergencyName: "Alex Martin",
        emergencyRelation: "Parent",
        emergencyPhone: "0400 118 229",
        emergencyUpdatedAt: "2023-07-10 09:12:00",
        citizenship: "Australian citizen",
        programCode: "AACOM",
        programName: "Bachelor of Advanced Computing (Honours)",
        programUnits: 192,
        majorName: "Intelligent Systems",
        admitTerm: "2023-S2",
        paymentOption: "help",
        cafSubmittedFor: "2026",
        tfnProvided: true,
        bankName: "",
        bankBsb: "",
        bankAccount: "",
        testamurName: "Noah Martin",
      })
      .run();

    tx.insert(courses)
      .values(
        SEED_COURSES.map(([code, title, units, band, s1, s2, prerequisites, convener, description]) => ({
          code,
          title,
          units,
          band,
          level: Number(code.slice(4, 5)) * 1000,
          area: code.slice(0, 4),
          offeredS1: s1,
          offeredS2: s2,
          prerequisites,
          convener,
          description,
        })),
      )
      .run();

    tx.insert(requirementGroups)
      .values(SEED_REQUIREMENTS.map((r, i) => ({ ...r, sortOrder: i })))
      .run();

    const byCode = new Map(SEED_COURSES.map((c) => [c[0], c]));
    for (const [term, code, mark] of SEED_HISTORY) {
      tx.insert(enrolments)
        .values({ courseCode: code, term, status: mark === null ? "enrolled" : "completed", mark, grade: mark === null ? null : gradeFor(mark).grade })
        .run();
      const c = byCode.get(code);
      if (!c) continue;
      tx.insert(charges)
        .values({ term, kind: "tuition", courseCode: code, description: `${code} ${c[1]}`, amountCents: coursePriceCents(c[3], c[2]), dueDate: TERMS[term].census, status: "deferred" })
        .run();
    }

    for (const term of ["2023-S2", "2024-S1", "2024-S2", "2025-S1", "2025-S2", "2026-S1"]) {
      const row = tx
        .insert(charges)
        .values({ term, kind: "ssaf", description: `Student Services and Amenities Fee — ${TERMS[term].label}`, amountCents: SSAF_CENTS, dueDate: TERMS[term].census, status: "paid" })
        .returning()
        .get();
      tx.insert(payments)
        .values({ chargeId: row.id, amountCents: SSAF_CENTS, method: "Card", reference: `PAY-${term.replace("-", "")}-${String(row.id).padStart(4, "0")}`, paidAt: `${TERMS[term].census} 10:00:00` })
        .run();
    }
    tx.insert(charges)
      .values([
        { term: "2026-S2", kind: "ssaf", description: "Student Services and Amenities Fee — Semester 2 2026", amountCents: SSAF_CENTS, dueDate: "2026-10-16", status: "unpaid" },
        { term: "2026-S2", kind: "fine", description: "ANU Library — overdue item: Designing Interfaces (3rd ed.)", amountCents: 1450, dueDate: "2026-10-09", status: "unpaid" },
      ])
      .run();

    for (const [code, slots] of Object.entries(CURRENT_SLOTS)) {
      for (const [activity, label, day, start, end, location, capacity, taken, allocated] of slots) {
        const row = tx.insert(classSlots).values({ courseCode: code, term: "2026-S2", activity, label, day, start, end, location, capacity, taken }).returning().get();
        if (allocated) tx.insert(classAllocations).values({ slotId: row.id, courseCode: code, term: "2026-S2", activity }).run();
      }
    }
    for (const [code, , , , s1, s2] of SEED_COURSES) {
      const level = Number(code.slice(4, 5)) * 1000;
      if (level < 2000) continue;
      for (const [term, offered] of [["2027-S1", s1], ["2027-S2", s2]] as const) {
        if (!offered) continue;
        for (const [activity, label, day, start, end, location, capacity, taken] of plannedSlots(code + term, level)) {
          tx.insert(classSlots).values({ courseCode: code, term, activity, label, day, start, end, location, capacity, taken }).run();
        }
      }
    }

    tx.insert(announcements)
      .values([
        { title: "Information on Campus Closures", body: "Check campus status before you travel. Building closures, access changes and any disruption to classes are posted here first, then emailed to affected students.", level: "alert", publishedAt: "2026-09-26" },
        { title: "Semester 1 2027 enrolment is open", body: "Plan your courses now — your cart shows the exact student contribution for each course before you commit.", level: "info", publishedAt: "2026-09-28" },
        { title: "Semester 2 exam timetable published", body: "Your personal exam timetable is in Timetables. Venues are confirmed two weeks before each exam.", level: "info", publishedAt: "2026-09-21" },
      ])
      .run();

    tx.insert(events)
      .values([
        { date: "2026-10-05", title: "COMP4020 crit — “It's alive!”", kind: "academic", courseCode: "COMP4020", location: "Marie Reay Building 4.03", description: "Present your running prototype to the studio." },
        { date: "2026-10-08", title: "ANU Careers Expo: Computing & Engineering", kind: "event", location: "Kambri Cultural Centre", description: "Meet 40+ employers hiring graduates and interns." },
        { date: "2026-10-09", title: "Library fine due", kind: "fees", location: "", description: "$14.50 overdue item charge." },
        { date: "2026-10-14", title: "Honours information session", kind: "event", location: "CSIT Building N101", description: "Supervisors pitch 2027 research projects." },
        { date: "2026-10-16", title: "Semester 2 SSAF due", kind: "fees", location: "", description: "Pay upfront or defer with SA-HELP." },
        { date: "2026-10-23", title: "Last day of Semester 2 teaching", kind: "academic", location: "", description: "" },
        { date: "2026-10-30", title: "Exam: COMP3670 Introduction to Machine Learning", kind: "exam", courseCode: "COMP3670", location: "Llewellyn Hall", description: "9:30am · 3 hours · closed book" },
        { date: "2026-11-03", title: "Exam: COMP4650 Document Analysis", kind: "exam", courseCode: "COMP4650", location: "Copland Building G030", description: "1:30pm · 2 hours" },
        { date: "2026-11-06", title: "Exam: COMP3900 Human-Computer Interaction", kind: "exam", courseCode: "COMP3900", location: "Manning Clark Hall", description: "9:30am · 2 hours" },
        { date: "2026-11-10", title: "Class allocation opens for Semester 1 2027", kind: "deadline", location: "", description: "Pick tutorials and labs for your planned courses." },
        { date: "2026-11-26", title: "Semester 2 results released", kind: "academic", location: "", description: "" },
        { date: "2026-12-14", title: "December graduation ceremonies", kind: "ceremony", location: "Llewellyn Hall", description: "Come and celebrate friends crossing the stage." },
        { date: "2027-01-29", title: "Recommended enrolment deadline — Semester 1 2027", kind: "deadline", location: "", description: "Enrol early to get the classes you want." },
        { date: "2027-02-22", title: "Semester 1 2027 begins", kind: "academic", location: "", description: "" },
        { date: "2027-03-31", title: "Census date — Semester 1 2027", kind: "fees", location: "", description: "Last day to drop a course without being charged." },
        { date: "2027-12-13", title: "Your graduation (expected)", kind: "ceremony", location: "Llewellyn Hall", description: "December 2027 ceremonies." },
      ])
      .run();

    tx.insert(inbox)
      .values([
        { sender: "ANU Enrolments", category: "Enrolment", subject: "Enrolment for Semester 1 2027 is now open", body: "You can now add Semester 1 2027 courses to your cart. Each course shows its student contribution before you confirm, and nothing is charged until you enrol. Remember: the census date for Semester 1 2027 is 31 March 2027 — the last day to drop a course without being charged.", sentAt: "2026-09-28 09:00:00" },
        { sender: "Examinations, Graduations & Ceremonies", category: "Academic", subject: "COMP3670 exam venue confirmed: Llewellyn Hall", body: "Your COMP3670 final exam is on Friday 30 October 2026 at 9:30am in Llewellyn Hall. Bring your student card. Seat numbers are released 48 hours before the exam.", sentAt: "2026-09-25 14:20:00" },
        { sender: "Student Finance", category: "Finance", subject: "Reminder: Semester 2 SSAF due 16 October", body: "Your Student Services and Amenities Fee of $187.00 for Semester 2 2026 is due on 16 October 2026. You can pay upfront in Account Details, or defer it to SA-HELP.", sentAt: "2026-09-22 08:30:00" },
        { sender: "ANU Library", category: "Admin", subject: "Overdue item: Designing Interfaces (3rd ed.)", body: "The item Designing Interfaces (3rd ed.) was due on 2 September. A charge of $14.50 has been added to your account. Return the item to any library to stop further charges.", sentAt: "2026-09-18 11:05:00", read: true },
        { sender: "Graduations", category: "Graduation", subject: "Planning to graduate in 2027? Here's the timeline", body: "If you expect to finish your degree in 2027, you can register your intention to graduate in ANU Hub now. We'll confirm your eligibility once your final results are released.", sentAt: "2026-09-10 10:00:00", read: true },
        { sender: "Student Wellbeing", category: "Wellbeing", subject: "Wellbeing week at Kambri", body: "Free yoga, therapy dogs and a pancake breakfast all week at Kambri. Come say hi.", sentAt: "2026-09-01 09:00:00", read: true },
        { sender: "ANU Enrolments", category: "Enrolment", subject: "Census date today — your enrolment is locked in", body: "Today is the Semester 2 2026 census date. Courses you are enrolled in after today will be charged even if you withdraw later.", sentAt: "2026-08-31 08:00:00", read: true },
        { sender: "Student Finance", category: "Finance", subject: "Your Commonwealth Assistance Form", body: "Your Commonwealth Assistance Form for 2026 has been received. You'll need a new form for 2027 before you enrol in 2027 courses.", sentAt: "2026-08-12 13:40:00", read: true },
        { sender: "Deputy Vice-Chancellor (Academic)", category: "Admin", subject: "Welcome back to Semester 2", body: "Welcome back! Your timetable is in ANU Hub, and class allocation is open until the end of week 2.", sentAt: "2026-07-20 07:30:00", read: true },
        { sender: "Examinations, Graduations & Ceremonies", category: "Academic", subject: "Semester 1 2026 results released", body: "Your Semester 1 2026 results are now available in Academic Records. Congratulations on completing another semester.", sentAt: "2026-07-09 12:00:00", read: true, starred: true },
      ])
      .run();

    tx.insert(requestsTable)
      .values([
        { kind: "Special consideration", subject: "COMP3120 assignment 2 — illness", details: "Medical certificate attached for 12–16 May.", status: "Closed", createdAt: "2026-05-17 10:12:00", updatedAt: "2026-05-22 15:00:00" },
        { kind: "Credit for prior study", subject: "TAFE Certificate IV in Programming", details: "Requesting unspecified 1000-level credit.", status: "Approved", createdAt: "2023-07-02 09:00:00", updatedAt: "2023-07-20 09:00:00" },
      ])
      .run();
  });
}
