export interface BooleanCapability {
  readonly kind: "boolean";
}

export function booleanCapability(): BooleanCapability {
  return { kind: "boolean" };
}

export function defineCapabilities<const T extends Record<string, BooleanCapability>>(
  capabilities: T
): T {
  return capabilities;
}

export function composeCapabilities<const T extends readonly Record<string, BooleanCapability>[]>(
  ...fragments: T
): UnionCapabilityFragments<T> {
  const composed: Record<string, BooleanCapability> = {};
  for (const fragment of fragments) {
    for (const key of Object.keys(fragment)) {
      if (key in composed) {
        throw new Error(`Duplicate Capability ${key}`);
      }
      const capability = fragment[key];
      if (capability) composed[key] = capability;
    }
  }
  return composed as UnionCapabilityFragments<T>;
}

type UnionCapabilityFragments<T extends readonly Record<string, BooleanCapability>[]> =
  T extends readonly [infer First, ...infer Rest]
    ? First &
        (Rest extends readonly Record<string, BooleanCapability>[]
          ? UnionCapabilityFragments<Rest>
          : unknown)
    : Record<string, never>;

export function unknownCapabilities(
  catalog: Record<string, unknown>,
  requested: readonly string[]
): string[] {
  return requested.filter((capability) => !(capability in catalog));
}

export function assertBundlesNameKnownCapabilities(
  capabilities: Record<string, BooleanCapability>,
  bundles: Record<string, readonly string[]>
): void {
  for (const [bundleName, keys] of Object.entries(bundles)) {
    for (const key of keys) {
      if (!(key in capabilities)) {
        throw new Error(`Bundle ${bundleName} names unknown Capability ${key}`);
      }
    }
  }
}

export function defineBundles<C extends Record<string, BooleanCapability>>(
  capabilities: C,
  bundles: Record<string, readonly (keyof C & string)[]>
): EntitlementCatalog<C> {
  assertBundlesNameKnownCapabilities(capabilities, bundles);
  return { capabilities, bundles };
}

export interface EntitlementCatalog<
  C extends Record<string, BooleanCapability> = Record<string, BooleanCapability>,
> {
  readonly capabilities: C;
  readonly bundles: Record<string, readonly (keyof C & string)[]>;
}
