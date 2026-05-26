import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, TextInput,
  ActivityIndicator, Modal,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withDelay, withRepeat, withSequence,
  Easing,
} from 'react-native-reanimated';
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
import { initAudio, useLobbySound, useLobbyBGM } from '@/lib/sounds';

// 大厅本地素材（静态 import，避免 require 不被识别的 lint 问题）
import imgBg from '../../../assets/lobby/bg.jpg';
import imgIpChar from '../../../assets/lobby/ip_char.png';
import imgBoxGeren from '../../../assets/lobby/box_geren.png';
import imgBoxDibiao from '../../../assets/lobby/box_dibiao.png';
import imgBtnChuanjian from '../../../assets/lobby/btn_chuanjian.png';
import imgBtnJoinRoom from '../../../assets/lobby/btn_join_room.png';
import imgBtnQy from '../../../assets/lobby/btn_qy.png';
import imgBtnShop from '../../../assets/lobby/btn_shop.png';
import imgBtnBack from '../../../assets/lobby/btn_back.png';
import imgBtnSetting from '../../../assets/lobby/btn_setting.png';
import imgIcoGonggao from '../../../assets/lobby/ico_gonggao.png';
import imgText1 from '../../../assets/lobby/text1.png';
import imgText2 from '../../../assets/lobby/text2.png';
// 新增：豆包设计按钮
import imgBtnAi from '../../../assets/lobby/btn_ai_new.png';
import imgBtnCreateRoom from '../../../assets/lobby/btn_create_room_new.png';
import imgBtnClassic from '../../../assets/lobby/btn_classic_new.png';

const ASSETS = {
  bg: imgBg,
  ipChar: imgIpChar,
  boxGeren: imgBoxGeren,
  boxDibiao: imgBoxDibiao,
  btnChuanjian: imgBtnChuanjian,
  btnJoinRoom: imgBtnJoinRoom,
  btnQy: imgBtnQy,
  btnShop: imgBtnShop,
  btnBack: imgBtnBack,
  btnSetting: imgBtnSetting,
  icoGonggao: imgIcoGonggao,
  text1: imgText1,
  text2: imgText2,
  // 新按钮
  btnAi: imgBtnAi,
  btnCreateRoom: imgBtnCreateRoom,
  btnClassic: imgBtnClassic,
};

export default function LobbyScreen() {
  const router = useRouter();
  const { session, isLoading: sessionLoading } = useSession();

  // ── 音效 ────────────────────────────────────────────────────
  const { playClick, playEnter, playMatch } = useLobbySound();
  const bgm = useLobbyBGM();

  // 音量控制面板显示状态
  const [showVolPanel, setShowVolPanel] = useState(false);
  const volPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 音量条触摸区域宽度（onLayout 获取）
  const volBarWidth = useRef(160);

  /** 显示音量面板并 4s 后自动收起 */
  const openVolPanel = () => {
    playClick();
    setShowVolPanel(true);
    if (volPanelTimer.current) clearTimeout(volPanelTimer.current);
    volPanelTimer.current = setTimeout(() => setShowVolPanel(false), 4000);
  };

  /** 触摸音量条调节音量 */
  const handleVolBarTouch = (pageX: number, barX: number) => {
    const ratio = Math.max(0, Math.min(1, (pageX - barX) / volBarWidth.current));
    void bgm.setVolume(ratio);
    // 重置自动收起计时
    if (volPanelTimer.current) clearTimeout(volPanelTimer.current);
    volPanelTimer.current = setTimeout(() => setShowVolPanel(false), 4000);
  };

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
      // 大厅获得焦点：播放 BGM
      bgm.play();
      return () => {
        // 离开大厅：暂停 BGM
        bgm.pause();
        setShowVolPanel(false);
      };
    // bgm 引用稳定，session.user.id 变化时重新绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const nickname = profile?.nickname ?? '游客';
  const level    = profile?.level    ?? 1;
  const beans    = profile?.beans    ?? 0;

  // ── 入场动画共享值 ────────────────────────────────────────────
  // 顶栏（从上滑入）
  const topBarOpacity = useSharedValue(0);
  const topBarY       = useSharedValue(-44);
  // 玩家信息框（从左滑入）
  // IP 立绘（从右下弹入）
  const ipOpacity = useSharedValue(0);
  const ipX       = useSharedValue(70);
  const ipY       = useSharedValue(60);
  // IP 立绘循环浮动
  // ── 立绘浮动
  const ipFloat = useSharedValue(0);
  // 排行榜（从左淡入）
  const rankOpacity = useSharedValue(0);
  const rankX       = useSharedValue(-40);
  // 辅助行 + 匹配行（从底部淡入）
  const auxOpacity = useSharedValue(0);
  const auxY       = useSharedValue(60);
  const matchOpacity = useSharedValue(0);
  const matchY       = useSharedValue(50);

  // ── 入场动画 + 立绘浮动 ──────────────────────────────────────
  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    // 顶栏
    topBarOpacity.value = withDelay(0,   withTiming(1, { duration: 350, easing: ease }));
    topBarY.value       = withDelay(0,   withTiming(0, { duration: 350, easing: ease }));
    // 玩家信息框
    // IP 立绘（弹性）
    ipOpacity.value = withDelay(150, withTiming(1, { duration: 420, easing: ease }));
    ipX.value       = withDelay(150, withSpring(0,  { damping: 18, stiffness: 120 }));
    ipY.value       = withDelay(150, withSpring(0,  { damping: 16, stiffness: 100 }));
    // 排行榜
    rankOpacity.value = withDelay(260, withTiming(1, { duration: 380, easing: ease }));
    rankX.value       = withDelay(260, withTiming(0, { duration: 380, easing: ease }));
    // 辅助行（创建房间 + AI对战）
    auxOpacity.value = withDelay(340, withTiming(1, { duration: 380, easing: ease }));
    auxY.value       = withDelay(340, withTiming(0, { duration: 380, easing: ease }));
    // 匹配行（经典 + 疯狂）
    matchOpacity.value = withDelay(420, withTiming(1, { duration: 340, easing: ease }));
    matchY.value       = withDelay(420, withTiming(0, { duration: 340, easing: ease }));

    // IP 立绘呼吸浮动（进入后 0.8s 启动）
    const timer = setTimeout(() => {
      ipFloat.value = withRepeat(
        withSequence(
          withTiming(-10, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,   { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1, // 无限循环
        false,
      );
    }, 800);

    // 入场音效（200ms 后播放，与动画节奏同步）
    const sfxTimer = setTimeout(() => {
      void initAudio().then(() => playEnter());
    }, 200);

    return () => { clearTimeout(timer); clearTimeout(sfxTimer); };
  }, []);

  // ── Animated 样式 ────────────────────────────────────────────
  const topBarStyle    = useAnimatedStyle(() => ({ opacity: topBarOpacity.value, transform: [{ translateY: topBarY.value }] }));
  const ipStyle        = useAnimatedStyle(() => ({ opacity: ipOpacity.value, transform: [{ translateX: ipX.value }, { translateY: ipY.value + ipFloat.value }] }));
  const rankStyle      = useAnimatedStyle(() => ({ opacity: rankOpacity.value, transform: [{ translateX: rankX.value }] }));
  
  const auxStyle       = useAnimatedStyle(() => ({ opacity: auxOpacity.value, transform: [{ translateY: auxY.value }] }));
  const matchStyle     = useAnimatedStyle(() => ({ opacity: matchOpacity.value, transform: [{ translateY: matchY.value }] }));

  // 底部按钮区高度（两行：64+56+间距约 140）

  return (
    <View style={{ flex: 1, backgroundColor: '#0D0818' }}>
      <StatusBar style="light" hidden />

      {/* ══ 全屏背景 ══ */}
      <Image
        source={ASSETS.bg}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
      />
      {/* 全局暗化遮罩 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(8,3,22,0.42)' }} />
      {/* 顶部渐变遮罩 */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 70,
        backgroundColor: 'rgba(8,3,22,0.75)' }} />
      {/* 底部渐变遮罩 */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
        backgroundColor: 'rgba(6,2,18,0.92)' }} />

      {/* ══ 主体 flex 列布局 ══ */}
      <View style={{ flex: 1, flexDirection: 'column' }}>

        {/* ── 顶部栏 ── */}
        <Animated.View style={[{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          height: 52, paddingHorizontal: 14, zIndex: 50,
        }, topBarStyle]}>

          {/* 左：设置齿轮 */}
          <Pressable cssInterop={false}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 4 })}
            onPress={() => { playClick(); router.push('/(app)/settings'); }}>
            <View style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: 'rgba(0,0,0,0.40)',
              borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </View>
          </Pressable>

          {/* 中：书法大字 */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{
              color: '#F5D87A',
              fontSize: 24,
              fontWeight: '900',
              letterSpacing: 6,
              textShadowColor: 'rgba(212,175,55,0.85)',
              textShadowRadius: 14,
              textShadowOffset: { width: 0, height: 0 },
            }}>
              钟山跑得快
            </Text>
            {/* 金色装饰横线 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1,
            }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,175,55,0.5)' }} />
              <Text style={{ color: '#D4AF37', fontSize: 9, letterSpacing: 3 }}>♠ ♥ ♣ ♦</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,175,55,0.5)' }} />
            </View>
          </View>

          {/* 右：金币+豆子+音乐+梅花 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* 金币 + 豆子数量 */}
            <Pressable cssInterop={false}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: pressed ? 'rgba(212,175,55,0.22)' : 'rgba(212,175,55,0.10)',
                borderRadius: 18, paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: 'rgba(212,175,55,0.4)',
              })}
              onPress={() => { playClick(); router.push('/(app)/shop'); }}>
              <Text style={{ fontSize: 14 }}>🪙</Text>
              <Text style={{ color: '#F5D87A', fontSize: 13, fontWeight: '800' }}>{beans.toLocaleString()}</Text>
            </Pressable>

            {/* 音乐按钮 */}
            <Pressable cssInterop={false}
              style={({ pressed }) => ({
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: showVolPanel ? 'rgba(212,175,55,0.20)' : 'rgba(0,0,0,0.40)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: showVolPanel ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.18)',
                opacity: pressed ? 0.7 : 1,
              })}
              onPress={openVolPanel}>
              <Text style={{ fontSize: 16 }}>{bgm.muted || bgm.volume === 0 ? '🔇' : '🎵'}</Text>
            </Pressable>

            {/* 梅花装饰图标 */}
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)',
            }}>
              <Text style={{ color: '#D4AF37', fontSize: 18, fontWeight: '900' }}>♣</Text>
            </View>
          </View>
        </Animated.View>

        {/* 音量控制展开面板（浮于顶栏下方） */}
        {showVolPanel && (
          <View style={{
            position: 'absolute', top: 54, right: 52, zIndex: 60,
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: 'rgba(8,2,28,0.92)',
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
            borderWidth: 1, borderColor: 'rgba(255,215,0,0.28)',
          }}>
            <Pressable cssInterop={false}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              onPress={() => { void bgm.toggleMute(); }}>
              <Text style={{ fontSize: 15 }}>{bgm.muted || bgm.volume === 0 ? '🔇' : '🔊'}</Text>
            </Pressable>
            <View
              onLayout={(e) => { volBarWidth.current = e.nativeEvent.layout.width; }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                const barX = e.nativeEvent.pageX - (e.nativeEvent as unknown as { locationX: number }).locationX;
                handleVolBarTouch(e.nativeEvent.pageX, barX);
              }}
              onResponderMove={(e) => {
                const barX = e.nativeEvent.pageX - (e.nativeEvent as unknown as { locationX: number }).locationX;
                handleVolBarTouch(e.nativeEvent.pageX, barX);
              }}
              style={{ width: 90, height: 20, justifyContent: 'center' }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              <View style={{
                position: 'absolute', left: 0, top: 8, height: 4, borderRadius: 2,
                backgroundColor: '#FFD700',
                width: `${(bgm.muted ? 0 : bgm.volume) * 100}%`,
              }} />
              <View style={{
                position: 'absolute', top: 5,
                left: `${(bgm.muted ? 0 : bgm.volume) * 100}%`,
                marginLeft: -6, width: 12, height: 12, borderRadius: 6,
                backgroundColor: '#FFD700', borderWidth: 1.5, borderColor: '#fff',
              }} />
            </View>
            <Text style={{ color: 'rgba(255,215,0,0.85)', fontSize: 10, fontWeight: '700', minWidth: 26 }}>
              {bgm.muted ? '0%' : `${Math.round(bgm.volume * 100)}%`}
            </Text>
          </View>
        )}

        {/* ── 主体三段式 ── */}
        <View style={{ flex: 1, flexDirection: 'row', overflow: 'hidden' }}>

          {/* 左侧：好友排行面板 */}
          <Animated.View style={[{
            width: 170, paddingLeft: 12, paddingRight: 6, paddingTop: 8,
            justifyContent: 'flex-start',
          }, rankStyle]}>
            {/* 金色边框面板 */}
            <View style={{
              backgroundColor: 'rgba(10,5,25,0.82)',
              borderWidth: 1.5, borderColor: '#D4AF37',
              borderRadius: 14,
              paddingVertical: 10, paddingHorizontal: 10,
              boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 18, color: 'rgba(212,175,55,0.25)' }],
            }}>
              {/* 面板标题 */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10, gap: 6,
              }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,175,55,0.4)' }} />
                <Text style={{ color: '#D4AF37', fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>好友排行</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(212,175,55,0.4)' }} />
              </View>

              {/* 玩家列表 */}
              {(topPlayers.length > 0 ? topPlayers.slice(0, 3) : [null, null, null]).map((p, i) => (
                <View key={i} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingVertical: 6,
                  borderBottomWidth: i < 2 ? 1 : 0,
                  borderBottomColor: 'rgba(212,175,55,0.12)',
                }}>
                  {/* 排名 */}
                  <Text style={{
                    color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                    fontSize: 13, fontWeight: '900', width: 18, textAlign: 'center',
                  }}>{i + 1}</Text>
                  {/* 头像 */}
                  <View style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: '#2a1b38', alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                  }}>
                    <Text style={{ fontSize: 14 }}>👤</Text>
                  </View>
                  {/* 昵称 + 豆子 */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                      {p ? p.nickname : '---'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <Text style={{ fontSize: 9 }}>🪙</Text>
                      <Text style={{ color: '#D4AF37', fontSize: 10, fontWeight: '600' }}>
                        {p ? (p.beans ?? 0).toLocaleString() : '---'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* 查看全部按钮 */}
              <Pressable cssInterop={false}
                style={({ pressed }) => ({
                  marginTop: 10,
                  backgroundColor: pressed ? '#B8960A' : '#D4AF37',
                  borderRadius: 10, paddingVertical: 7,
                  alignItems: 'center',
                })}
                onPress={() => { playClick(); router.push('/(app)/leaderboard'); }}>
                <Text style={{ color: '#0D0818', fontSize: 12, fontWeight: '800' }}>查看全部</Text>
              </Pressable>
            </View>

            {/* 玩家信息卡（面板下方） */}
            <Pressable cssInterop={false}
              style={({ pressed }) => ({
                marginTop: 10, opacity: pressed ? 0.85 : 1,
              })}
              onPress={() => { playClick(); router.push('/(app)/profile'); }}>
              <View style={{
                backgroundColor: 'rgba(10,5,25,0.82)',
                borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)',
                borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: '#2a1b38', alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: '#D4AF37',
                }}>
                  <Text style={{ fontSize: 16 }}>👤</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{nickname}</Text>
                  <Text style={{ color: '#D4AF37', fontSize: 10, fontWeight: '600' }}>LV.{level}</Text>
                </View>
              </View>
            </Pressable>
          </Animated.View>

          {/* 中间：IP 立绘 */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
            {/* 金色粒子光效（装饰圆点） */}
            {([
              { top: 60,  left: 30,  size: 4, opacity: 0.6  },
              { top: 40,  left: 80,  size: 3, opacity: 0.45 },
              { top: 80,  right: 50, size: 5, opacity: 0.55 },
              { top: 120, left: 16,  size: 3, opacity: 0.4  },
              { top: 24,  right: 70, size: 4, opacity: 0.5  },
              { top: 150, right: 28, size: 6, opacity: 0.35 },
            ] as Array<{ top: number; left?: number; right?: number; size: number; opacity: number }>
            ).map((dot, idx) => (
              <View key={idx} style={{
                position: 'absolute',
                top: dot.top,
                ...(dot.left  !== undefined ? { left:  dot.left  } : {}),
                ...(dot.right !== undefined ? { right: dot.right } : {}),
                width: dot.size, height: dot.size, borderRadius: dot.size / 2,
                backgroundColor: '#D4AF37', opacity: dot.opacity,
              }} />
            ))}

            {/* IP 立绘 */}
            <Animated.View style={ipStyle}>
              <Image
                source={ASSETS.ipChar}
                style={{ width: 340, height: 520 }}
                contentFit="contain"
                contentPosition="bottom"
              />
            </Animated.View>
          </View>

          {/* 右侧：3 个竖排大按钮 */}
          <Animated.View style={[{
            width: 175, paddingRight: 12, paddingLeft: 6,
            justifyContent: 'center', gap: 12,
          }, auxStyle]}>

            {/* 经典跑得快（豆包12，800x449横版图） */}
            <Pressable cssInterop={false}
              disabled={btnDisabled}
              style={({ pressed }) => ({
                opacity: btnDisabled ? 0.6 : pressed ? 0.80 : 1,
                alignItems: 'center', justifyContent: 'center',
              })}
              onPress={() => { playMatch(); handleClassicMatch(); }}>
              {(matchLoading || sessionLoading) ? (
                <View style={{
                  width: 155, height: 87, borderRadius: 14,
                  backgroundColor: '#c8830d', alignItems: 'center', justifyContent: 'center',
                }}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              ) : (
                <Image source={ASSETS.btnClassic}
                  style={{ width: 155, height: 87 }}
                  contentFit="contain" />
              )}
            </Pressable>

            {/* 人机对战（豆包8，600x600正方形图） */}
            <Pressable cssInterop={false}
              disabled={btnDisabled}
              style={({ pressed }) => ({
                opacity: btnDisabled ? 0.6 : pressed ? 0.80 : 1,
                alignItems: 'center', justifyContent: 'center',
              })}
              onPress={() => { playClick(); setShowAIModal(true); }}>
              <Image source={ASSETS.btnAi}
                style={{ width: 140, height: 140 }}
                contentFit="contain" />
            </Pressable>

            {/* 创建房间（豆包9，600x600正方形图） */}
            <Pressable cssInterop={false}
              disabled={btnDisabled}
              style={({ pressed }) => ({
                opacity: btnDisabled ? 0.6 : pressed ? 0.80 : 1,
                alignItems: 'center', justifyContent: 'center',
              })}
              onPress={() => { playClick(); setShowRoomModal(true); setRoomCode(''); setErrorMsg(''); }}>
              <Image source={ASSETS.btnCreateRoom}
                style={{ width: 140, height: 140 }}
                contentFit="contain" />
            </Pressable>

            {/* 错误提示 */}
            {errorMsg ? (
              <Text style={{ color: '#FF6B6B', fontSize: 11, textAlign: 'center' }}>{errorMsg}</Text>
            ) : null}
          </Animated.View>
        </View>

        {/* ── 底部导航栏（8 图标） ── */}
        <Animated.View style={[{
          height: 60, flexDirection: 'row', alignItems: 'center',
          backgroundColor: 'rgba(6,2,18,0.90)',
          borderTopWidth: 1, borderTopColor: 'rgba(212,175,55,0.22)',
          paddingHorizontal: 8,
        }, matchStyle]}>
          {([
            { icon: '⚙️', label: '设置',   onPress: () => router.push('/(app)/settings') },
            { icon: '📬', label: '邮件',   onPress: () => router.push('/(app)/mailbox'),   badge: unreadMail },
            { icon: '📨', label: '邮件',   onPress: () => router.push('/(app)/mailbox') },
            { icon: '🔗', label: '分享',   onPress: () => {} },
            { icon: '📖', label: '玩法',   onPress: () => router.push('/(app)/achievements') },
            { icon: '💬', label: '反馈',   onPress: () => {} },
            { icon: '🏆', label: '战绩',   onPress: () => router.push('/(app)/profile') },
            { icon: '🛒', label: '商城',   onPress: () => router.push('/(app)/shop') },
          ] as const).map((item, idx) => (
            <Pressable key={idx} cssInterop={false}
              style={({ pressed }) => ({
                flex: 1, alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.65 : 1, paddingVertical: 4,
              })}
              onPress={() => { playClick(); item.onPress(); }}>
              <View style={{ position: 'relative' }}>
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                {(item as { badge?: number }).badge ? (
                  <View style={{
                    position: 'absolute', top: -4, right: -6,
                    backgroundColor: '#C93737', borderRadius: 8,
                    minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>
                      {String((item as { badge?: number }).badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, marginTop: 1, fontWeight: '600' }}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      </View>

      {/* ══ 弹窗 ══ */}

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
      borderRadius: 18,
      padding: compact ? 10 : 16,
      backgroundColor: 'rgba(6,2,16,0.92)',
      borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.3)',
      boxShadow: [
        { offsetX: 0, offsetY: 0, blurRadius: 24, color: 'rgba(212,175,55,0.18)' },
        { offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(0,0,0,0.6)' },
      ],
    }}>
      {/* 标题 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: compact ? 8 : 12 }}>
        <Text style={{ fontSize: compact ? 14 : 16 }}>🏆</Text>
        <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: compact ? 12 : 14, letterSpacing: 2 }}>好友排行</Text>
      </View>

      {list.map((p, i) => (
        <View key={i} style={{
          flexDirection: 'row', alignItems: 'center',
          marginBottom: compact ? 7 : 10, gap: 8,
          backgroundColor: i === 0 ? 'rgba(212,175,55,0.1)' : 'transparent',
          borderRadius: 10, paddingVertical: i === 0 ? 3 : 0, paddingHorizontal: i === 0 ? 4 : 0,
        }}>
          {/* 名次徽章 */}
          <View style={{
            width: compact ? 26 : 32, height: compact ? 26 : 32,
            borderRadius: compact ? 6 : 8,
            backgroundColor: `${RANK_COLORS[i]}22`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: RANK_COLORS[i],
            boxShadow: i === 0 ? [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: `${RANK_COLORS[i]}66` }] : [],
          }}>
            <Text style={{ color: RANK_COLORS[i], fontWeight: '900', fontSize: compact ? 8 : 10 }}>{RANK_LABEL[i]}</Text>
          </View>

          {/* 玩家信息 */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: i === 0 ? '#D4AF37' : '#fff', fontSize: compact ? 11 : 13, fontWeight: '700' }} numberOfLines={1}>
              {p?.nickname ?? `玩家 ${i + 1}`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 9 }}>🪙</Text>
              <Text style={{ color: 'rgba(212,175,55,0.8)', fontSize: compact ? 10 : 11 }}>
                {p?.beans ?? (450 - i * 77)}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* 查看全部 */}
      <Pressable onPress={() => router.push('/(app)/leaderboard')}
        style={({ pressed }) => ({
          marginTop: 4, borderRadius: 12, paddingVertical: 7,
          alignItems: 'center',
          backgroundColor: pressed ? 'rgba(212,175,55,0.18)' : 'rgba(212,175,55,0.08)',
          borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)',
        })}>
        <Text style={{ color: 'rgba(212,175,55,0.8)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>查看全部 →</Text>
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)' }}>
        <View style={{
          width: 320, borderRadius: 24, padding: 24,
          backgroundColor: '#08041a',
          borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.4)',
          boxShadow: [
            { offsetX: 0, offsetY: 0, blurRadius: 40, color: 'rgba(212,175,55,0.2)' },
            { offsetX: 0, offsetY: 0, blurRadius: 80, color: 'rgba(200,50,50,0.12)' },
          ],
        }}>
          {/* 标题栏 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ flex: 1, color: '#D4AF37', fontWeight: '800', fontSize: 17, textAlign: 'center', letterSpacing: 2 }}>
              {title}
            </Text>
            <Pressable onPress={onClose}
              style={({ pressed }) => ({
                position: 'absolute', right: 0, width: 30, height: 30, borderRadius: 15,
                backgroundColor: pressed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
              })}>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>✕</Text>
            </Pressable>
          </View>
          {/* 分割线 */}
          <View style={{ height: 1, backgroundColor: 'rgba(212,175,55,0.15)', marginBottom: 18 }} />
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
        borderRadius: 16, paddingVertical: 15,
        alignItems: 'center',
        backgroundColor: pressed ? '#a88010' : '#c8960e',
        opacity: loading ? 0.7 : 1,
        boxShadow: [
          { offsetX: 0, offsetY: 5, blurRadius: 18, color: 'rgba(212,175,55,0.55)' },
          { offsetX: 0, offsetY: 0, blurRadius: 8, color: 'rgba(212,175,55,0.3)' },
        ],
        borderWidth: 1.5, borderColor: 'rgba(255,220,100,0.5)',
      })}>
      {loading
        ? <ActivityIndicator color="#000" />
        : <Text style={{ color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 }}>{label}</Text>
      }
    </Pressable>
  );
}

