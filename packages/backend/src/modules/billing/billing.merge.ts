function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mergePlain(
  defaults: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const [key, overlayValue] of Object.entries(overlay)) {
    if (overlayValue === undefined) continue;
    if (isPlainObject(overlayValue)) {
      const base = isPlainObject(result[key]) ? result[key] : {};
      result[key] = mergePlain(base, overlayValue);
    } else {
      result[key] = overlayValue;
    }
  }
  return result;
}

/** Deep-merge a Stripe session create overlay onto Kernel defaults. Arrays replace. */
export function mergeSessionCreateParams<T extends object>(defaults: T, overlay?: object): T {
  if (!overlay) return { ...defaults };
  return mergePlain(defaults as Record<string, unknown>, overlay as Record<string, unknown>) as T;
}
