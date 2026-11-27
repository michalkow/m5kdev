import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { supportManifestSchema } from "@m5kdev/commons/modules/support/support.schema";
import { type DefaultTreeAdapterMap, parse } from "parse5";
import type { z } from "zod";

type Node = DefaultTreeAdapterMap["node"];
type Entry = z.infer<typeof supportManifestSchema>["entries"][number];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function children(node: Node): Node[] {
  return "childNodes" in node ? node.childNodes : [];
}
function attr(node: Node, name: string): string | undefined {
  return "attrs" in node ? node.attrs.find((item) => item.name === name)?.value : undefined;
}
function find(node: Node, predicate: (node: Node) => boolean): Node | undefined {
  if (predicate(node)) return node;
  for (const child of children(node)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}
function text(node: Node): string {
  if (
    ("tagName" in node && ["script", "style", "nav", "button"].includes(node.tagName)) ||
    attr(node, "aria-hidden") === "true"
  )
    return "";
  if ("value" in node) return node.value;
  return children(node).map(text).join(" ");
}
async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await files(file)));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
/** Docusaurus postBuild boundary: consumes rendered public pages, never framework or staff docs. */
export async function writeSupportDocumentationPart(input: {
  outDir: string;
  locale: string;
  applicationVersion: string;
  experience: string;
}): Promise<void> {
  const entries: Entry[] = [];
  const locale = input.locale.replaceAll("_", "-");
  for (const file of (await files(input.outDir)).filter((file) => file.endsWith(".html"))) {
    const doc = parse(await readFile(file, "utf8"));
    const html = find(doc, (node) => "tagName" in node && node.tagName === "html");
    if (!html || attr(html, "lang") !== locale) continue;
    const article = find(doc, (node) => "tagName" in node && node.tagName === "article");
    const canonical = find(
      doc,
      (node) => "tagName" in node && node.tagName === "link" && attr(node, "rel") === "canonical"
    );
    const url = canonical ? attr(canonical, "href") : undefined;
    if (!article || !url) continue;
    const content = text(article).replace(/\s+/g, " ").trim();
    if (!content) continue;
    const heading = find(article, (node) => "tagName" in node && node.tagName === "h1");
    entries.push({
      id: digest(url).slice(0, 32),
      locale,
      experience: input.experience,
      url,
      title: heading ? text(heading).replace(/\s+/g, " ").trim() : url,
      text: content,
      sha256: digest(content),
    });
  }
  if (!entries.length) throw new Error(`No public Support documentation articles for ${locale}`);
  await writeFile(
    path.join(input.outDir, "support-manifest.part.json"),
    JSON.stringify({ applicationVersion: input.applicationVersion, entries })
  );
}
/** Run once after all locale builds; publishes one complete, reproducible release version. */
export async function combineSupportDocumentationParts(
  root: string
): Promise<z.infer<typeof supportManifestSchema>> {
  const parts = (await files(root)).filter(
    (file) => path.basename(file) === "support-manifest.part.json"
  );
  const entries: Entry[] = [];
  let applicationVersion: string | undefined;
  for (const file of parts.sort()) {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const parsed = supportManifestSchema
      .pick({ applicationVersion: true, entries: true })
      .parse(raw);
    if (applicationVersion && applicationVersion !== parsed.applicationVersion)
      throw new Error("Support documentation parts target different application versions");
    applicationVersion = parsed.applicationVersion;
    entries.push(...parsed.entries);
  }
  entries.sort(
    (a, b) =>
      a.locale.localeCompare(b.locale) ||
      a.experience.localeCompare(b.experience) ||
      a.url.localeCompare(b.url)
  );
  const manifest = supportManifestSchema.parse({
    schemaVersion: 1,
    version: digest(JSON.stringify({ applicationVersion, entries })),
    applicationVersion,
    generatedAt: new Date().toISOString(),
    entries,
  });
  await writeFile(path.join(root, "support-manifest.json"), JSON.stringify(manifest));
  return manifest;
}
