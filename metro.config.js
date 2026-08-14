// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude the problematic @napi-rs directory from Metro's file watcher/resolver on Windows
const customBlockList = [
  /[/\\]node_modules[/\\]@napi-rs[/\\]/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList = config.resolver.blockList.concat(customBlockList);
} else if (config.resolver.blockList) {
  config.resolver.blockList = [config.resolver.blockList].concat(customBlockList);
} else {
  config.resolver.blockList = customBlockList;
}

module.exports = config;
