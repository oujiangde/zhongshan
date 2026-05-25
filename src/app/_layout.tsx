import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useState } from 'react';

import { SessionProvider } from '@/ctx';
import { checkForUpdate } from '@/utils/checkUpdate';
import { UpdateModal } from '@/components/UpdateModal';
import type { AppVersionInfo } from '@/utils/checkUpdate';
import "../global.css";

// ─── 横屏永久锁定（所有设备、所有时机）────────────────────
const lockLandscape = () => {
  ScreenOrientation.lockAsync(
    ScreenOrientation.OrientationLock.LANDSCAPE
  ).catch(() => {});
};
lockLandscape();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

const RootLayout: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    // 立即锁横屏
    lockLandscape();

    // 每次 App 从后台回到前台时重新锁（防止系统自动解锁）
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockLandscape();
    });

    // 启动时检查版本更新（延迟 2s，等应用完全加载后再弹窗）
    const timer = setTimeout(async () => {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        setShowUpdate(true);
      }
    }, 2000);

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <RootLayoutNav />
        <PortalHost />
        {/* 版本更新弹窗：全局挂载，优先级最高 */}
        {updateInfo && (
          <UpdateModal
            visible={showUpdate}
            info={updateInfo}
            onDismiss={() => setShowUpdate(false)}
          />
        )}
      </SessionProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
