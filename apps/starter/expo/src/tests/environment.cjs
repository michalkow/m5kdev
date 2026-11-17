const { TestEnvironment } = require("jest-environment-jsdom");
module.exports = class extends TestEnvironment {
  async setup() {
    await super.setup();
    for (const key of ["fetch", "Request", "Response", "Headers", "TextEncoder", "TextDecoder"])
      this.global[key] = globalThis[key];
  }
};
