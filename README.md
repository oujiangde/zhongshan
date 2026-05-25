# 跑得快扑克游戏 🃏

四人实时跑得快对战，多样玩法与成就系统，尽享传统扑克乐趣。

## 技术栈

- **框架**：React Native + Expo SDK 55
- **路由**：Expo Router
- **样式**：NativeWind v4 + Tailwind CSS
- **后端**：Supabase（数据库 + 实时订阅 + 认证）
- **语言**：TypeScript

## 项目结构

```
src/
├── app/
│   ├── (app)/          # 主要页面（大厅、游戏、结算等）
│   ├── (auth)/         # 登录/注册页面
│   └── _layout.tsx     # 根布局（横屏锁定 + 版本更新检查）
├── components/         # 公共组件（UpdateModal 等）
├── db/                 # Supabase 数据访问层
├── utils/              # 工具函数（游戏逻辑、版本检查等）
├── types/              # TypeScript 类型定义
└── client/             # Supabase 客户端初始化
```

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm start

# Android
pnpm android

# iOS
pnpm ios
```

## OTA 热更新（EAS Update）

> 需要先登录 Expo 账号并配置 EAS 项目

```bash
# 登录 Expo
eas login

# 配置项目（首次）
eas init

# 推送 OTA 更新（用户无需重装 App）
eas update --channel production --message "更新说明"
```

## 版本更新提示（备用方案）

不使用 EAS 时，可通过 Supabase `app_versions` 表管理版本：

1. 在 Supabase 控制台 → `app_versions` 表新增一行
2. 填写 `version`、`version_code`（递增）、`download_url`、`changelog`
3. 用户下次打开 App 自动弹出更新提示

## 环境变量

```env
EXPO_PUBLIC_SUPABASE_URL=你的Supabase项目URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的Supabase匿名密钥
EXPO_PUBLIC_APP_ID=app-bv4j4s8noge9
```

## 构建 APK

```bash
# 使用 EAS 构建
eas build --platform android --profile production

# 本地构建（需要 Android SDK）
pnpm run build:android
```
