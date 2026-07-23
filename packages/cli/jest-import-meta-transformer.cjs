/**
 * ts-jest emits CommonJS and leaves `import.meta.url` intact, which Node rejects
 * outside ESM. Rewrite it the same way tsdown does for the published CJS build.
 */
const { createTransformer } = require("ts-jest").default;

const tsJest = createTransformer({
  tsconfig: "tsconfig.json",
  diagnostics: { ignoreCodes: [1343] },
});

module.exports = {
  process(sourceText, sourcePath, options) {
    const rewritten = sourceText.replaceAll(
      "import.meta.url",
      'require("node:url").pathToFileURL(__filename).href'
    );
    return tsJest.process(rewritten, sourcePath, options);
  },
};
