import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { getAchievementDefs, getUserAchievements, upsertAchievementProgress, updateBeans } from '@/db/api';
import type { AchievementDef, UserAchievement } from '@/types/db';

type AchievementWithProgress = AchievementDef & {
  progress: number;
  unlocked: boolean;
  claimed: boolean;
};

export default function AchievementsScreen() {
  const router = useRouter();
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyUserId(user.id);
    const [defs, userAch] = await Promise.all([
      getAchievementDefs(),
      getUserAchievements(user.id),
    ]);
    const mapped: AchievementWithProgress[] = defs.map(def => {
      const ua: UserAchievement | undefined = userAch.find(a => a.achievement_id === def.id);
      return {
        ...def,
        required_value: def.condition_value,
        progress: ua?.progress ?? 0,
        unlocked: ua?.unlocked ?? false,
        claimed: false, // 简化：全部可领
      };
    });
    setAchievements(mapped);
    setLoading(false);
  };

  const handleClaim = async (ach: AchievementWithProgress) => {
    if (!ach.unlocked || !myUserId) return;
    await updateBeans(myUserId, ach.reward_beans ?? 0);
    // 更新UI
    setAchievements(prev => prev.map(a => a.id === ach.id ? { ...a, claimed: true } : a));
  };

  const progressPct = (ach: AchievementWithProgress) => {
    if (!ach.required_value || ach.required_value === 0) return 0;
    return Math.min(1, ach.progress / ach.required_value);
  };

  const unlockedCount = achievements.filter(a => a.unlocked).length;

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
        <View className="flex-row items-center justify-between">
          <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>🎖 成就系统</Text>
          <Text style={{ color: '#6b9a7c', fontSize: 13 }}>
            {unlockedCount}/{achievements.length} 已解锁
          </Text>
        </View>

        {/* 进度条总览 */}
        <View className="rounded-xl px-5 py-3 flex-row items-center"
          style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020', gap: 12 }}>
          <Text style={{ color: '#D4AF37', fontSize: 28 }}>🏆</Text>
          <View className="flex-1" style={{ gap: 4 }}>
            <View className="flex-row justify-between">
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>总体进度</Text>
              <Text style={{ color: '#D4AF37', fontSize: 13 }}>
                {achievements.length > 0 ? Math.round((unlockedCount / achievements.length) * 100) : 0}%
              </Text>
            </View>
            <View className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: '#1a3020' }}>
              <View className="rounded-full" style={{
                height: 6,
                backgroundColor: '#D4AF37',
                width: achievements.length > 0 ? `${Math.round((unlockedCount / achievements.length) * 100)}%` : '0%',
              }} />
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={achievements}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12 }}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item: ach }) => {
              const pct = progressPct(ach);
              return (
                <View className="flex-1 rounded-2xl p-4"
                  style={{
                    backgroundColor: ach.unlocked ? 'rgba(212,175,55,0.08)' : '#0d1f17',
                    borderWidth: 1,
                    borderColor: ach.unlocked ? '#D4AF37' : '#1a3020',
                    gap: 8,
                    opacity: ach.unlocked ? 1 : 0.75,
                  }}>
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontSize: 28 }}>{ach.icon ?? '🏅'}</Text>
                    {ach.unlocked && (
                      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(212,175,55,0.2)' }}>
                        <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: 'bold' }}>已解锁</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>{ach.name}</Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 11 }}>{ach.description}</Text>
                  {/* 进度条 */}
                  {!ach.unlocked && (ach.required_value ?? 0) > 0 && (
                    <View style={{ gap: 2 }}>
                      <View className="flex-row justify-between">
                        <Text style={{ color: '#3a5540', fontSize: 10 }}>{ach.progress}/{ach.required_value}</Text>
                        <Text style={{ color: '#3a5540', fontSize: 10 }}>{Math.round(pct * 100)}%</Text>
                      </View>
                      <View className="rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#1a3020' }}>
                        <View className="rounded-full"
                          style={{ height: 4, backgroundColor: '#2196F3', width: `${Math.round(pct * 100)}%` }} />
                      </View>
                    </View>
                  )}
                  {/* 奖励 */}
                  {(ach.reward_beans ?? 0) > 0 && (
                    <View className="flex-row items-center justify-between mt-1">
                      <View className="flex-row items-center">
                        <Text style={{ fontSize: 14 }}>🫘</Text>
                        <Text style={{ color: '#D4AF37', fontSize: 12, marginLeft: 4 }}>+{ach.reward_beans}</Text>
                      </View>
                      {ach.unlocked && !ach.claimed && (
                        <Pressable onPress={() => handleClaim(ach)}
                          className="rounded-full px-3 py-1" style={{ backgroundColor: '#C9372C' }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>领取</Text>
                        </Pressable>
                      )}
                      {ach.claimed && (
                        <Text style={{ color: '#3a5540', fontSize: 11 }}>已领取</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text style={{ fontSize: 40 }}>🎖</Text>
                <Text style={{ color: '#6b9a7c', marginTop: 8 }}>暂无成就数据</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}
