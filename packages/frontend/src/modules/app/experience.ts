import { publicExperienceSchema } from "@m5kdev/commons/modules/app/experience.schema";

/** Bootstrap runs before auth/query providers; it exposes presentation only. */
export async function loadExperience(options: { url?: string; signal?: AbortSignal } = {}) {
  const response = await fetch(options.url ?? "/app/experience", {
    signal: options.signal,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Experience bootstrap failed (${response.status})`);
  return publicExperienceSchema.parse(await response.json());
}
