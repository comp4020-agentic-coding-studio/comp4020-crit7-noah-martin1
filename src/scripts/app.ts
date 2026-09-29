// Progressive enhancement for the whole app. Every page works without this
// file (forms POST and redirect); with it, submissions swap in place with a
// view transition, and search, toasts and celebrations come alive. All
// listeners are delegated from document so swapped-in markup just works.

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const reducedMotion = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

// --- toasts ------------------------------------------------------------------

function toast(message: string, tone: "ok" | "error" = "ok") {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast${tone === "error" ? " toast--error" : ""}`;
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.innerHTML = `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    tone === "error" ? '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>' : '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'
  }</svg><span></span>`;
  (el.querySelector("span") as HTMLElement).textContent = message;
  host.append(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 4000);
}

function consumeFlash(url: URL) {
  const message = url.searchParams.get("toast");
  if (!message) return;
  toast(message, url.searchParams.get("tone") === "error" ? "error" : "ok");
  if (url.searchParams.get("celebrate")) setTimeout(celebrate, 150);
  url.searchParams.delete("toast");
  url.searchParams.delete("tone");
  url.searchParams.delete("celebrate");
  history.replaceState(history.state, "", url.pathname + (url.search || "") + url.hash);
}

// --- confetti -------------------------------------------------------------------

function celebrate(origin?: { x: number; y: number }) {
  if (reducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  const colours = ["#e2a61c", "#008694", "#c65226", "#be830e", "#3cbfae"];
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement("i");
    const angle = Math.random() * Math.PI * 2;
    const dist = 160 + Math.random() * 420;
    piece.style.cssText = [
      `--x:${ox}px`,
      `--y:${oy}px`,
      `--dx:${Math.cos(angle) * dist}px`,
      `--dy:${Math.sin(angle) * dist * 0.7 + 260 + Math.random() * 200}px`,
      `--r:${(Math.random() - 0.5) * 1080}deg`,
      `--s:${7 + Math.random() * 9}px`,
      `--c:${colours[i % colours.length]}`,
      `--d:${1100 + Math.random() * 900}ms`,
    ].join(";");
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}

// --- confirm dialog ---------------------------------------------------------------

function confirmAction(title: string, body: string, ok: string): Promise<boolean> {
  const dialog = $<HTMLDialogElement>("#confirm");
  if (!dialog) return Promise.resolve(window.confirm(body));
  ($("#confirm-title", dialog) as HTMLElement).textContent = title;
  ($("#confirm-body", dialog) as HTMLElement).textContent = body;
  ($("[data-confirm-ok]", dialog) as HTMLElement).textContent = ok;
  dialog.showModal();
  ($("[data-confirm-cancel]", dialog) as HTMLElement).focus();
  return new Promise((resolve) => {
    const finish = (value: boolean) => {
      dialog.close();
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", onCancel);
      resolve(value);
    };
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-confirm-ok]")) finish(true);
      else if (t.closest("[data-confirm-cancel]") || t === dialog) finish(false);
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      finish(false);
    };
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", onCancel);
  });
}

// --- in-place form submissions ------------------------------------------------------

const SWAP_REGIONS = ["#main", "#sidebar", ".topbar", ".tabbar"];

async function swapFrom(html: string, url: URL) {
  const next = new DOMParser().parseFromString(html, "text/html");
  const focusedId = document.activeElement?.id;
  const apply = () => {
    for (const sel of SWAP_REGIONS) {
      const from = next.querySelector(sel);
      const to = document.querySelector(sel);
      if (!from || !to) continue;
      if (sel === ".topbar") {
        // keep the dialogs mounted; refresh only the counts and panels
        for (const part of [".crumbs", '[popovertarget="notifications"]', "#notifications"]) {
          const a = from.querySelector(part);
          const b = to.querySelector(part);
          if (a && b) b.replaceWith(a);
        }
        continue;
      }
      to.replaceWith(from);
    }
    document.title = next.title;
    document.documentElement.dataset.theme = next.documentElement.dataset.theme;
    document.documentElement.dataset.motion = next.documentElement.dataset.motion;
    document.documentElement.dataset.text = next.documentElement.dataset.text;
  };
  document.documentElement.classList.add("swapped", "swapping");
  if (document.startViewTransition && !reducedMotion()) {
    await document.startViewTransition(apply).finished.catch(() => undefined);
  } else {
    apply();
  }
  document.documentElement.classList.remove("swapping");
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  const target = url.hash && document.getElementById(url.hash.slice(1));
  if (target && target.dataset.flashOnSwap !== undefined) {
    target.classList.remove("flash");
    void target.offsetWidth;
    target.classList.add("flash");
  }
  initPage();
}

document.addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement;
  if (form.method.toLowerCase() !== "post" || form.hasAttribute("data-reload")) return;
  event.preventDefault();
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;

  const ask = submitter?.dataset.confirm ?? form.dataset.confirm;
  if (ask) {
    const ok = await confirmAction(submitter?.dataset.confirmTitle ?? form.dataset.confirmTitle ?? "Are you sure?", ask, submitter?.dataset.confirmOk ?? form.dataset.confirmOk ?? "Confirm");
    if (!ok) return;
  }

  const body = new FormData(form, submitter ?? undefined);
  submitter?.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(form.action, { method: "POST", body, headers: { accept: "text/html" } });
    const url = new URL(res.url);
    if (!res.ok) throw new Error(String(res.status));
    if (url.pathname !== location.pathname) {
      location.href = res.url;
      return;
    }
    await swapFrom(await res.text(), url);
    consumeFlash(url);
    if (url.search !== location.search && !url.searchParams.has("toast")) history.replaceState(null, "", url.pathname + url.search + location.hash);
  } catch {
    toast("That didn't go through — please try again.", "error");
  } finally {
    submitter?.removeAttribute("aria-busy");
  }
});

document.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.matches("select[data-nav]")) {
    location.href = (input.dataset.nav ?? "").replace("{v}", encodeURIComponent(input.value));
    return;
  }
  if (!input.matches("[data-autosubmit]")) return;
  if (input.form?.hasAttribute("data-prefs")) {
    const root = document.documentElement;
    if (input.name === "theme") root.dataset.theme = input.value;
    if (input.name === "motion") root.dataset.motion = input.value;
    if (input.name === "textSize") root.dataset.text = input.value;
  }
  input.form?.requestSubmit();
});

// --- command palette ------------------------------------------------------------------

const palette = () => $<HTMLDialogElement>("#palette");

function openPalette(query = "") {
  const dialog = palette();
  if (!dialog || dialog.open) return;
  const input = $<HTMLInputElement>("#palette-input", dialog)!;
  input.value = query;
  filterPalette();
  dialog.showModal();
  input.focus();
}

function score(text: string, q: string): number {
  const t = text.toLowerCase();
  if (!q) return 1;
  const i = t.indexOf(q);
  if (i === 0) return 100;
  if (i > 0) return 60 - Math.min(i, 40) / 2 + (t[i - 1] === " " ? 20 : 0);
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti === -1) return 0;
    ti++;
  }
  return 10;
}

function highlight(el: HTMLElement, q: string) {
  const label = el.querySelector("span:not(.chip)") as HTMLElement | null;
  if (!label) return;
  const text = label.dataset.raw ?? label.textContent ?? "";
  label.dataset.raw = text;
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) {
    label.textContent = text;
    return;
  }
  label.replaceChildren(text.slice(0, i), Object.assign(document.createElement("mark"), { textContent: text.slice(i, i + q.length) }), text.slice(i + q.length));
}

function filterPalette() {
  const dialog = palette();
  if (!dialog) return;
  const q = ($<HTMLInputElement>("#palette-input", dialog)?.value ?? "").trim().toLowerCase();
  let visible = 0;
  for (const group of $$("[data-group]", dialog)) {
    const items = $$<HTMLElement>(".palette__item", group);
    const searchOnly = group.hasAttribute("data-search-only");
    const ranked = items.map((el) => ({ el, s: score(el.dataset.text ?? "", q) }));
    let shown = 0;
    for (const { el, s } of ranked) {
      const show = q ? s > 0 : !searchOnly;
      el.hidden = !show || (q !== "" && shown >= 8 && searchOnly);
      if (!el.hidden) shown++;
      highlight(el, q);
    }
    ranked
      .filter((r) => !r.el.hidden)
      .sort((a, b) => b.s - a.s)
      .forEach((r) => group.append(r.el));
    group.hidden = shown === 0;
    visible += shown;
  }
  ($(".palette__empty", dialog) as HTMLElement).hidden = visible > 0;
  select(0);
}

function visibleOptions() {
  const dialog = palette();
  return dialog ? $$<HTMLElement>(".palette__item", dialog).filter((el) => !el.hidden && !(el.parentElement as HTMLElement).hidden) : [];
}

function select(index: number) {
  const options = visibleOptions();
  const input = $<HTMLInputElement>("#palette-input");
  $$(".palette__item").forEach((el) => el.setAttribute("aria-selected", "false"));
  options.forEach((el, i) => el.setAttribute("aria-selected", String(i === index)));
  const active = options[index];
  if (active) {
    input?.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  } else input?.removeAttribute("aria-activedescendant");
}

document.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const el = event.target;
  if (el.id === "palette-input") filterPalette();
  if (el.matches("[data-filter]")) applyCatalogueFilter();
  if (el.matches("[data-count]")) updateCounter(el as HTMLTextAreaElement);
  if (el.matches("[data-strength]")) updateStrength(el as HTMLInputElement);
});

document.addEventListener("keydown", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : document.body;
  const typing = target.matches("input, textarea, select, [contenteditable]");
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const dialog = palette();
    if (dialog?.open) dialog.close();
    else openPalette();
    return;
  }
  if (event.key === "/" && !typing) {
    event.preventDefault();
    openPalette();
    return;
  }
  if (target.id === "palette-input") {
    const options = visibleOptions();
    const current = options.findIndex((el) => el.getAttribute("aria-selected") === "true");
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select(Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      select(Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      options[Math.max(0, current)]?.click();
    }
  }
  if (event.key === "Escape" && document.documentElement.classList.contains("nav-open")) setNav(false);
});

// --- clicks ---------------------------------------------------------------------

function setNav(open: boolean) {
  document.documentElement.classList.toggle("nav-open", open);
  $$("[data-nav-toggle]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const t = event.target as HTMLElement;
  if (t.closest("[data-palette-open]")) {
    openPalette();
    return;
  }
  const dialog = palette();
  if (dialog?.open) {
    if (t === dialog) dialog.close();
    if (t.closest(".palette__item")) dialog.close();
  }
  if (t.closest("[data-nav-toggle]")) {
    setNav(!document.documentElement.classList.contains("nav-open"));
    return;
  }
  if (t.closest("[data-nav-close]") || (t.closest(".sidebar a") && innerWidth <= 1020)) setNav(false);
  const burst = t.closest<HTMLElement>("[data-celebrate]");
  if (burst) {
    const r = burst.getBoundingClientRect();
    celebrate({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  const chip = t.closest<HTMLButtonElement>("[data-filter-chip]");
  if (chip) {
    const pressed = chip.getAttribute("aria-pressed") === "true";
    const group = chip.dataset.filterChip;
    if (chip.dataset.exclusive !== undefined) $$(`[data-filter-chip="${group}"]`).forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", String(!pressed));
    applyCatalogueFilter();
  }
});

// --- catalogue filter ----------------------------------------------------------------

function applyCatalogueFilter() {
  const input = $<HTMLInputElement>("[data-filter]");
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  const levels = $$('[data-filter-chip="level"][aria-pressed="true"]').map((c) => c.dataset.value);
  const fits = $('[data-filter-chip="fits"]')?.getAttribute("aria-pressed") === "true";
  const offered = $('[data-filter-chip="offered"]')?.getAttribute("aria-pressed") === "true";
  let shown = 0;
  for (const card of $$("[data-course]")) {
    const ok =
      (!q || (card.dataset.text ?? "").includes(q)) &&
      (!levels.length || levels.includes(card.dataset.level)) &&
      (!fits || card.dataset.fits === "true") &&
      (!offered || card.dataset.offered === "true");
    card.hidden = !ok;
    if (ok) shown++;
  }
  const count = $("[data-filter-count]");
  if (count) count.textContent = `${shown} course${shown === 1 ? "" : "s"}`;
  const empty = $("[data-filter-empty]");
  if (empty) empty.hidden = shown > 0;
}

// --- small form helpers -----------------------------------------------------------------

function updateCounter(el: HTMLTextAreaElement) {
  const out = document.getElementById(el.dataset.count ?? "");
  if (out) out.textContent = `${el.value.length} / ${el.maxLength}`;
}

function updateStrength(el: HTMLInputElement) {
  const meter = document.getElementById(el.dataset.strength ?? "");
  if (!meter) return;
  const v = el.value;
  const score = [v.length >= 12, /[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
  meter.style.setProperty("--score", String(v ? score : 0));
  meter.dataset.score = String(v ? score : 0);
  const label = meter.querySelector("[data-strength-label]");
  if (label) label.textContent = v ? ["Too weak", "Weak", "Fair", "Good", "Strong"][score] : "Enter a new password";
}

// --- per-page init (runs on load and after every swap) -----------------------------

function initPage() {
  applyCatalogueFilter();
  $$<HTMLTextAreaElement>("[data-count]").forEach(updateCounter);
  const now = $<HTMLElement>("[data-now-line]");
  if (now) {
    const tick = () => {
      const d = new Date();
      const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const mins = Number(get("hour")) * 60 + Number(get("minute"));
      now.style.setProperty("--now", String(mins));
    };
    tick();
  }
  if ($("[data-celebrate-on-load]") && !sessionStorageSeen("celebrated:" + location.pathname)) setTimeout(celebrate, 700);
}

function sessionStorageSeen(key: string) {
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
  } catch {
    // storage blocked; celebrate anyway
  }
  return false;
}

const topbar = () => $("#topbar");
let ticking = false;
addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      topbar()?.classList.toggle("is-scrolled", scrollY > 8);
      ticking = false;
    });
  },
  { passive: true },
);

consumeFlash(new URL(location.href));
initPage();
