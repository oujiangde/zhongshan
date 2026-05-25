import { useState } from 'react';
import { View, Text, Pressable, Switch, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';

const APP_VERSION = '1.0.0';

type SettingItem = {
  key: string;
  label: string;
  icon: string;
  type: 'toggle' | 'navigate' | 'action';
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
};

export default function SettingsScreen() {
  const router = useRouter();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const settings: SettingItem[] = [
    {
      key: 'sound',
      label: '游戏音效',
      icon: '🔊',
      type: 'toggle',
      value: soundEnabled,
      onToggle: (v) => setSoundEnabled(v),
    },
    {
      key: 'music',
      label: '背景音乐',
      icon: '🎵',
      type: 'toggle',
      value: musicEnabled,
      onToggle: (v) => setMusicEnabled(v),
    },
    {
      key: 'vibration',
      label: '震动反馈',
      icon: '📳',
      type: 'toggle',
      value: vibrationEnabled,
      onToggle: (v) => setVibrationEnabled(v),
    },
  ];

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#0a1a12' }}>
      <StatusBar style="light" />
      <View className="justify-start pt-4 px-2" style={{ width: 56, backgroundColor: '#0d1f17' }}>
        <Pressable onPress={() => router.back()} className="items-center py-2">
          <Text style={{ color: '#6b9a7c', fontSize: 20 }}>←</Text>
          <Text style={{ color: '#6b9a7c', fontSize: 10 }}>返回</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>⚙️ 设置</Text>

        {/* 音效设置 */}
        <View className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
          {settings.map((item, idx) => (
            <View key={item.key}>
              <View className="flex-row items-center px-5 py-4">
                <Text style={{ fontSize: 22, marginRight: 12 }}>{item.icon}</Text>
                <Text className="flex-1" style={{ color: '#fff', fontSize: 15 }}>{item.label}</Text>
                <Switch
                  value={item.value}
                  onValueChange={item.onToggle}
                  trackColor={{ false: '#1a3020', true: '#C9372C' }}
                  thumbColor={item.value ? '#fff' : '#3a5540'}
                />
              </View>
              {idx < settings.length - 1 && (
                <View style={{ height: 1, backgroundColor: '#1a3020', marginHorizontal: 20 }} />
              )}
            </View>
          ))}
        </View>

        {/* 其他 */}
        <View className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
          <Pressable onPress={() => setShowAbout(true)} className="flex-row items-center px-5 py-4">
            <Text style={{ fontSize: 22, marginRight: 12 }}>ℹ️</Text>
            <Text className="flex-1" style={{ color: '#fff', fontSize: 15 }}>关于跑得快</Text>
            <Text style={{ color: '#3a5540', fontSize: 18 }}>›</Text>
          </Pressable>
          <View style={{ height: 1, backgroundColor: '#1a3020', marginHorizontal: 20 }} />
          <Pressable onPress={() => { /* 用户协议 */ }} className="flex-row items-center px-5 py-4">
            <Text style={{ fontSize: 22, marginRight: 12 }}>📜</Text>
            <Text className="flex-1" style={{ color: '#fff', fontSize: 15 }}>用户协议</Text>
            <Text style={{ color: '#3a5540', fontSize: 18 }}>›</Text>
          </Pressable>
          <View style={{ height: 1, backgroundColor: '#1a3020', marginHorizontal: 20 }} />
          <Pressable onPress={() => { /* 隐私政策 */ }} className="flex-row items-center px-5 py-4">
            <Text style={{ fontSize: 22, marginRight: 12 }}>🔒</Text>
            <Text className="flex-1" style={{ color: '#fff', fontSize: 15 }}>隐私政策</Text>
            <Text style={{ color: '#3a5540', fontSize: 18 }}>›</Text>
          </Pressable>
        </View>

        {/* 退出登录 */}
        <Pressable onPress={() => setShowLogoutConfirm(true)}
          className="rounded-2xl items-center py-4"
          style={{ borderWidth: 1, borderColor: '#C9372C' }}>
          <Text style={{ color: '#C9372C', fontSize: 16, fontWeight: 'bold' }}>退出登录</Text>
        </Pressable>
      </ScrollView>

      {/* 退出确认 */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="rounded-2xl p-6" style={{ width: 280, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030' }}>
            <Text className="font-bold text-center mb-2" style={{ color: '#fff', fontSize: 16 }}>退出登录</Text>
            <Text className="text-center mb-6" style={{ color: '#6b9a7c', fontSize: 14 }}>确认要退出当前账号吗？</Text>
            <Pressable onPress={handleLogout} disabled={loggingOut}
              className="rounded-lg items-center py-3 mb-2" style={{ backgroundColor: '#C9372C' }}>
              {loggingOut ? <ActivityIndicator color="#fff" /> : (
                <Text className="font-bold" style={{ color: '#fff', fontSize: 15 }}>确认退出</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setShowLogoutConfirm(false)} className="items-center py-2">
              <Text style={{ color: '#6b9a7c' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 关于 */}
      <Modal visible={showAbout} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="rounded-2xl p-6 items-center"
            style={{ width: 300, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030', gap: 10 }}>
            <Text style={{ fontSize: 56 }}>🃏</Text>
            <Text className="font-bold" style={{ color: '#D4AF37', fontSize: 22 }}>跑得快</Text>
            <Text style={{ color: '#6b9a7c', fontSize: 14 }}>版本 v{APP_VERSION}</Text>
            <Text style={{ color: '#3a5540', fontSize: 13, textAlign: 'center' }}>
              经典4人扑克牌对战游戏{'\n'}支持好友对战与AI挑战
            </Text>
            <Pressable onPress={() => setShowAbout(false)}
              className="rounded-lg px-8 py-2.5 mt-2" style={{ borderWidth: 1, borderColor: '#2a4030' }}>
              <Text style={{ color: '#6b9a7c' }}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
