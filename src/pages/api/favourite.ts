import type { APIRoute } from "astro";
import { toggleFavourite } from "../../lib/data";
import { done, field, safeBack } from "../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const path = safeBack(form.get("path"), "");
  const label = field(form, "label", 60);
  const back = safeBack(form.get("back"));
  if (!path || !label) return done(back, { ok: false, message: "Couldn't update favourites." });
  const added = toggleFavourite(path, label);
  return done(back, { ok: true, message: added ? `${label} pinned to your sidebar` : `${label} removed from favourites` });
};
