import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import {
  getProfile, createRoom, getRoomByCode, joinRoom,
  countRoomPlayers, addAIPlayer, updateRoomStatus,
  createGameState, getMailbox, getLeaderboard,
} from '@/db/api';
import type { Profile } from '@/types/db';
import { createDeck, dealCards, findDiamond3Owner } from '@/utils/gameLogic';
import { useSession } from '@/ctx';

// 资源图
const BG_URL   = 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_9cc9adcc-4157-415d-bea6-5c7ca69f8c7a.jpg';
const CHAR_URL = 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_60b04345-c9cf-4a3f-b2b3-d3d365b395b0.jpg';

// 导航栏配置
const NAV_ITEMS = [
  { key: 'settings',    label: '设置', icon: '⚙️' },
  { key: 'mailbox',     label: '邮件', icon: '✉️' },
  { key: 'friends',     label: '好友', icon: '👥' },
  { key: 'leaderboard', label: '战绩', icon: '🏆' },
  { key: 'shop',        label: '商城', icon: '🛍️' },
  { key: 'profile',     label: '我的', icon: '👤' },
];

// 游戏模式配置
const GAME_MODES = [
  {
    key: 'classic',
    title: '经典跑得快',
    sub: '匹配真实玩家 · 积分对战',
    icon: '♠',
    badge: '热门',
    badgeColor: '#FF4444',
    from: '#c8860a',
    to: '#7a4e00',
    glowColor: 'rgba(255,193,7,0.5)',
  },
  {
    key: 'crazy',
    title: '疯狂跑得快',
    sub: '高倍积分 · 激烈厮杀',
    icon: '♥',
    badge: '火爆',
    badgeColor: '#FF4444',
    from: '#8b0000',
    to: '#450000',
    glowColor: 'rgba(255,68,68,0.45)',
  },
  {
    key: 'room',
    title: '好友房间',
    sub: '创建 / 加入私人房间',
    icon: '♦',
    badge: '新',
    badgeColor: '#00bcd4',
    from: '#005f6b',
    to: '#002b33',
    glowColor: 'rgba(0,188,212,0.4)',
  },
];

export default function LobbyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session, isLoading: sessionLoading } = useSession();

  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [topPlayers,   setTopPlayers]   = useState<Profile[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [showRoomModal,  setShowRoomModal]  = useState(false);
  const [showJoinModal,  setShowJoinModal]  = useState(false);
  const [showAIModal,    setShowAIModal]    = useState(false);
  const [roomCode,    setRoomCode]    = useState('');
  const [joinCode,    setJoinCode]    = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [errorMsg, setErrorMsg] = useState('');
  const [unreadMail, setUnreadMail] = useState(0);

  useEffect(() => {
    if (session?.user) loadData(session.user.id);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (session?.user) loadData(session.user.id);
    }, [session?.user?.id])
  );

  const loadData = async (uid: string) => {
    const [p, leaders, mails] = await Promise.all([
      getProfile(uid), getLeaderboard(3), getMailbox(uid),
    ]);
    setProfile(p);
    setTopPlayers(leaders);
    setUnreadMail(mails.filter(m => !m.is_read).length);
  };

  const getReadyUser = () => {
    const user = session?.user ?? null;
    if (!user) {
      setErrorMsg(sessionLoading ? '正在初始化，请稍候...' : '账号初始化中，请稍候...');
    }
    return user;
  };

  const btnDisabled = loading || matchLoading || sessionLoading;

  // ── 游戏模式入口 ──────────────────────────────────────────────
  const onPressMode = (key: string) => {
    if (key === 'classic') handleClassicMatch();
    else if (key === 'crazy') handleCrazyMatch();
    else { setShowRoomModal(true); setRoomCode(''); setErrorMsg(''); }
  };

  const handleClassicMatch = async () => {
    const user = getReadyUser(); if (!user) return;
    setMatchLoading(true); setErrorMsg('');
    try {
      const { data: existRooms } = await supabase
        .from('rooms').select('*').eq('status', 'waiting').eq('mode', 'ranked')
        .order('created_at').limit(1);
      let room = existRooms?.[0] ?? null;
      if (room) {
        const cnt = await countRoomPlayers(room.id);
        if (cnt < 4) {
          const { data: rp } = await supabase.from('room_players').select('seat').eq('room_id', room.id);
          const seats = new Set((rp ?? []).map((p: { seat: number }) => p.seat));
          for (let i = 0; i < 4; i++) { if (!seats.has(i)) { await joinRoom(room.id, user.id, i); break; } }
        }
      } else {
        room = await createRoom(user.id, 'ranked');
        if (room) await joinRoom(room.id, user.id, 0);
      }
      if (!room) { setErrorMsg('匹配失败，请重试'); return; }
      await new Promise(r => setTimeout(r, 800));
      const { data: rp } = await supabase.from('room_players').select('seat').eq('room_id', room.id);
      const seats = new Set((rp ?? []).map((p: { seat: number }) => p.seat));
      for (let i = 0; i < 4; i++) { if (!seats.has(i)) await addAIPlayer(room.id, i, 'medium'); }
      await startGame(room.id, user.id);
    } catch { setErrorMsg('匹配出错，请重试'); }
    finally { setMatchLoading(false); }
  };

  const handleCrazyMatch = async () => {
    const user = getReadyUser(); if (!user) return;
    setMatchLoading(true); setErrorMsg('');
    try {
      const room = await createRoom(user.id, 'ranked'); if (!room) return;
      await joinRoom(room.id, user.id, 0);
      for (let i = 1; i < 4; i++) await addAIPlayer(room.id, i, 'hard');
      await startGame(room.id, user.id);
    } catch { setErrorMsg('匹配出错'); }
    finally { setMatchLoading(false); }
  };

  const handleCreateRoom = async () => {
    const user = getReadyUser(); if (!user) return;
    setLoading(true); setErrorMsg('');
    try {
      const room = await createRoom(user.id, 'room');
      if (!room) { setErrorMsg('创建失败'); return; }
      await joinRoom(room.id, user.id, 0);
      setRoomCode(room.code);
    } catch { setErrorMsg('创建失败，请重试'); }
    finally { setLoading(false); }
  };

  const handleStartRoomGame = async () => {
    const user = getReadyUser(); if (!user || !roomCode) return;
    setLoading(true);
    try {
      const { data: rooms } = await supabase.from('rooms').select('*').eq('code', roomCode).maybeSingle();
      if (!rooms) return;
      const { data: rp } = await supabase.from('room_players').select('seat').eq('room_id', rooms.id);
      const seats = new Set((rp ?? []).map((p: { seat: number }) => p.seat));
      for (let i = 0; i < 4; i++) { if (!seats.has(i)) await addAIPlayer(rooms.id, i, 'medium'); }
      await startGame(rooms.id, user.id);
    } finally { setLoading(false); setShowRoomModal(false); }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) { setErrorMsg('请输入房间号'); return; }
    const user = getReadyUser(); if (!user) return;
    setLoading(true); setErrorMsg('');
    try {
      const room = await getRoomByCode(joinCode.trim());
      if (!room) { setErrorMsg('房间不存在'); setLoading(false); return; }
      const cnt = await countRoomPlayers(room.id);
      if (cnt >= 4) { setErrorMsg('房间已满'); setLoading(false); return; }
      const { data: rp } = await supabase.from('room_players').select('seat').eq('room_id', room.id);
      const seats = new Set((rp ?? []).map((p: { seat: number }) => p.seat));
      let freeSeat = -1;
      for (let i = 0; i < 4; i++) { if (!seats.has(i)) { freeSeat = i; break; } }
      if (freeSeat < 0) { setErrorMsg('房间已满'); setLoading(false); return; }
      await joinRoom(room.id, user.id, freeSeat);
      setShowJoinModal(false);
      router.push({ pathname: '/(app)/game', params: { roomId: room.id, mode: 'room' } });
    } catch { setErrorMsg('加入失败，请重试'); }
    finally { setLoading(false); }
  };

  const handleAIGame = async () => {
    const user = getReadyUser(); if (!user) return;
    setLoading(true); setErrorMsg('');
    try {
      const room = await createRoom(user.id, 'ai'); if (!room) return;
      await joinRoom(room.id, user.id, 0);
      for (let i = 1; i < 4; i++) await addAIPlayer(room.id, i, aiDifficulty);
      await startGame(room.id, user.id);
    } catch { setErrorMsg('创建AI游戏失败'); }
    finally { setLoading(false); setShowAIModal(false); }
  };

  const startGame = async (roomId: string, userId: string) => {
    const deck = createDeck();
    const [h0, h1, h2, h3] = dealCards(deck);
    const hands = [h0, h1, h2, h3];
    const firstSeat = findDiamond3Owner(hands);
    await createGameState(roomId, {
      round: 1,
      hands: hands.map(h => h.map(c => ({ id: c.id, suit: c.suit, rank: c.rank, value: c.value }))),
      currentSeat: firstSeat, lastPlay: null, lastPlaySeat: null,
      passCount: 0, phase: 'playing', firstPlayerSeat: firstSeat,
      winOrder: [], turnStartedAt: Date.now(), diamondThreeOwner: firstSeat,
    });
    await updateRoomStatus(roomId, 'playing');
    router.push({ pathname: '/(app)/game', params: { roomId, userId } });
  };

  const isWide = width >= 600;
  const nickname = profile?.nickname ?? '游客';
  const level    = profile?.level    ?? 1;
  const beans    = profile?.beans    ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#0e0212' }}>
      <StatusBar style="light" hidden />

      {/* ── 全屏背景 ── */}
      <Image
        source={{ uri: BG_URL }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
      />
      {/* 双层渐变遮罩：底部加深，顶部轻遮 */}
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(14,2,18,0.68)' }} />
      {/* 底部向上加深区域（深色渐变感） */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 380,
        backgroundColor: 'rgba(14,2,18,0)',
      }} />

      {/* ── 顶部玩家信息栏 ── */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 60,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, zIndex: 30,
        backgroundColor: 'rgba(10,2,15,0.75)',
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,193,7,0.15)',
      }}>

        {/* 玩家头像+信息 */}
        <Pressable onPress={() => router.push('/(app)/profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
          {/* 头像圆 */}
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: '#7B3F9E',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: '#FFD700',
            boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(255,215,0,0.5)' }],
          }}>
            <Text style={{ fontSize: 18 }}>👤</Text>
          </View>
          <View>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{nickname}</Text>
            {/* 等级徽章 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: 'rgba(255,193,7,0.18)', borderRadius: 8,
              paddingHorizontal: 6, paddingVertical: 1,
              borderWidth: 1, borderColor: 'rgba(255,193,7,0.4)',
              alignSelf: 'flex-start', marginTop: 1,
            }}>
              <Text style={{ color: '#FFD700', fontSize: 9, fontWeight: '700' }}>LV.{level}</Text>
            </View>
          </View>
        </Pressable>

        {/* 标题居中 */}
        <Text style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center',
          color: '#FFD700', fontSize: isWide ? 26 : 22, fontWeight: '900',
          letterSpacing: 6, pointerEvents: 'none',
          textShadowColor: 'rgba(255,100,0,0.7)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
        }}>跑 得 快</Text>

        {/* 右侧：豆子 + 设置 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => router.push('/(app)/shop')}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(255,193,7,0.12)', borderRadius: 16,
              paddingHorizontal: 10, paddingVertical: 5,
              borderWidth: 1, borderColor: 'rgba(255,193,7,0.4)',
              boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 6, color: 'rgba(255,193,7,0.25)' }],
            }}>
            <Text style={{ fontSize: 13 }}>🪙</Text>
            <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: '800' }}>{beans.toLocaleString()}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/settings')}
            style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 17 }}>
            <Text style={{ fontSize: 16 }}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      {/* ── 主体内容区 ── */}
      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 64 }}>
        {isWide ? (
          /* ════ 宽屏：三栏横向布局 ════ */
          <View style={{ flex: 1, flexDirection: 'row' }}>

            {/* 左：排行榜 */}
            <View style={{ width: 190, paddingLeft: 14, paddingTop: 16, justifyContent: 'center' }}>
              <RankCard topPlayers={topPlayers} router={router} />
              {errorMsg
                ? <Text style={{ color: '#FF6B6B', fontSize: 11, marginTop: 8, textAlign: 'center' }}>{errorMsg}</Text>
                : null}
            </View>

            {/* 中：立绘 */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Image source={{ uri: CHAR_URL }}
                style={{ width: '85%', height: '105%' }}
                contentFit="contain" contentPosition="bottom" />
            </View>

            {/* 右：游戏模式卡片 */}
            <View style={{ width: 210, paddingRight: 14, justifyContent: 'center', gap: 10 }}>
              {GAME_MODES.map(m => (
                <ModeCard key={m.key} mode={m}
                  disabled={btnDisabled}
                  loading={(m.key === 'classic' || m.key === 'crazy') && (matchLoading || sessionLoading)}
                  onPress={() => onPressMode(m.key)}
                />
              ))}
              {/* 小功能行 */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <SmallBtn label="加入房间" disabled={btnDisabled}
                  onPress={() => { setShowJoinModal(true); setJoinCode(''); setErrorMsg(''); }} />
                <SmallBtn label="AI练习" disabled={btnDisabled}
                  onPress={() => setShowAIModal(true)} />
              </View>
              {errorMsg
                ? <Text style={{ color: '#FF6B6B', fontSize: 11, textAlign: 'center' }}>{errorMsg}</Text>
                : null}
            </View>
          </View>

        ) : (
          /* ════ 窄屏：竖向滚动布局 ════ */
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>

            {/* 立绘 + 排行榜叠加区 */}
            <View style={{ height: 260, position: 'relative' }}>
              <Image source={{ uri: CHAR_URL }}
                style={{ position: 'absolute', right: 0, bottom: 0, width: '62%', height: '110%' }}
                contentFit="contain" contentPosition="bottom" />
              <View style={{ position: 'absolute', left: 12, top: 12, width: width * 0.46 }}>
                <RankCard topPlayers={topPlayers} router={router} compact />
              </View>
            </View>

            {/* 错误提示 */}
            {errorMsg
              ? <Text style={{ color: '#FF6B6B', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 }}>{errorMsg}</Text>
              : null}

            {/* 游戏模式卡片 */}
            <View style={{ paddingHorizontal: 14, marginTop: 10, gap: 10 }}>
              {GAME_MODES.map(m => (
                <ModeCard key={m.key} mode={m} wide
                  disabled={btnDisabled}
                  loading={(m.key === 'classic' || m.key === 'crazy') && (matchLoading || sessionLoading)}
                  onPress={() => onPressMode(m.key)}
                />
              ))}
            </View>

            {/* 小功能行 */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginTop: 10, gap: 10 }}>
              <SmallBtn label="♣ 加入房间" flex disabled={btnDisabled}
                onPress={() => { setShowJoinModal(true); setJoinCode(''); setErrorMsg(''); }} />
              <SmallBtn label="🤖 AI练习" flex disabled={btnDisabled}
                onPress={() => setShowAIModal(true)} />
            </View>
          </ScrollView>
        )}
      </View>

      {/* ── 底部导航栏 ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(8,2,12,0.95)',
        borderTopWidth: 1, borderTopColor: 'rgba(255,193,7,0.12)',
        paddingHorizontal: 4, zIndex: 30,
      }}>
        {NAV_ITEMS.map(item => (
          <Pressable key={item.key}
            onPress={() => router.push(`/(app)/${item.key}` as never)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6 }}>
            <View style={{ position: 'relative' }}>
              <Text style={{ fontSize: 22 }}>{item.icon}</Text>
              {item.key === 'mailbox' && unreadMail > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16,
                  borderRadius: 8, backgroundColor: '#FF4444',
                  alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{unreadMail}</Text>
                </View>
              )}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '500' }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ════ 弹窗 ════ */}

      {/* 创建/开始房间 */}
      <GameModal visible={showRoomModal} title={roomCode ? '房间已创建' : '创建私人房间'}
        onClose={() => setShowRoomModal(false)}>
        {!roomCode ? (
          <>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              生成专属房间号，邀请好友加入对局
            </Text>
            <ActionBtn label="生成房间号" loading={loading} onPress={handleCreateRoom} />
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 6 }}>房间号码</Text>
              <View style={{
                backgroundColor: 'rgba(255,193,7,0.1)', borderRadius: 12,
                paddingHorizontal: 28, paddingVertical: 14,
                borderWidth: 1, borderColor: 'rgba(255,193,7,0.4)',
              }}>
                <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 44, letterSpacing: 8,
                  textShadowColor: 'rgba(255,193,7,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } }}>
                  {roomCode}
                </Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 8 }}>
                分享给好友，或由AI补位直接开始
              </Text>
            </View>
            <ActionBtn label="开始游戏（AI补位）" loading={loading} onPress={handleStartRoomGame} />
          </>
        )}
      </GameModal>

      {/* 加入房间 */}
      <GameModal visible={showJoinModal} title="加入房间" onClose={() => { setShowJoinModal(false); setErrorMsg(''); }}>
        <TextInput
          style={{
            height: 58, backgroundColor: 'rgba(255,255,255,0.06)',
            color: '#FFD700', fontSize: 30, letterSpacing: 8, textAlign: 'center',
            borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,193,7,0.3)',
            marginBottom: 12, fontWeight: '800',
          }}
          placeholder="输入6位房间号" placeholderTextColor="rgba(255,193,7,0.2)"
          value={joinCode} onChangeText={setJoinCode} keyboardType="number-pad" maxLength={6}
        />
        {errorMsg ? <Text style={{ color: '#FF6B6B', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>{errorMsg}</Text> : null}
        <ActionBtn label="加入对局" loading={loading} onPress={handleJoinRoom} />
      </GameModal>

      {/* AI对战 */}
      <GameModal visible={showAIModal} title="AI对战练习" onClose={() => setShowAIModal(false)}>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginBottom: 14 }}>
          选择AI难度
        </Text>
        {([
          { key: 'easy',   label: '简单模式', emoji: '😊', desc: '保守出牌 · 适合新手',  color: '#4CAF50' },
          { key: 'medium', label: '普通模式', emoji: '😐', desc: '灵活应对 · 有一定挑战', color: '#FF9800' },
          { key: 'hard',   label: '困难模式', emoji: '😈', desc: 'AI全力 · 高手对决',    color: '#FF4444' },
        ] as const).map(d => (
          <Pressable key={d.key} onPress={() => setAiDifficulty(d.key)}
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 14,
              borderRadius: 12, marginBottom: 8, gap: 10,
              backgroundColor: aiDifficulty === d.key ? `${d.color}20` : 'rgba(255,255,255,0.04)',
              borderWidth: 1.5, borderColor: aiDifficulty === d.key ? d.color : 'rgba(255,255,255,0.1)',
            }}>
            <Text style={{ fontSize: 22 }}>{d.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: aiDifficulty === d.key ? d.color : '#fff', fontWeight: '700', fontSize: 14 }}>
                {d.label}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{d.desc}</Text>
            </View>
            {aiDifficulty === d.key && (
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: d.color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>
              </View>
            )}
          </Pressable>
        ))}
        <View style={{ height: 8 }} />
        <ActionBtn label="开始AI对战" loading={loading} onPress={handleAIGame} />
      </GameModal>
    </View>
  );
}

// ─── 子组件：游戏模式卡片 ─────────────────────────────────────────
type ModeCardProps = {
  mode: typeof GAME_MODES[number];
  disabled?: boolean; loading?: boolean; wide?: boolean;
  onPress: () => void;
};
function ModeCard({ mode, disabled, loading, wide, onPress }: ModeCardProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        height: wide ? 70 : 64,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
        backgroundColor: pressed ? mode.to : mode.from,
        opacity: disabled ? 0.6 : 1,
        boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: mode.glowColor }],
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
      })}>

      {/* 大花色图标 */}
      <View style={{
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 22, color: '#fff' }}>{mode.icon}</Text>
      </View>

      {/* 文字 */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: wide ? 17 : 15 }}>{mode.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 }}>{mode.sub}</Text>
      </View>

      {/* 徽章 / loading */}
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : (
          <View style={{
            backgroundColor: mode.badgeColor, borderRadius: 10,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{mode.badge}</Text>
          </View>
        )
      }
    </Pressable>
  );
}

// ─── 子组件：小功能按钮 ───────────────────────────────────────────
function SmallBtn({ label, onPress, disabled, flex }: {
  label: string; onPress: () => void; disabled?: boolean; flex?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 16,
        backgroundColor: pressed ? 'rgba(255,193,7,0.15)' : 'rgba(255,193,7,0.08)',
        borderWidth: 1, borderColor: 'rgba(255,193,7,0.3)',
        opacity: disabled ? 0.5 : 1,
      })}>
      <Text style={{ color: 'rgba(255,215,0,0.85)', fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

// ─── 子组件：排行榜卡片 ────────────────────────────────────────────
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_LABEL  = ['1ST', '2ND', '3RD'];

type RankCardProps = {
  topPlayers: Profile[]; router: ReturnType<typeof useRouter>; compact?: boolean;
};
function RankCard({ topPlayers, router, compact }: RankCardProps) {
  const list = topPlayers.length > 0 ? topPlayers.slice(0, 3) : [null, null, null];
  return (
    <View style={{
      borderRadius: 16,
      padding: compact ? 10 : 14,
      backgroundColor: 'rgba(8,2,14,0.82)',
      borderWidth: 1, borderColor: 'rgba(255,193,7,0.25)',
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 20, color: 'rgba(255,193,7,0.15)' }],
    }}>
      {/* 标题 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: compact ? 8 : 12 }}>
        <Text style={{ fontSize: compact ? 14 : 16 }}>🏆</Text>
        <Text style={{ color: '#FFD700', fontWeight: '800', fontSize: compact ? 12 : 14, letterSpacing: 1 }}>好友排行</Text>
      </View>

      {list.map((p, i) => (
        <View key={i} style={{
          flexDirection: 'row', alignItems: 'center',
          marginBottom: compact ? 6 : 8, gap: 8,
        }}>
          {/* 名次徽章 */}
          <View style={{
            width: compact ? 28 : 34, height: compact ? 28 : 34,
            borderRadius: compact ? 7 : 9,
            backgroundColor: `${RANK_COLORS[i]}20`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: RANK_COLORS[i],
          }}>
            <Text style={{ color: RANK_COLORS[i], fontWeight: '900', fontSize: compact ? 8 : 10 }}>{RANK_LABEL[i]}</Text>
          </View>

          {/* 玩家信息 */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: compact ? 11 : 13, fontWeight: '700' }} numberOfLines={1}>
              {p?.nickname ?? `玩家 ${i + 1}`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 9 }}>🪙</Text>
              <Text style={{ color: 'rgba(255,193,7,0.75)', fontSize: compact ? 10 : 11 }}>
                {p?.beans ?? (450 - i * 77)}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* 查看全部 */}
      <Pressable onPress={() => router.push('/(app)/leaderboard')}
        style={{
          marginTop: 4, borderRadius: 12, paddingVertical: 6,
          alignItems: 'center',
          backgroundColor: 'rgba(255,193,7,0.1)',
          borderWidth: 1, borderColor: 'rgba(255,193,7,0.2)',
        }}>
        <Text style={{ color: 'rgba(255,215,0,0.7)', fontSize: 11, fontWeight: '600' }}>查看全部 →</Text>
      </Pressable>
    </View>
  );
}

// ─── 子组件：通用 Modal 容器 ─────────────────────────────────────
function GameModal({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.82)' }}>
        <View style={{
          width: 320, borderRadius: 20, padding: 24,
          backgroundColor: '#0e0218',
          borderWidth: 1.5, borderColor: 'rgba(255,193,7,0.35)',
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 40, color: 'rgba(255,100,0,0.2)' }],
        }}>
          {/* 标题栏 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <Text style={{ flex: 1, color: '#FFD700', fontWeight: '800', fontSize: 17, textAlign: 'center', letterSpacing: 1 }}>
              {title}
            </Text>
            <Pressable onPress={onClose}
              style={{ position: 'absolute', right: 0, width: 28, height: 28, borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>✕</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// ─── 子组件：主操作按钮 ───────────────────────────────────────────
function ActionBtn({ label, loading, onPress }: {
  label: string; loading?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading}
      style={({ pressed }) => ({
        borderRadius: 14, paddingVertical: 15,
        alignItems: 'center',
        backgroundColor: pressed ? '#b8860b' : '#DAA520',
        opacity: loading ? 0.7 : 1,
        boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(218,165,32,0.5)' }],
      })}>
      {loading
        ? <ActivityIndicator color="#000" />
        : <Text style={{ color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 }}>{label}</Text>
      }
    </Pressable>
  );
}

