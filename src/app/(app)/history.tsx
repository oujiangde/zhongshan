import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { getMyGameHistory } from '@/db/api';
import type { GameHistoryRow } from '@/types/db';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  big_winner: { label: '大赢家', color: '#D4AF37' },
  small_winner: { label: '小赢家', color: '#4CAF50' },
  sole_winner: { label: '独赢', color: '#D4AF37' },
  loser: { label: '输家', color: '#C9372C' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}分${sec}秒`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setPage(0);
      loadHistory(0);
    }, [])
  );

  const loadHistory = async (p: number) => {
    if (p === 0) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyUserId(user.id);
    const data = await getMyGameHistory(user.id, p);
    if (p === 0) {
      setHistory(data);
    } else {
      setHistory(prev => [...prev, ...data]);
    }
    setHasMore(data.length === 20);
    setLoading(false);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadHistory(nextPage);
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
        <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>📋 历史对局</Text>

        {loading && page === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={item => item.id}
            contentInsetAdjustmentBehavior="automatic"
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item }) => {
              const players = (item.players ?? []) as Array<{
                user_id: string; nickname: string; seat: number;
                role: string; bean_change: number; remaining_cards: number;
              }>;
              const myRecord = players.find(p => p.user_id === myUserId);
              const roleInfo = myRecord ? (ROLE_LABELS[myRecord.role] ?? ROLE_LABELS.loser) : ROLE_LABELS.loser;
              const beanChange = myRecord?.bean_change ?? 0;
              const opponents = players.filter(p => p.user_id !== myUserId).slice(0, 3);

              return (
                <View className="rounded-xl px-4 py-3 mb-2"
                  style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text style={{ color: '#6b9a7c', fontSize: 12 }}>{formatTime(item.created_at ?? '')}</Text>
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Text style={{ color: '#3a5540', fontSize: 11 }}>
                        {formatDuration(item.duration_seconds ?? 0)}
                      </Text>
                      <View className="rounded-full px-3 py-0.5"
                        style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: roleInfo.color }}>
                        <Text style={{ color: roleInfo.color, fontSize: 12, fontWeight: 'bold' }}>{roleInfo.label}</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-row items-center justify-between">
                    {/* 对手列表 */}
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      {opponents.map((p, i) => (
                        <Text key={i} style={{ color: '#6b9a7c', fontSize: 12 }}>{p.nickname}</Text>
                      ))}
                    </View>
                    {/* 豆子变化 */}
                    <Text style={{
                      color: beanChange >= 0 ? '#4CAF50' : '#C9372C',
                      fontSize: 18, fontWeight: 'bold',
                    }}>
                      {beanChange >= 0 ? `+${beanChange}` : `${beanChange}`} 🫘
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text style={{ fontSize: 40 }}>📋</Text>
                <Text style={{ color: '#6b9a7c', marginTop: 8, fontSize: 14 }}>还没有对局记录</Text>
                <Text style={{ color: '#3a5540', marginTop: 4, fontSize: 12 }}>快去游戏大厅开始对局吧！</Text>
              </View>
            }
            ListFooterComponent={!hasMore && history.length > 0 ? (
              <Text style={{ color: '#3a5540', fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>没有更多记录了</Text>
            ) : null}
          />
        )}
      </View>
    </View>
  );
}
