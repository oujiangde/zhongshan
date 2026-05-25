import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import { getShopItems, getUserPurchases, purchaseItem, getProfile } from '@/db/api';
import type { ShopItem, Profile } from '@/types/db';

type CategoryType = 'all' | 'avatar_frame' | 'card_back' | 'table_skin';
const CATEGORIES: { key: CategoryType; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '🛍' },
  { key: 'avatar_frame', label: '头像框', icon: '🖼' },
  { key: 'card_back', label: '牌背皮肤', icon: '🃏' },
  { key: 'table_skin', label: '桌面皮肤', icon: '🟢' },
];

export default function ShopScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryType>('all');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);
  const [buying, setBuying] = useState(false);
  const [feedback, setFeedback] = useState('');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const [shopItems, purchases, prof] = await Promise.all([
      getShopItems(),
      getUserPurchases(user.id),
      getProfile(user.id),
    ]);
    setItems(shopItems);
    setOwned(purchases);
    setProfile(prof);
    setLoading(false);
  };

  const handleBuy = async () => {
    if (!confirmItem) return;
    setBuying(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBuying(false); return; }
    const result = await purchaseItem(user.id, confirmItem.id, confirmItem.price_diamonds ?? 0);
    setBuying(false);
    setConfirmItem(null);
    if (result.success) {
      setOwned(prev => [...prev, confirmItem.id]);
      setFeedback('购买成功！');
      setProfile(prev => prev ? { ...prev, diamonds: (prev.diamonds ?? 0) - (confirmItem.price_diamonds ?? 0) } : prev);
    } else {
      setFeedback(result.error ?? '购买失败');
    }
    setTimeout(() => setFeedback(''), 2000);
  };

  const filtered = category === 'all' ? items : items.filter(i => i.category === category);

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
        {/* 标题+钻石 */}
        <View className="flex-row items-center justify-between">
          <Text className="font-bold" style={{ color: '#fff', fontSize: 20 }}>🛍 商城</Text>
          <View className="flex-row items-center rounded-full px-3 py-1.5"
            style={{ backgroundColor: '#1a3020', borderWidth: 1, borderColor: '#2a4030' }}>
            <Text style={{ fontSize: 16 }}>💎</Text>
            <Text className="ml-1 font-bold" style={{ color: '#88ccff', fontSize: 14 }}>{(profile?.diamonds ?? 0).toLocaleString()}</Text>
          </View>
        </View>

        {feedback ? (
          <Text style={{ color: feedback.includes('成功') ? '#4CAF50' : '#C9372C', fontSize: 13 }}>{feedback}</Text>
        ) : null}

        {/* 分类 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map(cat => (
            <Pressable key={cat.key} onPress={() => setCategory(cat.key)}
              className="flex-row items-center rounded-full px-4 py-2"
              style={{ backgroundColor: category === cat.key ? '#C9372C' : '#0d1f17', borderWidth: 1, borderColor: category === cat.key ? '#C9372C' : '#2a4030' }}>
              <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
              <Text className="ml-1" style={{ color: category === cat.key ? '#fff' : '#6b9a7c', fontWeight: category === cat.key ? 'bold' : 'normal' }}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#C9372C" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            numColumns={3}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }) => {
              const isOwned = owned.includes(item.id);
              return (
                <Pressable
                  onPress={() => !isOwned && setConfirmItem(item)}
                  className="flex-1 rounded-2xl overflow-hidden"
                  style={{ backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#1a3020' }}>
                  {/* 图片 */}
                  <View className="items-center justify-center" style={{ height: 100, backgroundColor: '#0a1810' }}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={{ width: 80, height: 80 }} contentFit="contain" />
                    ) : (
                      <Text style={{ fontSize: 44 }}>
                        {item.category === 'avatar_frame' ? '🖼' : item.category === 'card_back' ? '🃏' : '🟢'}
                      </Text>
                    )}
                    {isOwned && (
                      <View className="absolute top-2 right-2 rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(76,175,80,0.85)' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>已拥有</Text>
                      </View>
                    )}
                  </View>
                  {/* 信息 */}
                  <View className="p-3" style={{ gap: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }} numberOfLines={1}>{item.name}</Text>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center">
                        <Text style={{ fontSize: 14 }}>💎</Text>
                        <Text className="ml-1 font-bold" style={{ color: '#88ccff', fontSize: 14 }}>
                          {item.price_diamonds ?? 0}
                        </Text>
                      </View>
                      {!isOwned && (
                        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#C9372C' }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>购买</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text style={{ fontSize: 40 }}>🛍</Text>
                <Text style={{ color: '#6b9a7c', marginTop: 8 }}>暂无商品</Text>
              </View>
            }
          />
        )}
      </View>

      {/* 确认购买 Modal */}
      <Modal visible={!!confirmItem} transparent animationType="fade">
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View className="rounded-2xl p-6" style={{ width: 280, backgroundColor: '#0d1f17', borderWidth: 1, borderColor: '#2a4030' }}>
            <Text className="font-bold text-center mb-2" style={{ color: '#fff', fontSize: 16 }}>确认购买</Text>
            <Text className="text-center mb-4" style={{ color: '#6b9a7c', fontSize: 13 }}>
              {confirmItem?.name}
            </Text>
            <View className="flex-row items-center justify-center mb-4" style={{ gap: 6 }}>
              <Text style={{ fontSize: 20 }}>💎</Text>
              <Text className="font-bold" style={{ color: '#88ccff', fontSize: 24 }}>{confirmItem?.price_diamonds ?? 0}</Text>
              <Text style={{ color: '#6b9a7c', fontSize: 14 }}>钻石</Text>
            </View>
            <Text className="text-center mb-4" style={{ color: '#3a5540', fontSize: 12 }}>
              当前余额：{profile?.diamonds ?? 0} 💎
            </Text>
            <Pressable onPress={handleBuy} disabled={buying}
              className="rounded-lg items-center py-3 mb-2" style={{ backgroundColor: '#C9372C' }}>
              {buying ? <ActivityIndicator color="#fff" /> : (
                <Text className="font-bold" style={{ color: '#fff', fontSize: 15 }}>确认购买</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setConfirmItem(null)} className="items-center py-2">
              <Text style={{ color: '#6b9a7c' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
