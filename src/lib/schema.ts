import { sql } from "drizzle-orm";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

const now = sql`(datetime('now'))`;

// One row: the signed-in student. Identity, contact, program and the
// preferences the shell renders server-side (so there is no theme flash).
export const students = sqliteTable("students", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  legalGiven: text("legal_given").notNull(),
  legalFamily: text("legal_family").notNull(),
  preferredName: text("preferred_name").notNull(),
  pronouns: text().notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull(),
  email: text().notNull(),
  personalEmail: text("personal_email").notNull().default(""),
  phone: text().notNull().default(""),
  homeAddress: text("home_address").notNull().default(""),
  termAddress: text("term_address").notNull().default(""),
  emergencyName: text("emergency_name").notNull().default(""),
  emergencyRelation: text("emergency_relation").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  emergencyUpdatedAt: text("emergency_updated_at").notNull().default(now),
  citizenship: text().notNull(),
  programCode: text("program_code").notNull(),
  programName: text("program_name").notNull(),
  programUnits: int("program_units").notNull(),
  majorName: text("major_name").notNull(),
  admitTerm: text("admit_term").notNull(),
  paymentOption: text("payment_option", { enum: ["help", "upfront"] }).notNull().default("help"),
  cafSubmittedFor: text("caf_submitted_for").notNull().default(""),
  tfnProvided: int("tfn_provided", { mode: "boolean" }).notNull().default(false),
  bankName: text("bank_name").notNull().default(""),
  bankBsb: text("bank_bsb").notNull().default(""),
  bankAccount: text("bank_account").notNull().default(""),
  passwordChangedAt: text("password_changed_at"),
  graduationCeremony: text("graduation_ceremony"),
  graduationAppliedAt: text("graduation_applied_at"),
  testamurName: text("testamur_name").notNull().default(""),
  theme: text({ enum: ["system", "light", "dark"] }).notNull().default("system"),
  motion: text({ enum: ["full", "reduced"] }).notNull().default("full"),
  textSize: text("text_size", { enum: ["standard", "large"] }).notNull().default("standard"),
  updatedAt: text("updated_at").notNull().default(now),
});

// The course catalogue. `band` is the Commonwealth funding cluster that sets
// the student contribution; offered_s1/s2 gate which terms can take it.
export const courses = sqliteTable("courses", {
  code: text().primaryKey(),
  title: text().notNull(),
  units: int().notNull(),
  level: int().notNull(),
  area: text().notNull(),
  band: int().notNull(),
  description: text().notNull(),
  convener: text().notNull(),
  offeredS1: int("offered_s1", { mode: "boolean" }).notNull(),
  offeredS2: int("offered_s2", { mode: "boolean" }).notNull(),
  prerequisites: text().notNull().default(""),
});

// Degree rules as data: a group is satisfied by `units` drawn from `codes`
// (explicit list), or — when codes is empty — from any course at or above
// `min_level` (electives).
export const requirementGroups = sqliteTable("requirement_groups", {
  id: int().primaryKey({ autoIncrement: true }),
  key: text().notNull().unique(),
  title: text().notNull(),
  description: text().notNull(),
  units: int().notNull(),
  codes: text().notNull().default(""),
  minLevel: int("min_level").notNull().default(1000),
  sortOrder: int("sort_order").notNull(),
});

// Every course a student has ever touched, one row per course per term.
// 'cart' is the planning state — nothing is charged until it's 'enrolled'.
export const enrolments = sqliteTable(
  "enrolments",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseCode: text("course_code")
      .notNull()
      .references(() => courses.code),
    term: text().notNull(),
    status: text({ enum: ["completed", "enrolled", "cart", "dropped"] }).notNull(),
    mark: int(),
    grade: text(),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("enrolments_course_term").on(t.courseCode, t.term)],
);

export const classSlots = sqliteTable("class_slots", {
  id: int().primaryKey({ autoIncrement: true }),
  courseCode: text("course_code")
    .notNull()
    .references(() => courses.code),
  term: text().notNull(),
  activity: text({ enum: ["Lecture", "Tutorial", "Lab", "Workshop"] }).notNull(),
  label: text().notNull(),
  day: int().notNull(),
  start: text().notNull(),
  end: text().notNull(),
  location: text().notNull(),
  capacity: int().notNull(),
  taken: int().notNull(),
});

export const classAllocations = sqliteTable(
  "class_allocations",
  {
    id: int().primaryKey({ autoIncrement: true }),
    slotId: int("slot_id")
      .notNull()
      .references(() => classSlots.id),
    courseCode: text("course_code").notNull(),
    term: text().notNull(),
    activity: text().notNull(),
    allocatedAt: text("allocated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("allocation_per_activity").on(t.courseCode, t.term, t.activity)],
);

export const charges = sqliteTable("charges", {
  id: int().primaryKey({ autoIncrement: true }),
  term: text().notNull(),
  kind: text({ enum: ["tuition", "ssaf", "fine", "other"] }).notNull(),
  description: text().notNull(),
  courseCode: text("course_code"),
  amountCents: int("amount_cents").notNull(),
  dueDate: text("due_date").notNull(),
  status: text({ enum: ["unpaid", "paid", "deferred", "credited"] }).notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const payments = sqliteTable("payments", {
  id: int().primaryKey({ autoIncrement: true }),
  chargeId: int("charge_id")
    .notNull()
    .references(() => charges.id),
  amountCents: int("amount_cents").notNull(),
  method: text().notNull(),
  reference: text().notNull(),
  paidAt: text("paid_at").notNull().default(now),
});

export const inbox = sqliteTable("inbox", {
  id: int().primaryKey({ autoIncrement: true }),
  sender: text().notNull(),
  category: text({ enum: ["Academic", "Enrolment", "Finance", "Graduation", "Wellbeing", "Admin"] }).notNull(),
  subject: text().notNull(),
  body: text().notNull(),
  sentAt: text("sent_at").notNull(),
  read: int({ mode: "boolean" }).notNull().default(false),
  starred: int({ mode: "boolean" }).notNull().default(false),
  archived: int({ mode: "boolean" }).notNull().default(false),
});

export const announcements = sqliteTable("announcements", {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  body: text().notNull(),
  level: text({ enum: ["info", "alert"] }).notNull(),
  publishedAt: text("published_at").notNull(),
});

export const events = sqliteTable("events", {
  id: int().primaryKey({ autoIncrement: true }),
  date: text().notNull(),
  title: text().notNull(),
  kind: text({ enum: ["deadline", "academic", "exam", "event", "ceremony", "fees"] }).notNull(),
  courseCode: text("course_code"),
  location: text().notNull().default(""),
  description: text().notNull().default(""),
});

export const requests = sqliteTable("requests", {
  id: int().primaryKey({ autoIncrement: true }),
  kind: text().notNull(),
  subject: text().notNull(),
  details: text().notNull(),
  status: text({ enum: ["Submitted", "In review", "Approved", "Closed"] }).notNull(),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const favourites = sqliteTable("favourites", {
  path: text().primaryKey(),
  label: text().notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const visits = sqliteTable("visits", {
  path: text().primaryKey(),
  label: text().notNull(),
  visitedAt: text("visited_at").notNull().default(now),
});

// Tasks are derived from state (see rules.ts); this only remembers which
// ones the student has ticked off or dismissed.
export const taskStates = sqliteTable("task_states", {
  key: text().primaryKey(),
  done: int({ mode: "boolean" }).notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export type Student = typeof students.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type RequirementGroup = typeof requirementGroups.$inferSelect;
export type Enrolment = typeof enrolments.$inferSelect;
export type ClassSlot = typeof classSlots.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type InboxMessage = typeof inbox.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type StudentRequest = typeof requests.$inferSelect;
