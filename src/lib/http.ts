// Post/redirect/get helpers. Every write answers with a 303 back to a page,
// carrying a one-line toast the client shows (and strips from the URL).

export function done(to: string, result: { ok: boolean; message: string }, extra: Record<string, string> = {}) {
  const [path, hash = ""] = to.split("#");
  const url = new URL(path, "http://local");
  for (const key of ["toast", "tone", "celebrate"]) url.searchParams.delete(key);
  url.searchParams.set("toast", result.message);
  if (!result.ok) url.searchParams.set("tone", "error");
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return new Response(null, { status: 303, headers: { Location: `${url.pathname}${url.search}${hash ? `#${hash}` : ""}` } });
}

export function safeBack(value: FormDataEntryValue | null, fallback = "/") {
  const s = String(value ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

export function field(form: FormData, key: string, max = 200) {
  return String(form.get(key) ?? "")
    .trim()
    .slice(0, max);
}
