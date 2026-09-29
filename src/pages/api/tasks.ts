import type { APIRoute } from "astro";
import { setTask, updateStudent } from "../../lib/data";
import { done, field, safeBack } from "../../lib/http";

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const key = field(form, "key", 80);
  const back = safeBack(form.get("back"));
  if (!key) return done(back, { ok: false, message: "Unknown task." });
  // Confirming the emergency contact is a real action, not just hiding the nag.
  if (key === "emergency") updateStudent({ emergencyUpdatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
  setTask(key, form.get("undo") !== "1");
  return done(back, { ok: true, message: form.get("undo") === "1" ? "Task restored" : "Nice — task ticked off" });
};
