import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { getMailbox, markMailRead, claimMailReward } from '@/db/api';
import type { Mail } from '@/types/db';

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function MailboxScreen() {
  const router = useRouter();
  const [mails, setMails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [feedback, setFeedback] = useState('');
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
    const data = await getMailbox(user.id);
    setMails(data);
    setLoading(false);
  };

  const handleOpen = async (mail: Mail) => {
    setSelectedMail(mail);
    if (!mail.is_read && myUserId) {
      await markMailRead(mail.id);
      setMails(prev => prev.map(m => m.id === mail.id ? { ...m, is_read: true } : m));
    }
  };

  const handleClaim = async () => {
    if (!selectedMail || !myUserId) return;
    setClaiming(true);
    await claimMailReward(selectedMail.id, myUserId, selectedMail.reward_beans ?? 0, selectedMail.reward_diamonds ?? 0);
    setMails(prev => prev.map(m => m.id === selectedMail.id ? { ...m, reward_claimed: true } : m));
    setSelectedMail(prev => prev ? { ...prev, reward_claimed: true } : prev);
    setFeedback(`已领取奖励 🫘+${selectedMail.reward_beans ?? 0}`);
    setClaiming(false);
    setTimeout(() => setFeedback(''), 2500);
  };

  const unreadCount = mails.filter(m => !m.is_read).length;

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
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>✉️ 邮件</Text>
          {unreadCount > 0 && (
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#C9372C' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {feedback ? <Text style={{ color: '#4CAF50', fontSize: 13 }}>{feedback}</Text> : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={mails}
            keyExtractor={item => item.id}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }) => {
              const hasReward = (item.reward_beans ?? 0) > 0 || (item.reward_diamonds ?? 0) > 0;
              return (
                <Pressable onPress={() => handleOpen(item)}
                  className="flex-row items-center rounded-xl px-4 py-3 mb-2"
                  style={{
                    backgroundColor: item.is_read ? '#0d1f17' : 'rgba(201,55,44,0.08)',
                    borderWidth: 1,
                    borderColor: item.is_read ? '#1a3020' : '#C9372C',
                  }}>
                  {/* 未读标记 */}
                  <View className="mr-3" style={{ width: 8 }}>
                    {!item.is_read && (
                      <View className="rounded-full" style={{ width: 8, height: 8, backgroundColor: '#C9372C' }} />
                    )}
                  </View>
                  {/* 图标 */}
                  <Text style={{ fontSize: 22, marginRight: 12 }}>
                    {item.type === 'system' ? '📢' : item.type === 'reward' ? '🎁' : '📨'}
                  </Text>
                  {/* 内容 */}
                  <View className="flex-1">
                    <Text style={{ color: item.is_read ? '#6b9a7c' : '#fff', fontSize: 14, fontWeight: item.is_read ? 'normal' : 'bold' }}>
                      {item.title}
                    </Text>
                    <Text style={{ color: '#3a5540', fontSize: 12 }} numberOfLines={1}>{item.content}</Text>
                  </View>
                  {/* 右侧 */}
                  <View className="items-end" style={{ gap: 4 }}>
                    <Text style={{ color: '#3a5540', fontSize: 11 }}>{formatTime(item.created_at ?? '')}</Text>
                    {hasReward && !item.reward_claimed && (
                      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#D4AF37' }}>
                        <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>含奖励</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text style={{ fontSize: 40 }}>📭</Text>
                <Text style={{ color: '#6b9a7c', marginTop: 8 }}>邮箱为空</Text>
              </View>
            }
          />
        )}
      </View>

      {/* 邮件详情 Modal */}
      <Modal visible={!!selectedMail} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="rounded-2xl p-6" style={{ width: 340, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030' }}>
            {selectedMail && (
              <>
                <Text className="font-bold mb-2" style={{ color: '#fff', fontSize: 16 }}>{selectedMail.title}</Text>
                <Text style={{ color: '#3a5540', fontSize: 12, marginBottom: 12 }}>
                  {formatTime(selectedMail.created_at ?? '')}
                </Text>
                <Text style={{ color: '#c0d0c8', fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
                  {selectedMail.content}
                </Text>
                {((selectedMail.reward_beans ?? 0) > 0 || (selectedMail.reward_diamonds ?? 0) > 0) && (
                  <View className="rounded-xl p-4 mb-4 items-center"
                    style={{ backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: '#D4AF37', gap: 8 }}>
                    <Text style={{ color: '#D4AF37', fontSize: 14, fontWeight: 'bold' }}>附带奖励</Text>
                    <View className="flex-row" style={{ gap: 16 }}>
                      {(selectedMail.reward_beans ?? 0) > 0 && (
                        <View className="flex-row items-center">
                          <Text style={{ fontSize: 18 }}>🫘</Text>
                          <Text className="ml-1 font-bold" style={{ color: '#D4AF37', fontSize: 18 }}>
                            +{selectedMail.reward_beans}
                          </Text>
                        </View>
                      )}
                      {(selectedMail.reward_diamonds ?? 0) > 0 && (
                        <View className="flex-row items-center">
                          <Text style={{ fontSize: 18 }}>💎</Text>
                          <Text className="ml-1 font-bold" style={{ color: '#88ccff', fontSize: 18 }}>
                            +{selectedMail.reward_diamonds}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!selectedMail.reward_claimed ? (
                      <Pressable onPress={handleClaim} disabled={claiming}
                        className="rounded-lg px-6 py-2" style={{ backgroundColor: '#D4AF37' }}>
                        {claiming ? <ActivityIndicator color="#000" /> : (
                          <Text style={{ color: '#000', fontWeight: 'bold' }}>领取奖励</Text>
                        )}
                      </Pressable>
                    ) : (
                      <Text style={{ color: '#3a5540', fontSize: 13 }}>已领取</Text>
                    )}
                  </View>
                )}
                <Pressable onPress={() => setSelectedMail(null)}
                  className="rounded-lg items-center py-2.5 mt-2"
                  style={{ borderWidth: 1, borderColor: '#2a4030' }}>
                  <Text style={{ color: '#6b9a7c' }}>关闭</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
