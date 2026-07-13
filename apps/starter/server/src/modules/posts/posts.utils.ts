export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "post";
}

export function createExcerpt(excerpt: string | null | undefined, content: string): string {
  if (excerpt?.trim()) {
    return excerpt.trim();
  }

  return content.replace(/\s+/g, " ").trim().slice(0, 180);
}
