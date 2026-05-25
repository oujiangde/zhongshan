import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Modal, TextInput, Switch } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import { getAllUsers, updateProfile, banUser, sendSystemMail, getAdminStats } from '@/db/api';
import type { Profile } from '@/types/db';

export default function AdminScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'announce' | 'stats'>('stats');
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalGames: 0, todayGames: 0 });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [rewardBeans, setRewardBeans] = useState('0');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  useFocusEffect(
    useCallback(() => {
      checkAdmin();
    }, [])
  );

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.back(); return; }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') { router.back(); return; }
    setIsAdmin(true);
    loadData();
  };

  const loadData = async () => {
    setLoading(true);
    const [us, st] = await Promise.all([getAllUsers(), getAdminStats()]);
    setUsers(us);
    setStats(st);
    setLoading(false);
  };

  const handleBanUser = async (userId: string, banned: boolean) => {
    await banUser(userId, banned);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: banned } : u));
  };

  const handleSendAnnounce = async () => {
    if (!announceTitle.trim() || !announceContent.trim()) {
      setFeedback('标题和内容不能为空');
      return;
    }
    setSending(true);
    await sendSystemMail(announceTitle, announceContent, parseInt(rewardBeans) || 0);
    setSending(false);
    setFeedback('公告已发送给所有用户！');
    setAnnounceTitle('');
    setAnnounceContent('');
    setRewardBeans('0');
    setTimeout(() => setFeedback(''), 3000);
  };

  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#0a1a12' }}>
        <ActivityIndicator size="large" color="#C9372C" />
      </View>
    );
  }

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#0a1a12' }}>
      <StatusBar style="light" />
      <View className="justify-start pt-4 px-2" style={{ width: 56, backgroundColor: '#0d1f17' }}>
        <Pressable onPress={() => router.back()} className="items-center py-2">
          <Text style={{ color: '#6b9a7c', fontSize: 20 }}>←</Text>
          <Text style={{ color: '#6b9a7c', fontSize: 10 }}>返回</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-5" style={{ gap: 12 }}>
        <Text className="font-bold" style={{ color: '#D4AF37', fontSize: 20 }}>🛡 管理后台</Text>

        {/* Tabs */}
        <View className="flex-row rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: '#2a4030' }}>
          {(['stats', 'users', 'announce'] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)}
              className="flex-1 py-2 items-center"
              style={{ backgroundColor: tab === t ? '#C9372C' : 'transparent' }}>
              <Text style={{ color: tab === t ? '#fff' : '#6b9a7c', fontSize: 13 }}>
                {t === 'stats' ? '数据概览' : t === 'users' ? '用户管理' : '公告'}
              </Text>
            </Pressable>
          ))}
        </View>

        {feedback ? <Text style={{ color: '#4CAF50', fontSize: 13 }}>{feedback}</Text> : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : tab === 'stats' ? (
          <View style={{ gap: 12 }}>
            {[
              { label: '总用户数', value: stats.totalUsers, icon: '👥' },
              { label: '累计对局', value: stats.totalGames, icon: '🎮' },
              { label: '今日对局', value: stats.todayGames, icon: '📅' },
            ].map(s => (
              <View key={s.label} className="flex-row items-center rounded-2xl px-5 py-4"
                style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>{s.icon}</Text>
                <View>
                  <Text className="font-bold" style={{ color: '#fff', fontSize: 24 }}>{s.value}</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 13 }}>{s.label}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : tab === 'users' ? (
          <FlatList
            data={users}
            keyExtractor={item => item.id}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }) => (
              <View className="flex-row items-center rounded-xl px-4 py-3 mb-2"
                style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
                <View className="rounded-full overflow-hidden mr-3"
                  style={{ width: 38, height: 38, backgroundColor: '#1a3020' }}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 38, height: 38 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18 }}>👤</Text>
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text style={{ color: '#fff', fontSize: 13 }}>{item.nickname ?? '玩家'}</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 11 }}>Lv.{item.level} · 🫘{(item.beans ?? 0).toLocaleString()}</Text>
                </View>
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Text style={{ color: item.is_banned ? '#C9372C' : '#4CAF50', fontSize: 12 }}>
                    {item.is_banned ? '已封禁' : '正常'}
                  </Text>
                  <Switch
                    value={!item.is_banned}
                    onValueChange={(v) => handleBanUser(item.id, !v)}
                    trackColor={{ false: '#C9372C', true: '#1a3020' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}
          />
        ) : (
          <View style={{ gap: 12 }}>
            <TextInput
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: '#0d1f17', color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2a4030' }}
              placeholder="公告标题"
              placeholderTextColor="#3a5540"
              value={announceTitle}
              onChangeText={setAnnounceTitle}
            />
            <TextInput
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: '#0d1f17', color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2a4030', minHeight: 100 }}
              placeholder="公告内容"
              placeholderTextColor="#3a5540"
              value={announceContent}
              onChangeText={setAnnounceContent}
              multiline
              textAlignVertical="top"
            />
            <View className="flex-row items-center rounded-xl px-4 py-3"
              style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030', gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 14 }}>附带豆子奖励</Text>
              <Text style={{ fontSize: 16 }}>🫘</Text>
              <TextInput
                style={{ flex: 1, color: '#D4AF37', fontSize: 16, fontWeight: 'bold' }}
                value={rewardBeans}
                onChangeText={setRewardBeans}
                keyboardType="number-pad"
              />
            </View>
            <Pressable onPress={handleSendAnnounce} disabled={sending}
              className="rounded-xl items-center py-3" style={{ backgroundColor: '#C9372C' }}>
              {sending ? <ActivityIndicator color="#fff" /> : (
                <Text className="font-bold" style={{ color: '#fff', fontSize: 15 }}>发送给所有用户</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
