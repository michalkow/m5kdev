const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../../..");

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
});
