// The information architecture: every ANUHub topic, grouped by what a
// student is trying to do. `legacy` keeps the old ANUHub names searchable so
// nothing a returning student looks for has disappeared.

export type NavKey =
  | "home"
  | "enrolment"
  | "timetable"
  | "degree"
  | "records"
  | "graduation"
  | "account"
  | "personal"
  | "messages"
  | "requests"
  | "resources"
  | "readme";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: string;
  blurb: string;
  legacy: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "",
    items: [{ key: "home", label: "Home", href: "/", icon: "home", blurb: "Your day, your deadlines and your degree at a glance.", legacy: ["ANUHub", "Student Homepage", "Announcements", "Tasks"] }],
  },
  {
    label: "Study",
    items: [
      { key: "enrolment", label: "Enrolment", href: "/enrolment/", icon: "enrol", blurb: "Plan, price and confirm next semester's courses.", legacy: ["Enrolment", "Class search", "Add courses", "Drop courses"] },
      { key: "timetable", label: "Timetables", href: "/timetable/", icon: "calendar", blurb: "Your week, and Allocate to Your Class.", legacy: ["Timetables", "Allocate to Your Class", "Exam timetable"] },
      { key: "degree", label: "Degree Management", href: "/degree/", icon: "route", blurb: "Progress, requirements and what to take next.", legacy: ["Manage my Degree", "Degree Management", "Program requirements"] },
      { key: "records", label: "Academic Records", href: "/records/", icon: "records", blurb: "Results, GPA, WAM and your transcript.", legacy: ["Academic Records", "Grades", "Unofficial transcript"] },
      { key: "graduation", label: "Graduation", href: "/graduation/", icon: "cap", blurb: "Eligibility, ceremonies and celebrating the finish.", legacy: ["Graduation", "Apply to graduate", "Graduation eligibility"] },
    ],
  },
  {
    label: "Money",
    items: [{ key: "account", label: "Account Details", href: "/account/", icon: "wallet", blurb: "Charges to Pay, fees explained, HELP and refunds.", legacy: ["Charges to Pay", "Account Details", "Invoices", "Commonwealth Assistance Form"] }],
  },
  {
    label: "You",
    items: [
      { key: "messages", label: "Student Messages", href: "/messages/", icon: "mail", blurb: "Everything ANU has sent you, in one inbox.", legacy: ["Student Messages", "Notifications"] },
      { key: "personal", label: "Personal Data", href: "/personal/", icon: "user", blurb: "Names, contacts, addresses and your password.", legacy: ["Personal Data", "Change Password", "Emergency contact"] },
      { key: "requests", label: "Requests", href: "/requests/", icon: "inbox", blurb: "Special consideration, credit, WHS incidents and more.", legacy: ["Requests", "WHS Incident Notification", "Special consideration"] },
    ],
  },
  {
    label: "More",
    items: [{ key: "resources", label: "Additional Resources", href: "/resources/", icon: "bulb", blurb: "Help, guides and the full system menu.", legacy: ["Additional Resources", "Enterprise Components", "PeopleTools", "Recently Visited", "Favourites"] }],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

export const navItem = (key: NavKey) => NAV_ITEMS.find((i) => i.key === key);

// Deep links the palette can jump straight to — including every item from
// the old ANUHub menu drawer.
export const SHORTCUTS: { label: string; href: string; hint: string; icon: string }[] = [
  { label: "Allocate to Your Class", href: "/timetable/#allocate", hint: "Timetables", icon: "calendar" },
  { label: "Charges to Pay", href: "/account/#charges", hint: "Account Details", icon: "wallet" },
  { label: "How my fees are calculated", href: "/account/#fees", hint: "Account Details", icon: "dollar" },
  { label: "Commonwealth Assistance Form", href: "/account/#caf", hint: "Account Details", icon: "shield" },
  { label: "Refund bank account", href: "/account/#bank", hint: "Account Details", icon: "building" },
  { label: "Change Password", href: "/personal/#password", hint: "Personal Data", icon: "key" },
  { label: "Emergency contact", href: "/personal/#emergency", hint: "Personal Data", icon: "user" },
  { label: "WHS Incident Notification", href: "/requests/?type=whs#new", hint: "Requests", icon: "alert" },
  { label: "Special consideration", href: "/requests/?type=special#new", hint: "Requests", icon: "inbox" },
  { label: "Unofficial transcript", href: "/records/#transcript", hint: "Academic Records", icon: "printer" },
  { label: "Degree requirements", href: "/degree/#requirements", hint: "Degree Management", icon: "route" },
  { label: "Enrolment rules & policy checks", href: "/degree/#policy", hint: "Degree Management", icon: "ok" },
  { label: "Register intention to graduate", href: "/graduation/#intent", hint: "Graduation", icon: "cap" },
  { label: "Enterprise Components", href: "/resources/#system", hint: "System menu", icon: "tool" },
  { label: "PeopleTools", href: "/resources/#system", hint: "System menu", icon: "tool" },
  { label: "Announcements", href: "/#attention", hint: "Home", icon: "megaphone" },
  { label: "Tasks", href: "/#attention", hint: "Home", icon: "tasks" },
  { label: "Download timetable (.ics)", href: "/api/timetable.ics", hint: "Timetables", icon: "download" },
  { label: "About this redesign", href: "/readme/", hint: "README", icon: "info" },
];
