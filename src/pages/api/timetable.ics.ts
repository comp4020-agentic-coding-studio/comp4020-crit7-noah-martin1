import type { APIRoute } from "astro";
import { CURRENT_TERM, TERMS } from "../../lib/catalog";
import { allocationsFor, getRows, slotsFor, upcomingEvents } from "../../lib/data";

// The current semester as an iCalendar feed: each allocated class repeats
// weekly until the end of teaching, and exams are one-off events.
const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
const stamp = (date: string, hhmm = "0000") => `${date.replaceAll("-", "")}T${hhmm.replace(":", "")}00`;

export const GET: APIRoute = () => {
  const term = TERMS[CURRENT_TERM];
  const rows = getRows().filter((r) => r.term === CURRENT_TERM && r.status === "enrolled");
  const titles = new Map(rows.map((r) => [r.courseCode, r.course.title]));
  const mine = new Set(allocationsFor(CURRENT_TERM).map((a) => a.slotId));
  const slots = slotsFor(CURRENT_TERM, [...titles.keys()]).filter((s) => mine.has(s.id));
  const start = new Date(`${term.start}T12:00:00Z`);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ANU Hub prototype//Timetable//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:ANU timetable"];
  for (const s of slots) {
    const first = new Date(start);
    first.setUTCDate(start.getUTCDate() + ((s.day - start.getUTCDay() + 7) % 7));
    const day = first.toISOString().slice(0, 10);
    lines.push(
      "BEGIN:VEVENT",
      `UID:slot-${s.id}@anuhub.local`,
      `DTSTAMP:${stamp(term.start)}Z`,
      `DTSTART;TZID=Australia/Sydney:${stamp(day, s.start)}`,
      `DTEND;TZID=Australia/Sydney:${stamp(day, s.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${stamp(term.end, "23:59")}Z`,
      `SUMMARY:${esc(`${s.courseCode} ${s.activity}`)}`,
      `DESCRIPTION:${esc(`${titles.get(s.courseCode) ?? ""} — ${s.label}`)}`,
      `LOCATION:${esc(s.location)}`,
      "END:VEVENT",
    );
  }
  for (const e of upcomingEvents().filter((e) => e.kind === "exam")) {
    lines.push("BEGIN:VEVENT", `UID:event-${e.id}@anuhub.local`, `DTSTAMP:${stamp(term.start)}Z`, `DTSTART;VALUE=DATE:${e.date.replaceAll("-", "")}`, `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(e.description)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="anu-timetable.ics"' },
  });
};
