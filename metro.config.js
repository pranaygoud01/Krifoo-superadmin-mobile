// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure audio and media asset extensions are recognized by Metro bundler in preview/production builds
const audioAssetExtensions = ['wav', 'mp3', 'aac', 'm4a', 'ogg'];
audioAssetExtensions.forEach((ext) => {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
});

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
