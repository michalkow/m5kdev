const typescript = require("typescript");

module.exports = {
  process(source, filename) {
    if (!/\b(?:import|export)\b/.test(source)) return { code: source };
    return {
      code: typescript.transpileModule(source, {
        fileName: filename.replace(/\.mjs$/, ".js"),
        compilerOptions: {
          module: typescript.ModuleKind.CommonJS,
          target: typescript.ScriptTarget.ES2022,
          allowJs: true,
          esModuleInterop: true,
        },
      }).outputText,
    };
  },
};
