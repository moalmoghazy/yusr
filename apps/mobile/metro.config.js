// Metro in a pnpm monorepo: watch the whole workspace, resolve packages from the app first and
// then the root, and read the shared packages straight from their TypeScript sources
// (the "@yusr/source" export condition) — no build step between editing a package and the app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['@yusr/source', ...(config.resolver.unstable_conditionNames ?? ['require', 'import', 'react-native'])];

module.exports = config;
