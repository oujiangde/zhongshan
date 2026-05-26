const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withDevkit } = require('miaoda-expo-devkit/metro');

const config = getDefaultConfig(__dirname);

/**
 * 用空 stub 替换 @expo-google-fonts/material-symbols 字体包。
 * 原因：expo-symbols（expo-router 间接依赖）会静态 import 7 个 ~985KB 的
 * MaterialSymbols TTF 字体，合计约 6.8MB 被强制打包进 bundle。
 * 本项目不使用 NativeTabs / expo-symbols 图标，stub 替换后可将 OTA 包体积从
 * 16MB 降低到约 9MB，避免秒哒平台打包超时导致"编译产出为空"。
 */
const MATERIAL_SYMBOLS_STUB = path.resolve(__dirname, 'src/stubs/material-symbols-stub.js');

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@expo-google-fonts/material-symbols')) {
    return { filePath: MATERIAL_SYMBOLS_STUB, type: 'sourceFile' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

const finalConfig = withDevkit(config);

/**
 * 移除 esbuild minifier（版本 0.12.29 与 Node 24 不兼容）。
 * withDevkit 内部的 withEsbuildMinify 会把 Metro 压缩器替换为 esbuild@0.12.29，
 * 在 Node 24 环境下 esbuild 会崩溃并报 "The service was stopped"，
 * 导致 bundling 失败，秒哒平台收到空产出。
 * 回退到 Metro 内置压缩器（hermes/terser）可确保跨 Node 版本兼容。
 */
if (finalConfig.transformer) {
  delete finalConfig.transformer.minifierPath;
  delete finalConfig.transformer.minifierConfig;
}

module.exports = finalConfig;
