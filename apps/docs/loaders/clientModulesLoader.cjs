const { existsSync } = require("node:fs");
const { extname } = require("node:path");

const requireCallPattern = /require\((["'])(.*?)\1\)/g;

function normalizeEsmRequest(request) {
  if (extname(request) !== "" || !existsSync(`${request}.js`)) {
    return request;
  }

  return `${request}.js`;
}

module.exports = function clientModulesLoader(source) {
  const imports = [];
  const values = [];
  let moduleIndex = 0;

  for (const match of source.matchAll(requireCallPattern)) {
    const request = normalizeEsmRequest(match[2]);

    if (request.endsWith(".css")) {
      imports.push(`import ${JSON.stringify(request)};`);
      values.push("{}");
      continue;
    }

    const name = `clientModule${moduleIndex}`;
    moduleIndex += 1;
    imports.push(`import * as ${name} from ${JSON.stringify(request)};`);
    values.push(name);
  }

  return `${imports.join("\n")}\n\nexport default [\n  ${values.join(",\n  ")},\n];\n`;
};
