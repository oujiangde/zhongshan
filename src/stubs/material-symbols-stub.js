// Stub：替代 @expo-google-fonts/material-symbols 字体包
// 原因：expo-symbols（expo-router 依赖）会静态 import 这 7 个 ~985KB 的 TTF 字体
// 本项目不使用 NativeTabs / expo-symbols 图标，无需这些字体
// 用此 stub 可将 OTA 包体积减少约 6.8MB

/* eslint-disable */
/* global module */

const stub = {};

module.exports = stub;
module.exports.default = stub;
module.exports.useFonts = function () { return [true, null]; };
module.exports.MaterialSymbols_100Thin = undefined;
module.exports.MaterialSymbols_200ExtraLight = undefined;
module.exports.MaterialSymbols_300Light = undefined;
module.exports.MaterialSymbols_400Regular = undefined;
module.exports.MaterialSymbols_500Medium = undefined;
module.exports.MaterialSymbols_600SemiBold = undefined;
module.exports.MaterialSymbols_700Bold = undefined;
