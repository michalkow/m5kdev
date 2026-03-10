export function arrayToPseudoXML<T extends Record<string, unknown>>(
  array: readonly T[],
  keys: readonly (keyof T)[],
  name = "item"
): string {
  return array
    .map(
      (item) =>
        `<${name}>${keys
          .map((key) => `<${String(key)}>${String(item[key])}</${String(key)}>`)
          .join("\n")}</${name}>`
    )
    .join("\n");
}
