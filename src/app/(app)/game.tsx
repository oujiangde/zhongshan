/**
 * 游戏核心页面 - 横屏4人牌桌（精品商业手游风格 v2）
 * 座位布局：0=底部(自己), 1=左, 2=上, 3=右
 */
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import imgGameBg from '../../../assets/game/bg.jpg';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withSequence, withRepeat, Easing, runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/client/supabase';
import { getGameState, updateGameState, saveGameHistory, updateBeans, updateGameStats, getRoomPlayers, getProfile } from '@/db/api';
import {
  sortCards, buildPlay, validatePlay, removeCards, aiSelectPlay, getTypeName,
  calculateSettlement, getHintCards,
} from '@/utils/gameLogic';
import type { Card, Play, SeatPosition, PlayerState } from '@/types/game';
import type { GameStateRow, RoomPlayer } from '@/types/db';

// ─── 主题色（精品商业游戏风格）───────────────────────────
const C = {
  // 桌面
  tableBg: '#0e4a22',          // 深绿桌布
  tableRim: '#c8901e',         // 金色木纹边框
  tableShine: 'rgba(255,220,80,0.18)',
  // 导航栏
  barBg: 'rgba(8,4,16,0.88)',
  barBorder: 'rgba(180,130,30,0.5)',
  // 文字
  gold: '#FFD700',
  goldDim: 'rgba(255,215,0,0.4)',
  goldLight: '#FFE566',
  red: '#E8192C',
  white: '#FFFFFF',
  dim: '#b8a080',
  // 玩家卡片
  cardBg: 'rgba(12,6,28,0.88)',
  cardBorder: 'rgba(140,90,20,0.45)',
  // 按钮
  btnPlay: '#1aaa3a',          // 出牌绿
  btnPass: 'rgba(255,255,255,0.07)',
  btnHint: '#c8820a',          // 提示橙
  btnBomb: '#cc2020',
};

// 花色颜色 & 符号
const SUIT_COLORS: Record<string, string> = {
  spades: '#111', clubs: '#111', hearts: '#D91C2A', diamonds: '#D91C2A',
};
const SUIT_SYMBOLS: Record<string, string> = { spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦' };
const EMOJIS = ['👍', '😄', '😂', '🤔', '💪', '🎉', '😤', '😮'];

// ==========================================
// 段位工具
// ==========================================
const RANKS_LIST = ['青铜', '白银', '黄金', '铂金', '钻石', '王者'];
const RANK_COLORS = ['#cd7f32', '#c0c0c0', '#ffd700', '#e5e4e2', '#b9f2ff', '#ff6b35'];
function getRankLabel(beans: number) {
  const idx = Math.min(Math.floor(beans / 20), 5);
  return { label: RANKS_LIST[idx], color: RANK_COLORS[idx] };
}

// ==========================================
// 扑克牌组件 v2 — 白底，清晰花色，弹性选中
// ==========================================
function CardView({
  card, selected, onPress, small, faceDown, rotationDeg = 0,
}: {
  card: Card; selected?: boolean; onPress?: () => void;
  small?: boolean; faceDown?: boolean; rotationDeg?: number;
}) {
  const w = small ? 30 : 48;
  const h = small ? 42 : 68;
  const fs = small ? 10 : 17;

  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (selected) {
      translateY.value = withSpring(-20, { damping: 9, stiffness: 280, mass: 0.5 });
      scale.value = withSequence(
        withSpring(1.14, { damping: 7, stiffness: 320 }),
        withSpring(1.06, { damping: 12, stiffness: 200 }),
      );
    } else {
      translateY.value = withSpring(0, { damping: 11, stiffness: 220 });
      scale.value = withSpring(1, { damping: 11, stiffness: 220 });
    }
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotationDeg}deg` },
    ],
  }));

  if (faceDown) {
    return (
      <Animated.View style={[animStyle, {
        width: w, height: h, borderRadius: 6,
        backgroundColor: '#1a3a52',
        borderWidth: 1.5, borderColor: '#3a7a9a',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.7)' }],
      }]}>
        <View style={{
          position: 'absolute', inset: 3, borderRadius: 3,
          borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
        }} />
        <Text style={{ fontSize: small ? 8 : 12, color: 'rgba(255,215,0,0.3)' }}>✦</Text>
      </Animated.View>
    );
  }

  const color = SUIT_COLORS[card.suit];
  const suit = SUIT_SYMBOLS[card.suit];
  const rank = card.rank;

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        style={{
          width: w, height: h,
          backgroundColor: selected ? '#fffce8' : '#ffffff',
          borderRadius: 6,
          borderWidth: selected ? 2.5 : 1.5,
          borderColor: selected ? C.gold : '#d4c888',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: selected
            ? [
              { offsetX: 0, offsetY: 0, blurRadius: 18, color: 'rgba(255,215,0,0.95)' },
              { offsetX: 0, offsetY: 5, blurRadius: 10, color: 'rgba(0,0,0,0.5)' },
            ]
            : [{ offsetX: 0, offsetY: 2, blurRadius: 5, color: 'rgba(0,0,0,0.55)' }],
        }}>
        <Text style={{
          position: 'absolute', top: small ? 2 : 3, left: small ? 2 : 3,
          color, fontSize: small ? 9 : 13, fontWeight: '900', lineHeight: small ? 10 : 14,
        }}>{rank}</Text>
        <Text style={{
          position: 'absolute', top: small ? 11 : 15, left: small ? 2 : 3,
          color, fontSize: small ? 7 : 11,
        }}>{suit}</Text>
        <Text style={{ color, fontSize: fs, fontWeight: '700', marginTop: 4 }}>{suit}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ==========================================
// 飞牌动画组件（出牌飞向桌面中央）
// ==========================================
function FlyingCards({
  cards, visible, onDone,
}: { cards: Card[]; visible: boolean; onDone: () => void }) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    if (!visible) return;
    translateX.value = 0;
    translateY.value = 0;
    opacity.value = 1;
    scale.value = 0.8;
    // 飞行动画：向上飞向桌面中央，然后淡出
    translateY.value = withTiming(-160, { duration: 280, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94) });
    scale.value = withTiming(1.1, { duration: 280 });
    opacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 80, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[{
      position: 'absolute', bottom: 80, left: 0, right: 0,
      flexDirection: 'row', justifyContent: 'center',
      zIndex: 999, pointerEvents: 'none',
    }, animStyle]}>
      {cards.map((c, i) => (
        <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -12 }}>
          <CardView card={c} />
        </View>
      ))}
    </Animated.View>
  );
}

// ==========================================
// 炸弹全屏特效（跑得快无炸弹规则，此组件保留为空壳以兼容引用）
// ==========================================
function BombEffect(_props: { visible: boolean }) {
  return null;
}

// ==========================================
// 对手牌背（左右侧，竖向叠放）
// ==========================================
function SideOpponentCards({ count }: { count: number }) {
  const total = Math.min(count, 9);
  return (
    <View style={{ alignItems: 'center', height: 40 + (total - 1) * 7 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 7 }}>
          <CardView card={{ id: `b${i}`, suit: 'spades', rank: '3', value: 0 }} small faceDown />
        </View>
      ))}
    </View>
  );
}

// ==========================================
// 对家牌背（上方，横向叠放）
// ==========================================
function TopOpponentCards({ count }: { count: number }) {
  const total = Math.min(count, 13);
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -18 }}>
          <CardView card={{ id: `tb${i}`, suit: 'spades', rank: '3', value: 0 }} small faceDown />
        </View>
      ))}
    </View>
  );
}

// ==========================================
// 玩家头像框
// ==========================================
function PlayerAvatar({ player, isCurrentTurn, size = 44 }: {
  player: PlayerState; isCurrentTurn: boolean; size?: number;
}) {
  const glow = useSharedValue(0);
  useEffect(() => {
    if (isCurrentTurn) {
      glow.value = withRepeat(
        withSequence(withTiming(1, { duration: 600 }), withTiming(0.4, { duration: 600 })),
        -1, true,
      );
    } else {
      glow.value = withTiming(0, { duration: 300 });
    }
  }, [isCurrentTurn]);

  const glowStyle = useAnimatedStyle(() => ({
    boxShadow: isCurrentTurn
      ? [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: `rgba(255,215,0,${glow.value * 0.85})` }]
      : [],
  }));

  return (
    <Animated.View style={[{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: isCurrentTurn ? 2.5 : 1.5,
      borderColor: isCurrentTurn ? C.gold : 'rgba(140,100,20,0.5)',
      overflow: 'hidden',
    }, glowStyle]}>
      {player.avatarUrl ? (
        <Image source={{ uri: player.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#1a0e2e', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.46 }}>{player.isAI ? '🤖' : '👤'}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ==========================================
// 倒计时环（头像外圈进度条）
// ==========================================
function CountdownRing({ countdown, total = 20 }: { countdown: number; total?: number }) {
  const urgent = countdown <= 5;
  return (
    <View style={{
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: urgent ? 'rgba(230,25,44,0.18)' : 'rgba(255,215,0,0.1)',
      borderWidth: 2.5,
      borderColor: urgent ? C.red : C.gold,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{
        color: urgent ? C.red : C.gold,
        fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'],
      }}>{countdown}</Text>
    </View>
  );
}

// ==========================================
// 左右侧玩家卡片
// ==========================================
function SidePlayerCard({ player, isCurrentTurn, countdown }: {
  player: PlayerState; isCurrentTurn: boolean; countdown: number;
}) {
  return (
    <View style={{
      width: 74, borderRadius: 12,
      backgroundColor: C.cardBg,
      borderWidth: isCurrentTurn ? 1.5 : 1,
      borderColor: isCurrentTurn ? C.gold : C.cardBorder,
      alignItems: 'center', paddingVertical: 7, gap: 4,
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(255,215,0,0.45)' }]
        : [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.65)' }],
    }}>
      <PlayerAvatar player={player} isCurrentTurn={isCurrentTurn} size={38} />
      <Text style={{ color: isCurrentTurn ? C.gold : C.white, fontSize: 10, fontWeight: '700' }} numberOfLines={1}>
        {player.nickname}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
        <View style={{
          backgroundColor: 'rgba(255,215,0,0.08)', borderRadius: 6,
          paddingHorizontal: 5, paddingVertical: 1,
          borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
        }}>
          <Text style={{ color: C.dim, fontSize: 9 }}>{player.handCount}张</Text>
        </View>
        {isCurrentTurn && <CountdownRing countdown={countdown} />}
      </View>
      {player.handCount === 1 && (
        <View style={{
          backgroundColor: 'rgba(230,25,44,0.25)', borderRadius: 6,
          paddingHorizontal: 6, paddingVertical: 2,
          borderWidth: 1, borderColor: C.red,
        }}>
          <Text style={{ color: C.red, fontSize: 9, fontWeight: '900' }}>报单！</Text>
        </View>
      )}
    </View>
  );
}

// ==========================================
// 上方对家信息条
// ==========================================
function TopPlayerBar({ player, isCurrentTurn, countdown }: {
  player: PlayerState; isCurrentTurn: boolean; countdown: number;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: isCurrentTurn ? 'rgba(255,215,0,0.1)' : 'rgba(8,4,16,0.9)',
      borderRadius: 22, paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: isCurrentTurn ? 1.5 : 1,
      borderColor: isCurrentTurn ? C.gold : C.cardBorder,
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(255,215,0,0.4)' }]
        : [],
    }}>
      <PlayerAvatar player={player} isCurrentTurn={isCurrentTurn} size={26} />
      <Text style={{ color: isCurrentTurn ? C.gold : C.white, fontSize: 10, fontWeight: '700' }}>
        {player.nickname}
      </Text>
      <View style={{
        backgroundColor: 'rgba(255,215,0,0.08)', borderRadius: 6,
        paddingHorizontal: 5, paddingVertical: 1,
      }}>
        <Text style={{ color: C.dim, fontSize: 9 }}>{player.handCount}张</Text>
      </View>
      {player.handCount === 1 && (
        <Text style={{ color: C.red, fontSize: 9, fontWeight: '900' }}>报单！</Text>
      )}
      {isCurrentTurn && <CountdownRing countdown={countdown} />}
    </View>
  );
}

// ==========================================
// 中央出牌展示区
// ==========================================
function PlayArea({ lastPlay, lastPlayNickname, mustBeat }: {
  lastPlay: Play | null; lastPlayNickname: string; mustBeat: boolean;
}) {
  if (!lastPlay) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 80 }}>
        <Text style={{ color: C.goldDim, fontSize: 11, letterSpacing: 4 }}>— 等待出牌 —</Text>
      </View>
    );
  }
  const isBomb = false; // 跑得快无炸弹规则
  return (
    <View style={{ alignItems: 'center', gap: 5, minHeight: 80, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{
          backgroundColor: isBomb ? 'rgba(230,25,44,0.2)' : 'rgba(255,215,0,0.12)',
          borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
          borderWidth: 1, borderColor: isBomb ? C.red : 'rgba(255,215,0,0.4)',
        }}>
          <Text style={{ color: isBomb ? C.red : C.gold, fontSize: 10, fontWeight: '700' }}>
            {lastPlayNickname} · {getTypeName(lastPlay.type)}
          </Text>
        </View>
        {mustBeat && (
          <View style={{
            backgroundColor: 'rgba(230,25,44,0.18)', borderRadius: 10,
            paddingHorizontal: 7, paddingVertical: 2,
            borderWidth: 1, borderColor: C.red,
          }}>
            <Text style={{ color: C.red, fontSize: 9, fontWeight: '700' }}>必须压</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}>
        {lastPlay.cards.map(card => (
          <CardView key={card.id} card={card} small />
        ))}
      </View>
    </View>
  );
}

// ==========================================
// 主游戏页
// ==========================================
export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string; userId: string }>();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<SeatPosition>(0);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [lastPlay, setLastPlay] = useState<Play | null>(null);
  const [lastPlaySeat, setLastPlaySeat] = useState<SeatPosition | null>(null);
  const [currentSeat, setCurrentSeat] = useState<SeatPosition>(0);
  const [countdown, setCountdown] = useState(20);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [gameStateId, setGameStateId] = useState<string | null>(null);
  const [winOrder, setWinOrder] = useState<SeatPosition[]>([]);
  const [phase, setPhase] = useState<'playing' | 'finished'>('playing');
  const [passCount, setPassCount] = useState(0);
  const [antiDumpWarning, setAntiDumpWarning] = useState('');
  const [round, setRound] = useState(1);
  const [gameStartTime] = useState(Date.now());
  const [myBeans, setMyBeans] = useState(0);
  const [emojiMsg, setEmojiMsg] = useState<{ seat: SeatPosition; emoji: string } | null>(null);
  // 飞牌动画
  const [flyCards, setFlyCards] = useState<Card[]>([]);
  const [showFly, setShowFly] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<{ currentSeat: SeatPosition; myHand: Card[]; players: PlayerState[] }>({
    currentSeat: 0, myHand: [], players: [],
  });

  // 桌面光晕动画（轮到自己时脉冲）
  const glowOpacity = useSharedValue(0.06);
  const glowScale = useSharedValue(1);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  // 出牌按钮脉冲（轮到自己时）
  const btnPlayScale = useSharedValue(1);
  const btnPlayStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnPlayScale.value }],
  }));

  useEffect(() => {
    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    const isMyTurnNow = currentSeat === mySeat;
    if (isMyTurnNow) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.08, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 700 }),
          withTiming(1.0, { duration: 700 }),
        ), -1, false,
      );
      btnPlayScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500 }),
          withTiming(1.0, { duration: 500 }),
        ), -1, true,
      );
    } else {
      glowOpacity.value = withTiming(0.06, { duration: 400 });
      glowScale.value = withTiming(1, { duration: 400 });
      btnPlayScale.value = withTiming(1, { duration: 200 });
    }
  }, [currentSeat, mySeat]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    const roomPlayers = await getRoomPlayers(roomId);
    const myRp = roomPlayers.find(rp => rp.user_id === user.id);
    const seat = (myRp?.seat ?? 0) as SeatPosition;
    setMySeat(seat);

    const profiles = await Promise.all(roomPlayers.map(async rp => {
      if (rp.is_ai) return null;
      return rp.user_id ? getProfile(rp.user_id) : null;
    }));

    const myProfile = profiles.find(p => p?.id === user.id);
    if (myProfile) setMyBeans(myProfile.beans ?? 0);

    await loadGameState(roomId, seat, roomPlayers, profiles.filter(Boolean));
    setLoading(false);

    pollRef.current = setInterval(() => {
      loadGameState(roomId, seat, roomPlayers, profiles.filter(Boolean));
    }, 1500);
  };

  const loadGameState = async (
    rId: string, mySeatNum: SeatPosition,
    roomPlayers: RoomPlayer[],
    profilesArr: (Awaited<ReturnType<typeof getProfile>>)[],
  ) => {
    const gs = await getGameState(rId);
    if (!gs) return;

    setGameStateId(gs.id);
    const state = gs.state as Record<string, unknown>;
    const hands = state.hands as Card[][];
    const currentSeatVal = (state.currentSeat ?? gs.current_player_seat) as SeatPosition;
    const lastPlayData = (state.lastPlay ?? gs.last_play) as Play | null;
    const lastPlaySeatVal = (state.lastPlaySeat ?? gs.last_play_seat) as SeatPosition | null;
    const passCountVal = (state.passCount ?? 0) as number;
    const winOrderVal = (state.winOrder ?? []) as SeatPosition[];
    const phaseVal = (state.phase ?? gs.phase) as 'playing' | 'finished';
    const roundVal = (state.round ?? gs.round) as number;

    setCurrentSeat(currentSeatVal);
    setLastPlay(lastPlayData);
    setLastPlaySeat(lastPlaySeatVal);
    setPassCount(passCountVal);
    setWinOrder(winOrderVal);
    setPhase(phaseVal);
    setRound(roundVal);
    stateRef.current.currentSeat = currentSeatVal;

    const newPlayers: PlayerState[] = roomPlayers.map(rp => {
      const prof = profilesArr.find(p => p?.id === rp.user_id);
      const hand = hands[rp.seat] ?? [];
      return {
        seat: rp.seat as SeatPosition,
        userId: rp.user_id,
        nickname: rp.is_ai ? `AI${rp.seat + 1}` : (prof?.nickname ?? '玩家'),
        avatarUrl: prof?.avatar_url ?? null,
        isAI: rp.is_ai,
        aiDifficulty: (rp.ai_difficulty ?? 'medium') as 'easy' | 'medium' | 'hard',
        handCount: hand.length,
        hand: rp.seat === mySeatNum ? hand : undefined,
        hasPassed: false,
        isDisconnected: false,
      };
    });
    setPlayers(newPlayers);
    stateRef.current.players = newPlayers;

    const myHandData = hands[mySeatNum] ?? [];
    setMyHand(sortCards(myHandData));
    stateRef.current.myHand = myHandData;

    if (phaseVal === 'finished') {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      const seatRemaining: Record<SeatPosition, number> = {} as Record<SeatPosition, number>;
      for (const p of newPlayers) seatRemaining[p.seat as SeatPosition] = p.handCount;
      const bigWinner = winOrderVal[0];
      const settlement = calculateSettlement(
        seatRemaining, bigWinner,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.nickname])) as Record<SeatPosition, string>,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.avatarUrl])) as Record<SeatPosition, string | null>,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.userId])) as Record<SeatPosition, string | null>,
      );

      const duration = Math.floor((Date.now() - gameStartTime) / 1000);
      const { data: { user } } = await supabase.auth.getUser();
      const historyPlayers = settlement.results.map(r => ({
        user_id: r.userId ?? '',
        seat: r.seat,
        nickname: r.nickname,
        role: r.role,
        bean_change: r.beanChange,
        remaining_cards: r.remainingCards,
      }));
      await saveGameHistory(rId, roundVal, historyPlayers, { settlement: settlement.results }, duration);
      if (user) {
        const myResult = settlement.results.find(r => r.userId === user.id);
        if (myResult) {
          await updateBeans(user.id, myResult.beanChange);
          await updateGameStats(user.id, ['big_winner', 'small_winner', 'sole_winner'].includes(myResult.role), myResult.role === 'big_winner');
        }
      }
      setTimeout(() => {
        router.replace({
          pathname: '/(app)/settlement',
          params: { roomId: rId, settlementData: JSON.stringify(settlement.results), myUserId: user?.id ?? '' },
        });
      }, 500);
      return;
    }

    if (currentSeatVal !== mySeatNum) {
      const aiPlayer = newPlayers.find(p => p.seat === currentSeatVal && p.isAI);
      if (aiPlayer) {
        setTimeout(() => handleAITurn(rId, currentSeatVal, hands, newPlayers, lastPlayData, passCountVal, winOrderVal, mySeatNum, gs), 1200);
      }
    }

    resetCountdown(currentSeatVal === mySeatNum);
  };

  const resetCountdown = (isMyTurn: boolean) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!isMyTurn) { setCountdown(20); return; }
    setCountdown(20);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          handlePass(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAITurn = async (
    rId: string, aiSeat: SeatPosition, hands: Card[][], allPlayers: PlayerState[],
    currentLastPlay: Play | null, currentPassCount: number, currentWinOrder: SeatPosition[],
    mySeatNum: SeatPosition, gs: GameStateRow,
  ) => {
    const state = gs.state as Record<string, unknown>;
    const aiHand = hands[aiSeat] ?? [];
    const difficulty = (allPlayers.find(p => p.seat === aiSeat)?.aiDifficulty) ?? 'medium';
    const prevSeat = ((aiSeat + 3) % 4) as SeatPosition;
    const prevPlayerCount = (hands[prevSeat] ?? []).length;

    const aiPlay = aiSelectPlay(aiHand, currentLastPlay, difficulty, prevPlayerCount);

    let newHands = [...hands];
    let newWinOrder = [...currentWinOrder];
    let newPassCount = currentPassCount;
    let newLastPlay = currentLastPlay;
    let newLastPlaySeat: SeatPosition | null = aiSeat;
    let newPhase: 'playing' | 'finished' = 'playing';

    if (aiPlay && aiPlay.length > 0) {
      newHands = hands.map((h, idx) => idx === aiSeat ? removeCards(h, aiPlay) : h);
      const play = buildPlay(aiPlay);
      newLastPlay = play;
      newLastPlaySeat = aiSeat;
      newPassCount = 0;

      if (newHands[aiSeat].length === 0) {
        newWinOrder = [...currentWinOrder, aiSeat];
        const remaining = newHands.map(h => h.length);
        if (remaining.filter(r => r > 0).length <= 2) newPhase = 'finished';
      }
    } else {
      newPassCount = currentPassCount + 1;
      if (newPassCount >= 3) {
        newLastPlay = null; newLastPlaySeat = null; newPassCount = 0;
      }
    }

    let nextSeat = ((aiSeat + 1) % 4) as SeatPosition;
    let tries = 0;
    while (newHands[nextSeat].length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    await updateGameState(gs.id, {
      state: {
        ...(state as object),
        hands: newHands, currentSeat: nextSeat,
        lastPlay: newLastPlay, lastPlaySeat: newLastPlaySeat,
        passCount: newPassCount, winOrder: newWinOrder,
        phase: newPhase, turnStartedAt: Date.now(),
      },
      current_player_seat: nextSeat,
      last_play: newLastPlay as unknown as Record<string, unknown>,
      last_play_seat: newLastPlaySeat,
      phase: newPhase,
    });
  };

  const toggleCard = (card: Card) => {
    setErrorMsg('');
    setAntiDumpWarning('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCards(prev => {
      const isSelected = prev.some(c => c.id === card.id);
      return isSelected ? prev.filter(c => c.id !== card.id) : [...prev, card];
    });
  };

  const handleHint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const hint = getHintCards(myHand, lastPlay);
    if (hint) {
      setSelectedCards(hint);
      setErrorMsg('');
    } else {
      setErrorMsg('没有可出的牌，只能过牌');
    }
  };

  const handlePlay = async () => {
    if (selectedCards.length === 0) { setErrorMsg('请选择要出的牌'); return; }
    if (!gameStateId) return;

    const gs = await getGameState(roomId);
    if (!gs) return;
    const state = gs.state as Record<string, unknown>;
    const hands = state.hands as Card[][];
    const currentSeatVal = state.currentSeat as SeatPosition;
    if (currentSeatVal !== mySeat) { setErrorMsg('还没轮到你'); return; }

    const prevSeat = ((mySeat + 3) % 4) as SeatPosition;
    const prevCount = (hands[prevSeat] ?? []).length;

    const validation = validatePlay(
      selectedCards, myHand, lastPlay, prevCount,
      lastPlay === null, round === 1 && winOrder.length === 0,
      myHand.some(c => c.suit === 'diamonds' && c.rank === '3'),
    );

    if (!validation.valid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (validation.reason?.includes('上家')) setAntiDumpWarning(validation.reason);
      else setErrorMsg(validation.reason ?? '出牌无效');
      return;
    }

    const play = buildPlay(selectedCards);
    if (!play) { setErrorMsg('无效牌型'); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // 飞牌动画
    setFlyCards([...selectedCards]);
    setShowFly(true);

    if (countdownRef.current) clearInterval(countdownRef.current);

    const newHands = hands.map((h, idx) => idx === mySeat ? removeCards(h, selectedCards) : h);
    let newWinOrder = [...winOrder];
    let newPhase: 'playing' | 'finished' = phase;

    if (newHands[mySeat].length === 0) {
      newWinOrder = [...winOrder, mySeat];
      if (newHands.map(h => h.length).filter(r => r > 0).length <= 2) newPhase = 'finished';
    }

    let nextSeat = ((mySeat + 1) % 4) as SeatPosition;
    let tries = 0;
    while (newHands[nextSeat].length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    await updateGameState(gs.id, {
      state: {
        ...(state as object),
        hands: newHands, currentSeat: nextSeat,
        lastPlay: play, lastPlaySeat: mySeat,
        passCount: 0, winOrder: newWinOrder,
        phase: newPhase, turnStartedAt: Date.now(),
      },
      current_player_seat: nextSeat,
      last_play: play as unknown as Record<string, unknown>,
      last_play_seat: mySeat,
      phase: newPhase,
    });

    setSelectedCards([]);
    setErrorMsg('');
    setAntiDumpWarning('');
  };

  const handlePass = async (autoPass = false) => {
    if (!gameStateId) return;
    const gs = await getGameState(roomId);
    if (!gs) return;
    const state = gs.state as Record<string, unknown>;
    const hands = state.hands as Card[][];
    const currentSeatVal = state.currentSeat as SeatPosition;
    if (!autoPass && currentSeatVal !== mySeat) return;

    const newPassCount = passCount + 1;
    const reset = newPassCount >= 3;

    let nextSeat = ((mySeat + 1) % 4) as SeatPosition;
    let tries = 0;
    while (hands[nextSeat]?.length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    await updateGameState(gs.id, {
      state: {
        ...(state as object),
        currentSeat: nextSeat,
        lastPlay: reset ? null : lastPlay,
        lastPlaySeat: reset ? null : lastPlaySeat,
        passCount: reset ? 0 : newPassCount,
        turnStartedAt: Date.now(),
      },
      current_player_seat: nextSeat,
      last_play: (reset ? null : lastPlay) as unknown as Record<string, unknown>,
      last_play_seat: reset ? null : lastPlaySeat,
    });

    setSelectedCards([]);
    setErrorMsg('');
    setAntiDumpWarning('');
  };

  const sendEmoji = (emoji: string) => {
    setEmojiMsg({ seat: mySeat, emoji });
    setShowEmoji(false);
    setTimeout(() => setEmojiMsg(null), 2500);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0614' }}>
        <Image source={imgGameBg} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            alignItems: 'center', gap: 18, backgroundColor: 'rgba(12,6,28,0.92)',
            borderRadius: 24, padding: 36,
            borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.45)',
            boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 40, color: 'rgba(255,215,0,0.15)' }],
          }}>
            <Text style={{ fontSize: 42 }}>🃏</Text>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={{ color: C.gold, fontSize: 16, letterSpacing: 4, fontWeight: '800' }}>洗牌发牌中...</Text>
          </View>
        </View>
      </View>
    );
  }

  const isMyTurn = currentSeat === mySeat;
  const prevSeat = ((mySeat + 3) % 4) as SeatPosition;
  const prevPlayer = players.find(p => p.seat === prevSeat);
  const showAntiDumpHint = prevPlayer?.handCount === 1;
  const getRelativeSeat = (s: SeatPosition, offset: number): SeatPosition => ((s + offset) % 4) as SeatPosition;
  const leftSeat = getRelativeSeat(mySeat, 1);
  const topSeat = getRelativeSeat(mySeat, 2);
  const rightSeat = getRelativeSeat(mySeat, 3);
  const leftPlayer = players.find(p => p.seat === leftSeat);
  const topPlayer = players.find(p => p.seat === topSeat);
  const rightPlayer = players.find(p => p.seat === rightSeat);
  const myPlayer = players.find(p => p.seat === mySeat);
  const lastPlayPlayer = lastPlaySeat !== null ? players.find(p => p.seat === lastPlaySeat) : null;

  // 弧形手牌计算（极坐标，每张牌轻微旋转）
  const getCardArcOffset = (idx: number, total: number) => {
    const center = (total - 1) / 2;
    const dist = idx - center;
    return Math.abs(dist) * 2.8;
  };
  const getCardRotation = (idx: number, total: number) => {
    if (total <= 1) return 0;
    const center = (total - 1) / 2;
    return (idx - center) * 1.8;
  };
  const cardOverlap = myHand.length > 11 ? -12 : myHand.length > 8 ? -6 : 2;

  const hasDiamond3 = myHand.some(c => c.suit === 'diamonds' && c.rank === '3');
  const isFirstPlay = round === 1 && winOrder.length === 0 && lastPlay === null;
  const myRank = getRankLabel(myBeans);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0614' }}>
      <StatusBar style="light" hidden />

      {/* 全屏背景图 */}
      <Image source={imgGameBg} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
      <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

      {/* 炸弹特效层 */}
      <BombEffect visible={false} />

      {/* 飞牌动画层 */}
      <FlyingCards
        cards={flyCards}
        visible={showFly}
        onDone={() => { setShowFly(false); setFlyCards([]); }}
      />

      {/* 表情浮现层 */}
      {emojiMsg && (
        <View style={{ position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center', zIndex: 500, pointerEvents: 'none' }}>
          <Text style={{ fontSize: 60 }}>{emojiMsg.emoji}</Text>
        </View>
      )}

      {/* ══════ 顶部信息栏 ══════ */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 5,
        backgroundColor: C.barBg,
        borderBottomWidth: 1.5, borderBottomColor: C.barBorder,
      }}>
        {/* 离开 */}
        <Pressable
          cssInterop={false}
          onPress={() => router.back()}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: pressed ? 'rgba(180,130,30,0.35)' : 'rgba(180,130,30,0.15)',
            borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5,
            borderWidth: 1, borderColor: 'rgba(180,130,30,0.45)',
          })}>
          <Text style={{ color: '#c8a050', fontSize: 12 }}>← 离开</Text>
        </Pressable>

        {/* 中央：局数+提示 */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{
            backgroundColor: 'rgba(255,215,0,0.13)', borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 4,
            borderWidth: 1, borderColor: 'rgba(255,215,0,0.5)',
          }}>
            <Text style={{ color: C.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>第 {round} 局</Text>
          </View>
          {isFirstPlay && hasDiamond3 && (
            <View style={{
              backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 10,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: C.gold,
            }}>
              <Text style={{ color: C.gold, fontSize: 10, fontWeight: '700' }}>♦3 先手</Text>
            </View>
          )}
          {showAntiDumpHint && (
            <View style={{
              backgroundColor: 'rgba(230,25,44,0.2)', borderRadius: 10,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: C.red,
            }}>
              <Text style={{ color: C.red, fontSize: 10, fontWeight: '700' }}>
                ⚠ {prevPlayer?.nickname} 最后1张
              </Text>
            </View>
          )}
          {(errorMsg || antiDumpWarning) && (
            <View style={{
              backgroundColor: 'rgba(230,25,44,0.18)', borderRadius: 10,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: C.red,
            }}>
              <Text style={{ color: C.red, fontSize: 10, fontWeight: '600' }}>
                {antiDumpWarning || errorMsg}
              </Text>
            </View>
          )}
        </View>

        {/* 右侧：豆数+段位+倒计时+表情 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            alignItems: 'center',
            backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 4,
            borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)',
          }}>
            <Text style={{ color: C.gold, fontSize: 11, fontWeight: '800' }}>🪙 {myBeans}</Text>
            <Text style={{ color: myRank.color, fontSize: 9, fontWeight: '700' }}>{myRank.label}</Text>
          </View>
          {isMyTurn && <CountdownRing countdown={countdown} />}
          <Pressable
            cssInterop={false}
            onPress={() => setShowEmoji(true)}
            style={({ pressed }) => ({
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: pressed ? 'rgba(140,100,20,0.3)' : 'rgba(140,100,20,0.15)',
              borderWidth: 1, borderColor: 'rgba(140,100,20,0.45)',
              alignItems: 'center', justifyContent: 'center',
            })}>
            <Text style={{ fontSize: 16 }}>😊</Text>
          </Pressable>
        </View>
      </View>

      {/* ══════ 主牌桌区 ══════ */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* 左侧玩家 */}
        <View style={{ width: 94, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 }}>
          {leftPlayer ? (
            <>
              <SidePlayerCard player={leftPlayer} isCurrentTurn={currentSeat === leftSeat} countdown={currentSeat === leftSeat ? countdown : 0} />
              <SideOpponentCards count={leftPlayer.handCount} />
            </>
          ) : (
            <View style={{
              width: 74, height: 100, borderRadius: 12,
              backgroundColor: 'rgba(8,4,20,0.4)',
              borderWidth: 1, borderStyle: 'dashed', borderColor: C.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: C.goldDim, fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

        {/* 中央纵轴 */}
        <View style={{ flex: 1, flexDirection: 'column' }}>

          {/* 对家区 */}
          <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4, gap: 4 }}>
            {topPlayer ? (
              <>
                <TopPlayerBar player={topPlayer} isCurrentTurn={currentSeat === topSeat} countdown={currentSeat === topSeat ? countdown : 0} />
                <TopOpponentCards count={topPlayer.handCount} />
              </>
            ) : (
              <View style={{
                height: 28, paddingHorizontal: 20, borderRadius: 14,
                backgroundColor: 'rgba(8,4,20,0.4)',
                borderWidth: 1, borderStyle: 'dashed', borderColor: C.cardBorder,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: C.goldDim, fontSize: 10 }}>等待玩家</Text>
              </View>
            )}
          </View>

          {/* 圆形牌桌 */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={[{
              width: 220, height: 220, borderRadius: 110,
              backgroundColor: C.tableBg,
              alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 7, color: C.tableRim },
                { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 12, color: '#2a1a06' },
                { offsetX: 0, offsetY: 0, blurRadius: 35, color: 'rgba(30,110,50,0.5)' },
                { offsetX: 0, offsetY: 14, blurRadius: 28, color: 'rgba(0,0,0,0.75)' },
              ],
            }, glowStyle]}>
              {/* 桌布纹理：放射线 */}
              {Array.from({ length: 16 }).map((_, i) => (
                <View key={`r${i}`} style={{
                  position: 'absolute', width: 1.5, height: 110,
                  top: 0, left: 109,
                  transformOrigin: 'bottom center',
                  transform: [{ rotate: `${i * 22.5}deg` }],
                  backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)',
                }} />
              ))}
              {/* 同心圆装饰 */}
              {[88, 70, 50, 30].map((r, i) => (
                <View key={`ring${i}`} style={{
                  position: 'absolute', width: r * 2, height: r * 2, borderRadius: r,
                  borderWidth: 1,
                  borderColor: `rgba(200,144,30,${0.15 + i * 0.05})`,
                }} />
              ))}
              {/* 中央徽章 */}
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: 'rgba(200,144,30,0.15)',
                borderWidth: 1.5, borderColor: 'rgba(255,200,50,0.6)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 19, color: 'rgba(255,215,0,0.85)' }}>♠</Text>
              </View>
              {/* 出牌内容 */}
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                <PlayArea
                  lastPlay={lastPlay}
                  lastPlayNickname={lastPlayPlayer?.nickname ?? ''}
                  mustBeat={lastPlay !== null && lastPlaySeat !== mySeat}
                />
              </View>
            </Animated.View>
          </View>

          {/* ══════ 底部操作区 ══════ */}
          <View style={{
            backgroundColor: C.barBg,
            borderTopWidth: 1.5, borderTopColor: C.barBorder,
            paddingTop: 6, paddingBottom: 8, paddingHorizontal: 10,
          }}>
            {/* 我的信息条 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PlayerAvatar
                  player={myPlayer ?? { seat: mySeat, userId: null, nickname: '我', handCount: 0, isAI: false, avatarUrl: null, hasPassed: false, isDisconnected: false }}
                  isCurrentTurn={isMyTurn} size={28}
                />
                <Text style={{ color: isMyTurn ? C.gold : C.white, fontSize: 11, fontWeight: '800' }}>
                  {myPlayer?.nickname ?? '我'}
                </Text>
                {isMyTurn && (
                  <View style={{
                    backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: 8,
                    paddingHorizontal: 7, paddingVertical: 2,
                    borderWidth: 1, borderColor: C.gold,
                  }}>
                    <Text style={{ color: C.gold, fontSize: 10, fontWeight: '700' }}>我的回合</Text>
                  </View>
                )}
              </View>
              <Pressable
                cssInterop={false}
                onPress={() => setShowEmoji(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: pressed ? 'rgba(140,100,20,0.3)' : 'rgba(140,100,20,0.12)',
                  borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth: 1, borderColor: 'rgba(140,100,20,0.4)',
                })}>
                <Text style={{ color: '#c8a050', fontSize: 11 }}>😂 表情</Text>
              </Pressable>
            </View>

            {/* 弧形手牌 + 操作按钮 */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              {/* 弧形手牌区 */}
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'flex-end', paddingHorizontal: 8, paddingBottom: 4 }}
                style={{ flex: 1, height: 104 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  {myHand.map((card, idx) => (
                    <View key={card.id} style={{
                      marginLeft: idx === 0 ? 0 : cardOverlap,
                      marginBottom: getCardArcOffset(idx, myHand.length),
                    }}>
                      <CardView
                        card={card}
                        selected={selectedCards.some(c => c.id === card.id)}
                        onPress={() => isMyTurn ? toggleCard(card) : undefined}
                        rotationDeg={getCardRotation(idx, myHand.length)}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* 按钮组：提示 + 过牌 + 出牌 */}
              <View style={{ gap: 6, width: 90, paddingBottom: 4 }}>
                {/* 出牌 */}
                <Animated.View style={btnPlayStyle}>
                  <Pressable
                    cssInterop={false}
                    onPress={handlePlay}
                    disabled={!isMyTurn || selectedCards.length === 0}
                    style={({ pressed }) => {
                      const enabled = isMyTurn && selectedCards.length > 0;
                      return {
                        height: 48, borderRadius: 24,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: !enabled
                          ? 'rgba(255,255,255,0.05)'
                          : pressed ? '#0e8830' : C.btnPlay,
                        borderWidth: 2,
                        borderColor: enabled ? '#3de860' : 'rgba(255,255,255,0.1)',
                        boxShadow: enabled
                          ? [
                            { offsetX: 0, offsetY: 6, blurRadius: 18, color: 'rgba(30,180,60,0.7)' },
                            { offsetX: 0, offsetY: 0, blurRadius: 10, color: 'rgba(30,180,60,0.4)' },
                          ]
                          : [],
                      };
                    }}>
                    <Text style={{
                      fontWeight: '900', fontSize: 18, letterSpacing: 4,
                      color: (!isMyTurn || selectedCards.length === 0) ? 'rgba(255,255,255,0.2)' : '#FFFFFF',
                    }}>出牌</Text>
                  </Pressable>
                </Animated.View>

                {/* 过牌 */}
                <Pressable
                  cssInterop={false}
                  onPress={() => handlePass()}
                  disabled={!isMyTurn || lastPlay === null}
                  style={({ pressed }) => {
                    const enabled = isMyTurn && lastPlay !== null;
                    return {
                      height: 38, borderRadius: 19,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pressed ? 'rgba(255,255,255,0.1)' : C.btnPass,
                      borderWidth: 1.5,
                      borderColor: enabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)',
                    };
                  }}>
                  <Text style={{
                    fontSize: 14, letterSpacing: 3, fontWeight: '700',
                    color: (!isMyTurn || !lastPlay) ? 'rgba(255,255,255,0.15)' : C.white,
                  }}>过牌</Text>
                </Pressable>

                {/* 提示 */}
                <Pressable
                  cssInterop={false}
                  onPress={handleHint}
                  disabled={!isMyTurn}
                  style={({ pressed }) => ({
                    height: 34, borderRadius: 17,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: !isMyTurn
                      ? 'rgba(255,255,255,0.03)'
                      : pressed ? '#a06808' : 'rgba(200,130,10,0.22)',
                    borderWidth: 1.5,
                    borderColor: isMyTurn ? 'rgba(200,150,30,0.65)' : 'rgba(255,255,255,0.07)',
                  })}>
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: !isMyTurn ? 'rgba(255,255,255,0.15)' : C.gold,
                  }}>💡 提示</Text>
                </Pressable>
              </View>
            </View>
          </View>

        </View>

        {/* 右侧玩家 */}
        <View style={{ width: 94, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 }}>
          {rightPlayer ? (
            <>
              <SidePlayerCard player={rightPlayer} isCurrentTurn={currentSeat === rightSeat} countdown={currentSeat === rightSeat ? countdown : 0} />
              <SideOpponentCards count={rightPlayer.handCount} />
            </>
          ) : (
            <View style={{
              width: 74, height: 100, borderRadius: 12,
              backgroundColor: 'rgba(8,4,20,0.4)',
              borderWidth: 1, borderStyle: 'dashed', borderColor: C.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: C.goldDim, fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

      </View>

      {/* 表情 Modal */}
      <Modal visible={showEmoji} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} onPress={() => setShowEmoji(false)}>
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: 20, paddingBottom: 30,
            backgroundColor: 'rgba(10,4,22,0.95)',
            borderTopWidth: 2, borderColor: C.tableRim,
            boxShadow: [{ offsetX: 0, offsetY: -6, blurRadius: 24, color: 'rgba(140,100,20,0.22)' }],
          }}>
            <Text style={{
              color: C.gold, textAlign: 'center', fontWeight: '800',
              fontSize: 14, letterSpacing: 3, marginBottom: 16,
            }}>发送表情</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }}>
              {EMOJIS.map(emoji => (
                <Pressable key={emoji} onPress={() => sendEmoji(emoji)} style={{
                  width: 56, height: 56, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(255,215,0,0.08)',
                  borderWidth: 1, borderColor: 'rgba(140,100,20,0.4)',
                }}>
                  <Text style={{ fontSize: 30 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
