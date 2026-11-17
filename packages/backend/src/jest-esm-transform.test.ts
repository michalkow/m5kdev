import { createRequire } from "node:module";

const transform = createRequire(__filename)("../jest-esm-transform.cjs");
describe("Dependency ESM to Jest CommonJS boundary", () => {
  it.each([
    "const value=7;export{value};",
    'export*from"dependency";',
    'import{value}from"dependency";export{value};',
    'export {value} from "dependency";',
  ])("loads valid compact and multiline ESM: %s", (source) => {
    const module = { exports: {} };
    const transformed = transform.process(source, "dependency.mjs");
    new Function("require", "module", "exports", transformed.code)(
      () => ({ value: 7 }),
      module,
      module.exports
    );
    expect(module.exports).toEqual({ value: 7 });
  });
  it("keeps ordinary CommonJS loadable", () => {
    const source = "module.exports = { value: 7 };";
    expect(transform.process(source, "dependency.js").code).toBe(source);
  });
});
