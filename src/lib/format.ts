const TZ = "Australia/Sydney";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const audWhole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export const formatAUD = (cents: number) => aud.format(cents / 100);
export const formatAUDWhole = (cents: number) => audWhole.format(cents / 100);

// Dates are stored as ISO calendar dates; pin them to noon UTC so formatting
// in any server timezone lands on the same day.
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "UTC" }).format(asDate(iso));
}

export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function daysUntil(iso: string, today = todayISO()) {
  return Math.round((asDate(iso).getTime() - asDate(today).getTime()) / 864e5);
}

export function relativeDay(iso: string, today = todayISO()) {
  const d = daysUntil(iso, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d} days ago`;
  if (d < 7) return `In ${d} days`;
  if (d < 60) return `In ${Math.round(d / 7)} week${Math.round(d / 7) > 1 ? "s" : ""}`;
  return `In ${Math.round(d / 30)} months`;
}

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function weekdayIndex(now = new Date()) {
  const name = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function minutesNow(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(now).split(":").map(Number);
  return h * 60 + m;
}

export function timeAgo(sqlDate: string, now = new Date()) {
  const then = new Date(`${sqlDate.replace(" ", "T")}Z`).getTime();
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(sqlDate.slice(0, 10));
}

export const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const DAYS_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export const mask = (s: string, keep = 3) => (s.length > keep ? `${"•".repeat(Math.max(0, s.length - keep))}${s.slice(-keep)}` : s);
