import { Stack } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, View, Text } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';

import { SessionProvider } from '@/ctx';
import "../global.css";

// ─── 横屏永久锁定 ────────────────────────────────────────────
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
  // OTA 更新状态：'idle' | 'checking' | 'downloading' | 'done'
  const [otaStatus, setOtaStatus] = useState<'idle' | 'checking' | 'downloading' | 'done'>('idle');

  useEffect(() => {
    // 锁横屏
    lockLandscape();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') lockLandscape();
    });

    // OTA 静默热更新
    checkOTA();

    return () => { sub.remove(); };
  }, []);

  const checkOTA = async () => {
    // 开发模式下跳过（expo-updates 在开发模式不可用）
    if (__DEV__) return;
    try {
      setOtaStatus('checking');
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setOtaStatus('downloading');
        await Updates.fetchUpdateAsync();
        setOtaStatus('done');
        // 下载完成后立即重载，用户几乎无感知
        await Updates.reloadAsync();
      } else {
        setOtaStatus('idle');
      }
    } catch {
      // 网络异常静默忽略，不影响正常使用
      setOtaStatus('idle');
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <RootLayoutNav />
        <PortalHost />
        {/* OTA 下载进度提示（仅下载时显示，极短暂） */}
        {otaStatus === 'downloading' && (
          <View style={{
            position: 'absolute', bottom: 20, alignSelf: 'center',
            backgroundColor: 'rgba(10,22,60,0.92)',
            borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8,
            borderWidth: 1, borderColor: 'rgba(212,175,55,0.4)',
            flexDirection: 'row', alignItems: 'center', gap: 8,
          }}>
            <Text style={{ fontSize: 14 }}>⬇️</Text>
            <Text style={{ color: '#D4AF37', fontSize: 13, fontWeight: '600' }}>
              正在更新游戏数据…
            </Text>
          </View>
        )}
      </SessionProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
