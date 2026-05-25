import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';

/**
 * 登录页 —— 不再展示给用户。
 * ctx.tsx 会在无 session 时自动游客登录并触发跳转。
 * 此页面仅作为路由占位，显示极短的加载状态后自动处理。
 */
export default function SignIn() {
  const router = useRouter();

  useEffect(() => {
    // 如果意外进入此页，尝试游客登录后跳回首页
    supabase.auth.signInAnonymously().then(() => {
      router.replace('/');
    });
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0f' }}>
      <StatusBar style="light" hidden />
      <ActivityIndicator size="large" color="#D4AF37" />
    </View>
  );
}
