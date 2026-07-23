import jscodeshift, { type API, type FileInfo, type Options } from "jscodeshift";

export type SourceTransform = (
  file: FileInfo,
  api: API,
  options: Options
) => string | null | undefined;

export function transformTypeScript(
  source: string,
  filePath: string,
  transform: SourceTransform
): string {
  const parser = filePath.endsWith(".tsx") ? "tsx" : "ts";
  const j = jscodeshift.withParser(parser);
  return (
    transform(
      { path: filePath, source },
      { jscodeshift: j, j, stats: () => undefined, report: () => undefined },
      { parser }
    ) ?? source
  );
}

export function renameImportSource(from: string, to: string): SourceTransform {
  return (file, api) => {
    const root = api.jscodeshift(file.source);
    for (const declaration of root
      .find(api.jscodeshift.ImportDeclaration, { source: { value: from } })
      .nodes()) {
      declaration.source.value = to;
    }
    return root.toSource();
  };
}

export function ensureNamedImport(moduleName: string, importedName: string): SourceTransform {
  return (file, api) => {
    const j = api.jscodeshift;
    const root = j(file.source);
    const declarations = root.find(j.ImportDeclaration, { source: { value: moduleName } });
    const existing = declarations.find(j.ImportSpecifier, {
      imported: { type: "Identifier", name: importedName },
    });
    if (existing.size() > 0) return file.source;

    const first = declarations.at(0);
    if (first.size() > 0) {
      const declaration = first.nodes()[0];
      declaration.specifiers ??= [];
      declaration.specifiers.push(j.importSpecifier(j.identifier(importedName)));
    } else {
      root
        .get()
        .node.program.body.unshift(
          j.importDeclaration(
            [j.importSpecifier(j.identifier(importedName))],
            j.literal(moduleName)
          )
        );
    }
    return root.toSource();
  };
}
