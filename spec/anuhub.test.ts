import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// Contracts for the ANU Hub redesign, driven over HTTP against the built
// server (throwaway database, seeded sample student). They test what a
// student can see and do, not how the pages are built.
const baseUrl = inject("baseUrl");

async function page(path: string) {
  const res = await fetch(new URL(path, baseUrl));
  const html = await res.text();
  return { res, doc: new JSDOM(html).window.document, text: new JSDOM(html).window.document.body.textContent ?? "" };
}

// Astro rejects cross-origin form posts; browsers send Origin, fetch doesn't.
const post = (path: string, body: Record<string, string>) =>
  fetch(new URL(path, baseUrl), { method: "POST", headers: { origin: baseUrl }, body: new URLSearchParams(body), redirect: "manual" });

const TOPICS = ["Academic Records", "Account Details", "Degree Management", "Enrolment", "Graduation", "Personal Data", "Student Messages", "Timetables"];

describe("navigation", () => {
  it("links every ANUHub topic from the main navigation, and each one loads", async () => {
    const { doc } = await page("/");
    const links = [...doc.querySelectorAll<HTMLAnchorElement>('nav[aria-label="ANU Hub"] a')];
    for (const topic of TOPICS) {
      const link = links.find((a) => a.textContent?.trim().startsWith(topic));
      expect(link, `no nav link for ${topic}`).toBeTruthy();
      const res = await fetch(new URL(link!.getAttribute("href")!, baseUrl));
      expect(res.status, `${topic} → ${link!.getAttribute("href")}`).toBe(200);
    }
  });
});

describe("nothing from the old ANUHub was removed", () => {
  const KEPT: [string, string][] = [
    ["/", "Announcements"],
    ["/", "Information on Campus Closures"],
    ["/", "Tasks"],
    ["/", "Recently Visited"],
    ["/", "Favourites"],
    ["/", "Allocate to Your Class"],
    ["/", "Manage my Degree"],
    ["/", "Charges to Pay"],
    ["/", "Additional Resources"],
    ["/", "Requests"],
    ["/timetable/", "Allocate to Your Class"],
    ["/account/", "Charges to Pay"],
    ["/personal/", "Change Password"],
    ["/resources/", "WHS Incident Notification"],
    ["/resources/", "Enterprise Components"],
    ["/resources/", "PeopleTools"],
    ["/requests/?type=whs", "WHS Incident Notification"],
  ];
  for (const [path, label] of KEPT) {
    it(`${path} still offers “${label}”`, async () => {
      expect((await page(path)).text).toContain(label);
    });
  }
});

describe("personalisation", () => {
  it("greets the student by preferred name, and a new name persists across reloads", async () => {
    expect((await page("/")).doc.querySelector("h1")?.textContent).toContain("Noah");
    const res = await post("/personal/", { intent: "names", preferredName: "Nono", pronouns: "" });
    expect(res.status).toBe(303);
    expect((await page("/")).doc.querySelector("h1")?.textContent).toContain("Nono");
    await post("/personal/", { intent: "names", preferredName: "Noah", pronouns: "" });
  });
});

describe("degree progress", () => {
  it("shows completed units out of the program total as a progress bar", async () => {
    const { doc } = await page("/degree/");
    const bar = [...doc.querySelectorAll('[role="img"]')].find((el) => /132 of 192 units/.test(el.getAttribute("aria-label") ?? ""));
    expect(bar).toBeTruthy();
  });
});

describe("enrolment", () => {
  it("prices a course before it's added, and keeps the cart after a reload", async () => {
    const before = await page("/enrolment/?term=2027-S1");
    const card = before.doc.querySelector("#course-COMP2560");
    expect(card?.textContent).toMatch(/\$1,164\.38/);

    const res = await post("/enrolment/?term=2027-S1", { intent: "add", code: "COMP2560", term: "2027-S1" });
    expect(res.status).toBe(303);

    const after = await page("/enrolment/?term=2027-S1");
    const cart = after.doc.querySelector("#cart");
    expect(cart?.textContent).toContain("COMP2560");
    expect(cart?.textContent).toMatch(/Total for S1 2027\s*\$1,351\.38/);
    await post("/enrolment/?term=2027-S1", { intent: "remove", code: "COMP2560", term: "2027-S1" });
  });

  it("warns when a plan goes past 10 first-year courses", async () => {
    const warning = async () => (await page("/enrolment/?term=2027-S1")).doc.querySelector('[data-check="first-year"]');
    expect((await warning())?.className).not.toContain("alert--warn");
    for (const code of ["COMP1730", "STAT1008"]) await post("/enrolment/?term=2027-S1", { intent: "add", code, term: "2027-S1" });
    const w = await warning();
    expect(w?.className).toContain("alert--warn");
    expect(w?.textContent).toMatch(/11 first-year courses/);
    for (const code of ["COMP1730", "STAT1008"]) await post("/enrolment/?term=2027-S1", { intent: "remove", code, term: "2027-S1" });
  });

  it("refuses a course that isn't offered in the chosen semester", async () => {
    const res = await post("/enrolment/?term=2027-S1", { intent: "add", code: "COMP3430", term: "2027-S1" });
    expect(res.headers.get("location")).toContain("tone=error");
    expect((await page("/enrolment/?term=2027-S1")).doc.querySelector("#cart")?.textContent).not.toContain("COMP3430");
  });
});

describe("persistence", () => {
  it("remembers a class allocation", async () => {
    const { doc } = await page("/timetable/");
    const open = [...doc.querySelectorAll<HTMLInputElement>('#allocate-COMP3900 input[name="slotId"]')].find((i) => !i.disabled && !i.checked);
    expect(open).toBeTruthy();
    expect((await post("/timetable/", { slotId: open!.value, code: "COMP3900", term: "2026-S2" })).status).toBe(303);
    const again = (await page("/timetable/")).doc.querySelector<HTMLInputElement>(`#allocate-COMP3900 input[value="${open!.value}"]`);
    expect(again?.checked).toBe(true);
  });

  it("remembers that a message was read", async () => {
    const unread = () => page("/messages/").then(({ doc }) => doc.querySelector('a.thread--unread[href$="id=1"]'));
    expect(await unread()).toBeTruthy();
    await page("/messages/?id=1");
    expect(await unread()).toBeNull();
  });
});
