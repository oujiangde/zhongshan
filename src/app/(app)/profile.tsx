import { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/client/supabase';
import { getProfile, updateProfile, getUserAchievements, getAchievementDefs } from '@/db/api';
import type { Profile } from '@/types/db';

const LEVEL_TITLES = [
  { min: 1, max: 4, title: '新手牌友', color: '#888' },
  { min: 5, max: 14, title: '入门选手', color: '#4CAF50' },
  { min: 15, max: 29, title: '进阶玩家', color: '#2196F3' },
  { min: 30, max: 49, title: '高手达人', color: '#9C27B0' },
  { min: 50, max: 100, title: '传奇大师', color: '#D4AF37' },
];

function getLevelTitle(lv: number) {
  return LEVEL_TITLES.find(t => lv >= t.min && lv <= t.max) ?? LEVEL_TITLES[0];
}

const EXP_PER_LEVEL = 200;

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unlockedCount, setUnlockedCount] = useState(0);
  const [totalAchievements, setTotalAchievements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [p, userAch, defs] = await Promise.all([
      getProfile(user.id),
      getUserAchievements(user.id),
      getAchievementDefs(),
    ]);
    setProfile(p);
    setUnlockedCount(userAch.filter(a => a.unlocked).length);
    setTotalAchievements(defs.length);
    setLoading(false);
  };

  const handleAvatarPick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 上传到 Supabase Storage
    try {
      const { fetch } = await import('expo/fetch');
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const filePath = `avatars/${user.id}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        await updateProfile(user.id, { avatar_url: urlData.publicUrl });
        setProfile(prev => prev ? { ...prev, avatar_url: urlData.publicUrl } : prev);
      }
    } catch {
      setErrorMsg('头像上传失败，请重试');
    }
  };

  const handleSaveNickname = async () => {
    if (!newNickname.trim()) { setErrorMsg('昵称不能为空'); return; }
    if (newNickname.trim().length > 10) { setErrorMsg('昵称不能超过10个字'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await updateProfile(user.id, { nickname: newNickname.trim() });
    setProfile(prev => prev ? { ...prev, nickname: newNickname.trim() } : prev);
    setEditingNickname(false);
    setSaving(false);
    setErrorMsg('');
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#0a1a12' }}>
        <ActivityIndicator size="large" color="#C9372C" />
      </View>
    );
  }

  const expProgress = ((profile?.exp ?? 0) % EXP_PER_LEVEL) / EXP_PER_LEVEL;
  const levelInfo = getLevelTitle(profile?.level ?? 1);
  const winRate = (profile?.total_games ?? 0) > 0
    ? Math.round(((profile?.wins ?? 0) / profile!.total_games) * 100)
    : 0;

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#0a1a12' }}>
      <StatusBar style="light" />
      {/* 左侧导航 */}
      <View className="justify-start pt-4 px-2" style={{ width: 56, backgroundColor: '#0d1f17' }}>
        <Pressable onPress={() => router.back()} className="items-center py-2">
          <Text style={{ color: '#6b9a7c', fontSize: 20 }}>←</Text>
          <Text style={{ color: '#6b9a7c', fontSize: 10 }}>返回</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
        <View className="flex-row" style={{ gap: 20 }}>
          {/* 左列：头像+基本信息 */}
          <View style={{ width: 220, gap: 16 }}>
            {/* 头像卡片 */}
            <View className="rounded-2xl p-5 items-center"
              style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020', gap: 12 }}>
              <Pressable onPress={handleAvatarPick} className="items-center">
                <View className="rounded-full overflow-hidden"
                  style={{ width: 80, height: 80, borderWidth: 3, borderColor: '#D4AF37', position: 'relative' }}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={{ width: 80, height: 80 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3020' }}>
                      <Text style={{ fontSize: 36 }}>👤</Text>
                    </View>
                  )}
                </View>
                <View className="absolute bottom-0 right-0 rounded-full items-center justify-center"
                  style={{ width: 24, height: 24, backgroundColor: '#D4AF37', bottom: 0, right: 100 }}>
                  <Text style={{ fontSize: 14 }}>✏️</Text>
                </View>
              </Pressable>

              {/* 昵称 */}
              <Pressable onPress={() => { setEditingNickname(true); setNewNickname(profile?.nickname ?? ''); }}>
                <Text className="font-bold text-center" style={{ color: '#fff', fontSize: 18 }}>{profile?.nickname ?? '玩家'}</Text>
                <Text style={{ color: '#3a5540', fontSize: 11, textAlign: 'center' }}>点击修改昵称</Text>
              </Pressable>

              {/* 等级徽章 */}
              <View className="rounded-full px-4 py-1 items-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: levelInfo.color }}>
                <Text style={{ color: levelInfo.color, fontSize: 12, fontWeight: 'bold' }}>
                  {levelInfo.title} · Lv.{profile?.level ?? 1}
                </Text>
              </View>

              {/* 经验条 */}
              <View style={{ width: '100%', gap: 4 }}>
                <View className="flex-row justify-between">
                  <Text style={{ color: '#6b9a7c', fontSize: 11 }}>经验值</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 11 }}>
                    {(profile?.exp ?? 0) % EXP_PER_LEVEL}/{EXP_PER_LEVEL}
                  </Text>
                </View>
                <View className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: '#1a3020', width: '100%' }}>
                  <View className="rounded-full" style={{ width: `${Math.round(expProgress * 100)}%`, height: 6, backgroundColor: '#D4AF37' }} />
                </View>
              </View>
            </View>

            {/* 豆子&钻石 */}
            <View className="rounded-2xl p-4 flex-row justify-around"
              style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
              <View className="items-center">
                <Text style={{ fontSize: 22 }}>🫘</Text>
                <Text className="font-bold" style={{ color: '#D4AF37', fontSize: 16 }}>{(profile?.beans ?? 0).toLocaleString()}</Text>
                <Text style={{ color: '#6b9a7c', fontSize: 11 }}>豆子</Text>
              </View>
              <View style={{ width: 1, backgroundColor: '#1a3020' }} />
              <View className="items-center">
                <Text style={{ fontSize: 22 }}>💎</Text>
                <Text className="font-bold" style={{ color: '#88ccff', fontSize: 16 }}>{(profile?.diamonds ?? 0).toLocaleString()}</Text>
                <Text style={{ color: '#6b9a7c', fontSize: 11 }}>钻石</Text>
              </View>
            </View>
          </View>

          {/* 右列：战绩统计 */}
          <View className="flex-1" style={{ gap: 16 }}>
            {/* 战绩卡片 */}
            <View className="rounded-2xl p-5" style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
              <Text className="font-bold mb-4" style={{ color: '#fff', fontSize: 15 }}>战绩统计</Text>
              <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                {[
                  { label: '总场次', value: profile?.total_games ?? 0, color: '#fff' },
                  { label: '胜利', value: profile?.wins ?? 0, color: '#4CAF50' },
                  { label: '大赢', value: profile?.big_wins ?? 0, color: '#D4AF37' },
                  { label: '胜率', value: `${winRate}%`, color: '#2196F3' },
                ].map(stat => (
                  <View key={stat.label} className="flex-1 items-center rounded-xl py-3"
                    style={{ backgroundColor: '#0f1e14', minWidth: 80, gap: 4 }}>
                    <Text className="font-bold" style={{ color: stat.color, fontSize: 22 }}>{stat.value}</Text>
                    <Text style={{ color: '#6b9a7c', fontSize: 12 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 成就入口 */}
            <Pressable onPress={() => router.push('/(app)/achievements')}
              className="rounded-2xl p-5 flex-row items-center justify-between"
              style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                <Text style={{ fontSize: 28 }}>🎖</Text>
                <View>
                  <Text className="font-bold" style={{ color: '#fff', fontSize: 14 }}>成就系统</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 12 }}>
                    已解锁 {unlockedCount}/{totalAchievements} 个成就
                  </Text>
                </View>
              </View>
              <Text style={{ color: '#6b9a7c', fontSize: 20 }}>›</Text>
            </Pressable>

            {/* 历史对局入口 */}
            <Pressable onPress={() => router.push('/(app)/history')}
              className="rounded-2xl p-5 flex-row items-center justify-between"
              style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                <Text style={{ fontSize: 28 }}>📋</Text>
                <View>
                  <Text className="font-bold" style={{ color: '#fff', fontSize: 14 }}>历史对局</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 12 }}>查看我的对局记录</Text>
                </View>
              </View>
              <Text style={{ color: '#6b9a7c', fontSize: 20 }}>›</Text>
            </Pressable>

            {errorMsg ? <Text style={{ color: '#C9372C', fontSize: 13 }}>{errorMsg}</Text> : null}
          </View>
        </View>
      </ScrollView>

      {/* 修改昵称Modal */}
      <Modal visible={editingNickname} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="rounded-2xl p-6" style={{ width: 300, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030' }}>
            <Text className="font-bold mb-4 text-center" style={{ color: '#fff', fontSize: 16 }}>修改昵称</Text>
            <TextInput
              className="rounded-lg px-4 mb-3"
              style={{ height: 46, backgroundColor: '#1a3020', color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#2a4030' }}
              value={newNickname}
              onChangeText={setNewNickname}
              maxLength={10}
              placeholder="请输入新昵称"
              placeholderTextColor="#3a5540"
            />
            {errorMsg ? <Text style={{ color: '#C9372C', fontSize: 12, marginBottom: 8 }}>{errorMsg}</Text> : null}
            <Pressable onPress={handleSaveNickname} disabled={saving}
              className="rounded-lg items-center py-3 mb-2" style={{ backgroundColor: '#C9372C' }}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text className="font-bold" style={{ color: '#fff', fontSize: 15 }}>保存</Text>
              )}
            </Pressable>
            <Pressable onPress={() => { setEditingNickname(false); setErrorMsg(''); }}
              className="items-center py-2">
              <Text style={{ color: '#6b9a7c' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
