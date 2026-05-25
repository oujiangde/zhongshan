import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import { getFriends, sendFriendRequest, getPendingFriendRequests, respondFriendRequest, searchUsers } from '@/db/api';
import type { Profile, Friendship } from '@/types/db';

type TabType = 'friends' | 'pending' | 'search';

export default function FriendsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('friends');
  const [friends, setFriends] = useState<Profile[]>([]);
  const [pendingReqs, setPendingReqs] = useState<Friendship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [tab])
  );

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyUserId(user.id);

    if (tab === 'friends') {
      const data = await getFriends(user.id);
      setFriends(data);
    } else if (tab === 'pending') {
      const data = await getPendingFriendRequests(user.id);
      setPendingReqs(data);
    }
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const results = await searchUsers(searchQuery.trim());
    setSearchResults(results.filter(r => r.id !== myUserId));
    setLoading(false);
  };

  const handleAddFriend = async (userId: string) => {
    if (!myUserId) return;
    await sendFriendRequest(myUserId, userId);
    setFeedback('好友申请已发送！');
    setTimeout(() => setFeedback(''), 2000);
  };

  const handleRespond = async (friendshipId: string, accept: boolean) => {
    await respondFriendRequest(friendshipId, accept);
    setPendingReqs(prev => prev.filter(f => f.id !== friendshipId));
    setFeedback(accept ? '已接受好友申请' : '已拒绝');
    setTimeout(() => setFeedback(''), 2000);
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: 'friends', label: '好友列表' },
    { key: 'pending', label: '申请' },
    { key: 'search', label: '搜索' },
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

      <View className="flex-1 p-5" style={{ gap: 12 }}>
        <View className="flex-row items-center justify-between">
          <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>👥 好友系统</Text>
        </View>

        {/* Tab */}
        <View className="flex-row rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: '#2a4030' }}>
          {TABS.map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)}
              className="flex-1 py-2 items-center"
              style={{ backgroundColor: tab === t.key ? '#C9372C' : 'transparent' }}>
              <Text style={{ color: tab === t.key ? '#fff' : '#6b9a7c', fontWeight: tab === t.key ? 'bold' : 'normal', fontSize: 13 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {feedback ? <Text style={{ color: '#4CAF50', fontSize: 13 }}>{feedback}</Text> : null}

        {/* 搜索Tab */}
        {tab === 'search' && (
          <View className="flex-row items-center rounded-xl overflow-hidden"
            style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030' }}>
            <TextInput
              className="flex-1 px-4 py-3"
              style={{ color: '#fff', fontSize: 14 }}
              placeholder="搜索玩家昵称..."
              placeholderTextColor="#3a5540"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <Pressable onPress={handleSearch} className="px-4 py-3">
              <Text style={{ color: '#D4AF37', fontSize: 14 }}>搜索</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={tab === 'search' ? searchResults : tab === 'friends' ? friends : []}
            keyExtractor={item => item.id}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }) => (
              <View className="flex-row items-center rounded-xl px-4 py-3 mb-2"
                style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
                <View className="rounded-full overflow-hidden mr-3"
                  style={{ width: 44, height: 44, borderWidth: 2, borderColor: item.is_online ? '#4CAF50' : '#2a4030' }}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3020' }}>
                      <Text style={{ fontSize: 20 }}>👤</Text>
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{item.nickname ?? '玩家'}</Text>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: item.is_online ? '#4CAF50' : '#3a5540' }} />
                    <Text style={{ color: '#6b9a7c', fontSize: 12 }}>{item.is_online ? '在线' : '离线'}</Text>
                    <Text style={{ color: '#3a5540', fontSize: 12 }}>Lv.{item.level ?? 1}</Text>
                  </View>
                </View>
                {tab === 'friends' && (
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <View className="flex-row items-center">
                      <Text style={{ fontSize: 14 }}>🫘</Text>
                      <Text style={{ color: '#D4AF37', fontSize: 13, marginLeft: 3 }}>{(item.beans ?? 0).toLocaleString()}</Text>
                    </View>
                  </View>
                )}
                {tab === 'search' && (
                  <Pressable onPress={() => handleAddFriend(item.id)}
                    className="rounded-full px-3 py-1" style={{ backgroundColor: '#C9372C' }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>+好友</Text>
                  </Pressable>
                )}
              </View>
            )}
            ListFooterComponent={tab === 'pending' ? (
              <View style={{ gap: 8 }}>
                {pendingReqs.length === 0 ? (
                  <View className="items-center py-16">
                    <Text style={{ fontSize: 32 }}>📨</Text>
                    <Text style={{ color: '#6b9a7c', marginTop: 8 }}>暂无好友申请</Text>
                  </View>
                ) : pendingReqs.map(req => (
                  <View key={req.id} className="flex-row items-center rounded-xl px-4 py-3"
                    style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
                    <View className="rounded-full mr-3 items-center justify-center"
                      style={{ width: 44, height: 44, backgroundColor: '#1a3020' }}>
                      <Text style={{ fontSize: 20 }}>👤</Text>
                    </View>
                    <Text className="flex-1" style={{ color: '#fff' }}>收到好友申请</Text>
                    <View className="flex-row" style={{ gap: 8 }}>
                      <Pressable onPress={() => handleRespond(req.id, true)}
                        className="rounded-full px-3 py-1" style={{ backgroundColor: '#4CAF50' }}>
                        <Text style={{ color: '#fff', fontSize: 12 }}>接受</Text>
                      </Pressable>
                      <Pressable onPress={() => handleRespond(req.id, false)}
                        className="rounded-full px-3 py-1" style={{ borderWidth: 1, borderColor: '#2a4030' }}>
                        <Text style={{ color: '#6b9a7c', fontSize: 12 }}>拒绝</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            ListEmptyComponent={tab !== 'pending' ? (
              <View className="flex-1 items-center justify-center py-20">
                <Text style={{ fontSize: 40 }}>👥</Text>
                <Text style={{ color: '#6b9a7c', marginTop: 8 }}>
                  {tab === 'friends' ? '还没有好友，快去搜索吧！' : '没有搜索结果'}
                </Text>
              </View>
            ) : null}
          />
        )}
      </View>
    </View>
  );
}
