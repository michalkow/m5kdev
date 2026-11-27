import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  combineSupportDocumentationParts,
  writeSupportDocumentationPart,
} from "../support.documentation";

it("exports only rendered public article text with canonical locale and reproducible hashes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "support-docs-"));
  try {
    await writeFile(
      path.join(root, "index.html"),
      '<html lang="en"><head><link rel="canonical" href="https://help.local/documentation/"></head><body><nav>Private navigation</nav><article><h1>Help &amp; answers</h1><p>Reset your password.</p><script>untrusted()</script></article></body></html>'
    );
    await writeSupportDocumentationPart({
      outDir: root,
      locale: "en",
      applicationVersion: "v1",
      experience: "default",
    });
    const regional = path.join(root, "en-GB");
    await mkdir(regional);
    await writeFile(
      path.join(regional, "index.html"),
      '<html lang="en-GB"><head><link rel="canonical" href="https://help.local/documentation/en-GB/"></head><body><article><h1>British help</h1><p>Use your organisation.</p></article></body></html>'
    );
    await writeSupportDocumentationPart({
      outDir: regional,
      locale: "en-GB",
      applicationVersion: "v1",
      experience: "default",
    });
    const manifest = await combineSupportDocumentationParts(root);
    expect(manifest.entries.map((entry) => entry.locale)).toEqual(["en", "en-GB"]);
    expect(manifest.entries[0].text).toBe("Help & answers Reset your password.");
    expect(manifest.entries[0].sha256).toBe(
      createHash("sha256").update("Help & answers Reset your password.").digest("hex")
    );
    expect(JSON.stringify(manifest)).not.toContain("Private navigation");
    expect(JSON.stringify(manifest)).not.toContain("untrusted()");
    expect((await combineSupportDocumentationParts(root)).version).toBe(manifest.version);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
