import type { APIRoute } from "astro";
import { updateStudent } from "../../lib/data";
import { done, safeBack } from "../../lib/http";

const pick = <T extends string>(value: FormDataEntryValue | null, options: readonly T[]) => (options.includes(value as T) ? (value as T) : undefined);

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const theme = pick(form.get("theme"), ["system", "light", "dark"] as const);
  const motion = pick(form.get("motion"), ["full", "reduced"] as const);
  const textSize = pick(form.get("textSize"), ["standard", "large"] as const);
  updateStudent({ ...(theme && { theme }), ...(motion && { motion }), ...(textSize && { textSize }) });
  return done(safeBack(form.get("back")), { ok: true, message: "Display settings saved" });
};
