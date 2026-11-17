import assert from "node:assert/strict";
import { createRequire } from "node:module";

const esm = await import("@m5kdev/frontend/modules/app/experience");
const cjs = createRequire(import.meta.url)("@m5kdev/frontend/modules/app/experience");
assert.equal(typeof esm.loadExperience, "function");
assert.equal(typeof cjs.loadExperience, "function");
console.log("Experience bootstrap ESM and CommonJS consumer exports load");
