import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import type { SettlementResult } from '@/types/game';

const ROLE_LABELS: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  big_winner: { label: '大赢家', color: '#D4AF37', icon: '👑', bg: 'rgba(212,175,55,0.15)' },
  small_winner: { label: '小赢家', color: '#4CAF50', icon: '🎉', bg: 'rgba(76,175,80,0.15)' },
  sole_winner: { label: '独赢', color: '#D4AF37', icon: '🏆', bg: 'rgba(212,175,55,0.15)' },
  loser: { label: '输家', color: '#C9372C', icon: '😢', bg: 'rgba(201,55,44,0.1)' },
};

export default function SettlementScreen() {
  const router = useRouter();
  const { settlementData, myUserId, roomId } = useLocalSearchParams<{
    settlementData: string;
    myUserId: string;
    roomId: string;
  }>();

  let results: SettlementResult[] = [];
  try {
    results = JSON.parse(settlementData ?? '[]');
  } catch {
    results = [];
  }

  const myResult = results.find(r => r.userId === myUserId);
  const sortedResults = [...results].sort((a, b) => b.beanChange - a.beanChange);

  return (
    <View className="flex-1" style={{ backgroundColor: '#0a1a12' }}>
      <StatusBar style="light" />
      <View className="flex-1 flex-row items-center justify-center px-8" style={{ gap: 24 }}>
        {/* 左侧：我的结果 */}
        <View className="items-center rounded-2xl p-6"
          style={{ width: 220, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020', gap: 12 }}>
          <Text className="font-bold" style={{ color: '#6b9a7c', fontSize: 14 }}>本局结果</Text>

          {myResult && (() => {
            const roleInfo = ROLE_LABELS[myResult.role];
            return (
              <View className="items-center" style={{ gap: 8 }}>
                <View className="rounded-full items-center justify-center overflow-hidden"
                  style={{ width: 70, height: 70, borderWidth: 3, borderColor: roleInfo.color }}>
                  {myResult.avatarUrl ? (
                    <Image source={{ uri: myResult.avatarUrl }} style={{ width: 70, height: 70 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3020' }}>
                      <Text style={{ fontSize: 32 }}>👤</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 40 }}>{roleInfo.icon}</Text>
                <Text className="font-bold" style={{ color: roleInfo.color, fontSize: 24 }}>{roleInfo.label}</Text>
                <View className="items-center">
                  <Text style={{ color: myResult.beanChange >= 0 ? '#4CAF50' : '#C9372C', fontSize: 32, fontWeight: 'bold' }}>
                    {myResult.beanChange >= 0 ? `+${myResult.beanChange}` : `${myResult.beanChange}`}
                  </Text>
                  <Text style={{ color: '#6b9a7c', fontSize: 14 }}>豆子</Text>
                </View>
                {myResult.remainingCards > 0 && (
                  <Text style={{ color: '#6b9a7c', fontSize: 13 }}>剩余 {myResult.remainingCards} 张牌</Text>
                )}
              </View>
            );
          })()}
        </View>

        {/* 右侧：全局结算 */}
        <View className="rounded-2xl p-5"
          style={{ flex: 1, maxWidth: 400, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
          <Text className="font-bold mb-4 text-center" style={{ color: '#fff', fontSize: 16 }}>本局结算</Text>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 10 }}>
              {sortedResults.map((result) => {
                const roleInfo = ROLE_LABELS[result.role];
                const isMe = result.userId === myUserId;
                return (
                  <View key={result.seat}
                    className="flex-row items-center rounded-xl px-4 py-3"
                    style={{ backgroundColor: roleInfo.bg, borderWidth: isMe ? 1.5 : 0, borderColor: isMe ? roleInfo.color : 'transparent' }}>
                    {/* 头像 */}
                    <View className="rounded-full overflow-hidden mr-3"
                      style={{ width: 38, height: 38, borderWidth: 2, borderColor: roleInfo.color }}>
                      {result.avatarUrl ? (
                        <Image source={{ uri: result.avatarUrl }} style={{ width: 38, height: 38 }} contentFit="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3020' }}>
                          <Text style={{ fontSize: 18 }}>👤</Text>
                        </View>
                      )}
                    </View>
                    {/* 信息 */}
                    <View className="flex-1">
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{result.nickname}</Text>
                        {isMe && <Text style={{ color: '#6b9a7c', fontSize: 11 }}>(我)</Text>}
                      </View>
                      <Text style={{ color: '#6b9a7c', fontSize: 12 }}>
                        {result.remainingCards === 0 ? '出完所有牌' : `剩余${result.remainingCards}张`}
                      </Text>
                    </View>
                    {/* 角色+豆子 */}
                    <View className="items-end" style={{ gap: 2 }}>
                      <View className="flex-row items-center rounded-full px-2 py-0.5"
                        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                        <Text style={{ fontSize: 14 }}>{roleInfo.icon}</Text>
                        <Text style={{ color: roleInfo.color, fontSize: 12, marginLeft: 4, fontWeight: 'bold' }}>{roleInfo.label}</Text>
                      </View>
                      <Text style={{ color: result.beanChange >= 0 ? '#4CAF50' : '#C9372C', fontSize: 18, fontWeight: 'bold' }}>
                        {result.beanChange >= 0 ? `+${result.beanChange}` : `${result.beanChange}`} 🫘
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* 操作按钮 */}
          <View className="flex-row mt-4" style={{ gap: 12 }}>
            <Pressable
              onPress={() => router.replace('/(app)/lobby')}
              className="flex-1 rounded-xl items-center py-3"
              style={{ borderWidth: 1, borderColor: '#2a4030' }}>
              <Text style={{ color: '#6b9a7c', fontSize: 14 }}>返回大厅</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/(app)/lobby')}
              className="flex-1 rounded-xl items-center py-3"
              style={{ backgroundColor: '#C9372C' }}>
              <Text className="font-bold" style={{ color: '#fff', fontSize: 14 }}>再来一局</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
