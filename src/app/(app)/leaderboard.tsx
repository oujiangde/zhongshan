import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import { getLeaderboard, getUserRank, getFriends } from '@/db/api';
import type { Profile } from '@/types/db';

type TabType = 'global' | 'friends';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={{ fontSize: 22 }}>🥇</Text>;
  if (rank === 2) return <Text style={{ fontSize: 22 }}>🥈</Text>;
  if (rank === 3) return <Text style={{ fontSize: 22 }}>🥉</Text>;
  return (
    <View className="items-center justify-center" style={{ width: 32, height: 32 }}>
      <Text style={{ color: '#6b9a7c', fontSize: 14, fontWeight: 'bold' }}>{rank}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('global');
  const [list, setList] = useState<Profile[]>([]);
  const [myRank, setMyRank] = useState<number>(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

    if (tab === 'global') {
      const [leaders, rank] = await Promise.all([getLeaderboard(50), getUserRank(user.id)]);
      setList(leaders);
      setMyRank(rank);
    } else {
      const friends = await getFriends(user.id);
      const sorted = [...friends].sort((a, b) => (b.beans ?? 0) - (a.beans ?? 0));
      setList(sorted);
    }
    setLoading(false);
  };

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#0a1a12' }}>
      <StatusBar style="light" />
      <View className="justify-start pt-4 px-2" style={{ width: 56, backgroundColor: '#0d1f17' }}>
        <Pressable onPress={() => router.back()} className="items-center py-2">
          <Text style={{ color: '#6b9a7c', fontSize: 20 }}>←</Text>
          <Text style={{ color: '#6b9a7c', fontSize: 10 }}>返回</Text>
        </Pressable>
      </View>

      <View className="flex-1 p-5" style={{ gap: 16 }}>
        {/* 标题+Tab */}
        <View className="flex-row items-center justify-between">
          <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>🏆 排行榜</Text>
          <View className="flex-row rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: '#2a4030' }}>
            {(['global', 'friends'] as TabType[]).map(t => (
              <Pressable key={t} onPress={() => setTab(t)}
                className="px-4 py-2"
                style={{ backgroundColor: tab === t ? '#C9372C' : 'transparent' }}>
                <Text style={{ color: tab === t ? '#fff' : '#6b9a7c', fontWeight: tab === t ? 'bold' : 'normal' }}>
                  {t === 'global' ? '全服排行' : '好友排行'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 我的排名 */}
        {tab === 'global' && myRank > 0 && (
          <View className="flex-row items-center rounded-xl px-4 py-3"
            style={{ backgroundColor: 'rgba(201,55,44,0.15)', borderWidth: 1, borderColor: '#C9372C' }}>
            <Text style={{ color: '#C9372C', fontSize: 13, fontWeight: 'bold' }}>我的排名：第 {myRank} 名</Text>
          </View>
        )}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={item => item.id}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item, index }) => {
              const isMe = item.id === myUserId;
              const rank = index + 1;
              return (
                <View className="flex-row items-center rounded-xl px-4 py-3 mb-2"
                  style={{
                    backgroundColor: isMe ? 'rgba(212,175,55,0.12)' : '#0d1f17',
                    borderWidth: 1,
                    borderColor: isMe ? '#D4AF37' : '#1a3020',
                  }}>
                  <View className="items-center justify-center mr-3" style={{ width: 36 }}>
                    <RankBadge rank={rank} />
                  </View>
                  <View className="rounded-full overflow-hidden mr-3"
                    style={{ width: 40, height: 40, borderWidth: 2, borderColor: rank <= 3 ? '#D4AF37' : '#2a4030' }}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={{ width: 40, height: 40 }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3020' }}>
                        <Text style={{ fontSize: 18 }}>👤</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{item.nickname ?? '玩家'}</Text>
                    <Text style={{ color: '#6b9a7c', fontSize: 12 }}>Lv.{item.level ?? 1}</Text>
                  </View>
                  <View className="items-end">
                    <View className="flex-row items-center">
                      <Text style={{ fontSize: 16 }}>🫘</Text>
                      <Text className="ml-1 font-bold" style={{ color: '#D4AF37', fontSize: 16 }}>
                        {(item.beans ?? 0).toLocaleString()}
                      </Text>
                    </View>
                    {isMe && <Text style={{ color: '#D4AF37', fontSize: 11 }}>▲ 我</Text>}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <Text style={{ fontSize: 32 }}>🏆</Text>
                <Text style={{ color: '#6b9a7c', fontSize: 14, marginTop: 8 }}>暂无数据</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}
