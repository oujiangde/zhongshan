/**
 * 游戏核心页面 - 横屏4人牌桌（精品手游风格）
 * 座位布局：0=底部(自己), 1=左, 2=上, 3=右
 */
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  withSequence, withRepeat, Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/client/supabase';
import { getGameState, updateGameState, saveGameHistory, updateBeans, updateGameStats, getRoomPlayers, getProfile } from '@/db/api';
import {
  sortCards, buildPlay, validatePlay, removeCards, aiSelectPlay, getTypeName,
  calculateSettlement, RANK_VALUES,
} from '@/utils/gameLogic';
import type { Card, Play, SeatPosition, PlayerState } from '@/types/game';
import type { GameStateRow, RoomPlayer } from '@/types/db';

// ─── 资源 URL ───────────────────────────────────────────────
// 主题色
const THEME = {
  bg: '#0d1b3e',          // 深蓝背景
  bgCard: '#111f4a',      // 卡片背景
  gold: '#D4AF37',        // 鎏金
  goldDim: 'rgba(212,175,55,0.3)',
  red: '#E63946',         // 朱砂红
  white: '#FFFFFF',
  dim: '#A09DA6',
  border: 'rgba(212,175,55,0.25)',
  tableBg: '#0a1628',     // 出牌桌面
};

// 花色颜色
const SUIT_COLORS: Record<string, string> = {
  spades: '#1A1A1A',
  clubs: '#1A1A1A',
  hearts: '#C9372C',
  diamonds: '#C9372C',
};
const SUIT_SYMBOLS: Record<string, string> = { spades: '♠', clubs: '♣', hearts: '♥', diamonds: '♦' };
const RANK_DISPLAY: Record<string, string> = {
  '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A', '2': '2',
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
};
const EMOJIS = ['👍', '😄', '😅', '😮', '🤔', '👏', '💪', '😎'];

// ==========================================
// 扑克牌组件 — 精品金边 + 弹性选中动画
// ==========================================
function CardView({
  card,
  selected,
  onPress,
  small,
  faceDown,
}: {
  card: Card;
  selected?: boolean;
  onPress?: () => void;
  small?: boolean;
  faceDown?: boolean;
}) {
  const w = small ? 28 : 46;
  const h = small ? 40 : 66;
  const fs = small ? 10 : 16;

  // 动画共享值
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  // selected 变化时触发弹性动画
  useEffect(() => {
    if (selected) {
      // 选中：先快速上弹 + 放大，再弹性稳定
      translateY.value = withSpring(-18, { damping: 10, stiffness: 260, mass: 0.6 });
      scale.value = withSequence(
        withSpring(1.12, { damping: 8, stiffness: 300 }),
        withSpring(1.05, { damping: 12, stiffness: 200 }),
      );
    } else {
      // 取消：弹回原位
      translateY.value = withSpring(0, { damping: 12, stiffness: 220 });
      scale.value = withSpring(1, { damping: 12, stiffness: 220 });
    }
  }, [selected]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  // 背面：深绿金纹路
  if (faceDown) {
    return (
      <View style={{
        width: w, height: h, borderRadius: 6,
        backgroundColor: '#0c3320',
        borderWidth: 1.5, borderColor: '#4a8a5a',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 5, color: 'rgba(0,0,0,0.7)' }],
      }}>
        <View style={{
          position: 'absolute', inset: 3,
          borderRadius: 3, borderWidth: 1,
          borderColor: 'rgba(255,215,0,0.25)',
        }} />
        <Text style={{ fontSize: small ? 9 : 13, opacity: 0.4, color: '#FFD700' }}>✦</Text>
      </View>
    );
  }

  const color = SUIT_COLORS[card.suit];
  const suit = SUIT_SYMBOLS[card.suit];
  const rank = RANK_DISPLAY[card.rank];

  return (
    <Animated.View style={animStyle}>
      <Pressable onPress={onPress}
        style={{
          width: w, height: h,
          backgroundColor: selected ? '#fffce8' : '#ffffff',
          borderRadius: 6,
          borderWidth: selected ? 2.5 : 1.5,
          borderColor: selected ? '#FFD700' : '#d4c070',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: selected
            ? [
              { offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(255,215,0,0.9)' },
              { offsetX: 0, offsetY: 6, blurRadius: 12, color: 'rgba(0,0,0,0.5)' },
            ]
            : [{ offsetX: 0, offsetY: 2, blurRadius: 5, color: 'rgba(0,0,0,0.55)' }],
        }}>
        {/* 左上角点数花色 */}
        <Text style={{
          position: 'absolute', top: small ? 2 : 3, left: small ? 3 : 4,
          color, fontSize: small ? 8 : 12, fontWeight: '900', lineHeight: small ? 9 : 13,
        }}>{rank}</Text>
        <Text style={{
          position: 'absolute', top: small ? 10 : 14, left: small ? 3 : 4,
          color, fontSize: small ? 7 : 10, lineHeight: small ? 8 : 11,
        }}>{suit}</Text>
        {/* 中央大花色 */}
        <Text style={{ color, fontSize: fs, fontWeight: '700' }}>{suit}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ==========================================
// 对手竖向叠牌（左右两侧）
// ==========================================
function SideOpponentCards({ count }: { count: number }) {
  const total = Math.min(count, 10);
  return (
    <View style={{ alignItems: 'center', height: 44 + (total - 1) * 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 8 }}>
          <CardView card={{ id: `b${i}`, suit: 'spades', rank: '3', value: 0 }} small faceDown />
        </View>
      ))}
    </View>
  );
}

// ==========================================
// 上方对手横向叠牌
// ==========================================
function TopOpponentCards({ count }: { count: number }) {
  const total = Math.min(count, 13);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -16 }}>
          <CardView card={{ id: `tb${i}`, suit: 'spades', rank: '3', value: 0 }} small faceDown />
        </View>
      ))}
    </View>
  );
}

// ==========================================
// 玩家头像框（统一样式）
// ==========================================
function PlayerAvatar({
  player, isCurrentTurn, size = 44,
}: { player: PlayerState; isCurrentTurn: boolean; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2, overflow: 'hidden',
      borderColor: isCurrentTurn ? THEME.gold : 'rgba(212,175,55,0.3)',
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(212,175,55,0.7)' }]
        : [],
    }}>
      {player.avatarUrl ? (
        <Image source={{ uri: player.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <View style={{ flex: 1, backgroundColor: THEME.bgCard, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.48 }}>{player.isAI ? '🤖' : '👤'}</Text>
        </View>
      )}
    </View>
  );
}

// ==========================================
// 倒计时环（当前行动玩家用）
// ==========================================
function CountdownBadge({ countdown, urgent }: { countdown: number; urgent: boolean }) {
  return (
    <View style={{
      minWidth: 32, height: 20, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 6,
      backgroundColor: urgent ? 'rgba(230,57,70,0.25)' : 'rgba(212,175,55,0.15)',
      borderWidth: 1,
      borderColor: urgent ? THEME.red : THEME.gold,
    }}>
      <Text style={{
        color: urgent ? THEME.red : THEME.gold,
        fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'],
      }}>{countdown}s</Text>
    </View>
  );
}

// ==========================================
// 左右对手玩家卡片（竖排）
// ==========================================
function SidePlayerCard({ player, isCurrentTurn, countdown }: {
  player: PlayerState; isCurrentTurn: boolean; countdown: number;
}) {
  return (
    <View style={{
      width: 72, borderRadius: 10,
      backgroundColor: THEME.bgCard,
      borderWidth: isCurrentTurn ? 1.5 : 1,
      borderColor: isCurrentTurn ? THEME.gold : THEME.border,
      alignItems: 'center', paddingVertical: 8, gap: 5,
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(212,175,55,0.45)' }]
        : [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.6)' }],
    }}>
      <PlayerAvatar player={player} isCurrentTurn={isCurrentTurn} size={40} />
      <Text style={{
        color: isCurrentTurn ? THEME.gold : THEME.white,
        fontSize: 10, fontWeight: '700',
      }} numberOfLines={1}>{player.nickname}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <View style={{
          backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
          paddingHorizontal: 6, paddingVertical: 1,
        }}>
          <Text style={{ color: THEME.dim, fontSize: 10 }}>{player.handCount}张</Text>
        </View>
        {isCurrentTurn && countdown > 0 && (
          <CountdownBadge countdown={countdown} urgent={countdown <= 5} />
        )}
      </View>
      {player.hasPassed && (
        <Text style={{ color: THEME.dim, fontSize: 9 }}>PASS</Text>
      )}
    </View>
  );
}

// ==========================================
// 上方对家信息条（横排）
// ==========================================
function TopPlayerBar({ player, isCurrentTurn, countdown }: {
  player: PlayerState; isCurrentTurn: boolean; countdown: number;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: isCurrentTurn ? 'rgba(212,175,55,0.1)' : 'rgba(13,27,62,0.9)',
      borderRadius: 22, paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: isCurrentTurn ? 1.5 : 1,
      borderColor: isCurrentTurn ? THEME.gold : THEME.border,
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(212,175,55,0.4)' }]
        : [],
    }}>
      <PlayerAvatar player={player} isCurrentTurn={isCurrentTurn} size={28} />
      <Text style={{
        color: isCurrentTurn ? THEME.gold : THEME.white,
        fontSize: 11, fontWeight: '700',
      }}>{player.nickname}</Text>
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6,
        paddingHorizontal: 6, paddingVertical: 1,
      }}>
        <Text style={{ color: THEME.dim, fontSize: 10 }}>{player.handCount}张</Text>
      </View>
      {isCurrentTurn && countdown > 0 && (
        <CountdownBadge countdown={countdown} urgent={countdown <= 5} />
      )}
    </View>
  );
}

// ==========================================
// 中央出牌展示区
// ==========================================
function PlayArea({
  lastPlay, lastPlayNickname, mustBeat,
}: { lastPlay: Play | null; lastPlayNickname: string; mustBeat: boolean }) {
  if (!lastPlay) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 90 }}>
        <Text style={{ color: THEME.goldDim, fontSize: 12, letterSpacing: 3 }}>— 等待出牌 —</Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', gap: 6, minHeight: 90, justifyContent: 'center' }}>
      {/* 出牌玩家 + 牌型 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{
          backgroundColor: 'rgba(212,175,55,0.12)', borderRadius: 10,
          paddingHorizontal: 8, paddingVertical: 2,
          borderWidth: 1, borderColor: THEME.goldDim,
        }}>
          <Text style={{ color: THEME.gold, fontSize: 10, fontWeight: '700' }}>
            {lastPlayNickname} · {getTypeName(lastPlay.type)}
          </Text>
        </View>
        {/* 必须压提示 */}
        {mustBeat && (
          <View style={{
            backgroundColor: 'rgba(230,57,70,0.2)', borderRadius: 10,
            paddingHorizontal: 8, paddingVertical: 2,
            borderWidth: 1, borderColor: THEME.red,
          }}>
            <Text style={{ color: THEME.red, fontSize: 10, fontWeight: '700' }}>必须压</Text>
          </View>
        )}
      </View>
      {/* 牌面 */}
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
  const { roomId, userId: paramUserId } = useLocalSearchParams<{ roomId: string; userId: string }>();
  const router = useRouter();

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
  const [myPlayCount, setMyPlayCount] = useState(0);
  const [myBeans, setMyBeans] = useState(0);
  const [emojiMsg, setEmojiMsg] = useState<{ seat: SeatPosition; emoji: string } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<{ currentSeat: SeatPosition; myHand: Card[]; players: PlayerState[] }>({
    currentSeat: 0,
    myHand: [],
    players: [],
  });

  // ── 桌面光晕动画（必须在所有条件 return 之前声明）──
  const glowOpacity = useSharedValue(0.06);
  const glowScale = useSharedValue(1);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  useEffect(() => {
    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);    };
  }, []);

  // 桌面光晕脉冲动画：轮到自己时循环呼吸发光
  useEffect(() => {
    const isMyTurnNow = currentSeat === mySeat;
    if (isMyTurnNow) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.28, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.08, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
    } else {
      glowOpacity.value = withTiming(0.06, { duration: 400 });
      glowScale.value = withTiming(1, { duration: 400 });
    }
  }, [currentSeat, mySeat]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);

    // 获取我的座位
    const roomPlayers = await getRoomPlayers(roomId);
    const myRp = roomPlayers.find(rp => rp.user_id === user.id);
    const seat = (myRp?.seat ?? 0) as SeatPosition;
    setMySeat(seat);

    // 加载profile
    const profiles = await Promise.all(roomPlayers.map(async rp => {
      if (rp.is_ai) return null;
      return rp.user_id ? getProfile(rp.user_id) : null;
    }));

    // 设置自己的豆数
    const myProfile = profiles.find(p => p?.id === user.id);
    if (myProfile) setMyBeans(myProfile.beans ?? 0);

    await loadGameState(roomId, seat, roomPlayers, profiles.filter(Boolean));
    setLoading(false);

    // 开始轮询
    pollRef.current = setInterval(() => {
      loadGameState(roomId, seat, roomPlayers, profiles.filter(Boolean));
    }, 1500);
  };

  const loadGameState = async (
    rId: string,
    mySeatNum: SeatPosition,
    roomPlayers: RoomPlayer[],
    profilesArr: (Awaited<ReturnType<typeof getProfile>>)[]
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

    // 构建玩家状态
    const newPlayers: PlayerState[] = roomPlayers.map(rp => {
      const prof = profilesArr.find(p => p?.id === rp.user_id);
      const hand = hands[rp.seat] ?? [];
      return {
        seat: rp.seat as SeatPosition,
        userId: rp.user_id,
        nickname: rp.is_ai ? `AI${rp.seat + 1}(${rp.ai_difficulty})` : (prof?.nickname ?? '玩家'),
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

    // 更新我的手牌
    const myHandData = hands[mySeatNum] ?? [];
    setMyHand(sortCards(myHandData));
    stateRef.current.myHand = myHandData;

    // 游戏结束
    if (phaseVal === 'finished') {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      // 计算结算
      const seatRemaining: Record<SeatPosition, number> = {} as Record<SeatPosition, number>;
      for (const p of newPlayers) {
        seatRemaining[p.seat as SeatPosition] = p.handCount;
      }
      const bigWinner = winOrderVal[0];
      const settlement = calculateSettlement(
        seatRemaining, bigWinner,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.nickname])) as Record<SeatPosition, string>,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.avatarUrl])) as Record<SeatPosition, string | null>,
        Object.fromEntries(newPlayers.map(p => [p.seat, p.userId])) as Record<SeatPosition, string | null>,
      );

      // 保存历史
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

      // 更新豆子和战绩
      if (user) {
        const myResult = settlement.results.find(r => r.userId === user.id);
        if (myResult) {
          await updateBeans(user.id, myResult.beanChange);
          await updateGameStats(user.id, ['big_winner', 'small_winner', 'sole_winner'].includes(myResult.role), myResult.role === 'big_winner');
        }
      }

      // 跳转结算页
      setTimeout(() => {
        router.replace({
          pathname: '/(app)/settlement',
          params: {
            roomId: rId,
            settlementData: JSON.stringify(settlement.results),
            myUserId: user?.id ?? '',
          },
        });
      }, 500);
      return;
    }

    // AI出牌
    if (currentSeatVal !== mySeatNum) {
      const aiPlayer = newPlayers.find(p => p.seat === currentSeatVal && p.isAI);
      if (aiPlayer) {
        setTimeout(() => handleAITurn(rId, currentSeatVal, hands, newPlayers, lastPlayData, passCountVal, winOrderVal, mySeatNum, gs), 1200);
      }
    }

    // 重置倒计时
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
          // 超时自动过牌
          handlePass(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // AI出牌逻辑
  const handleAITurn = async (
    rId: string,
    aiSeat: SeatPosition,
    hands: Card[][],
    allPlayers: PlayerState[],
    currentLastPlay: Play | null,
    currentPassCount: number,
    currentWinOrder: SeatPosition[],
    mySeatNum: SeatPosition,
    gs: GameStateRow,
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
      // 出牌
      newHands = hands.map((h, idx) => idx === aiSeat ? removeCards(h, aiPlay) : h);
      const play = buildPlay(aiPlay);
      newLastPlay = play;
      newLastPlaySeat = aiSeat;
      newPassCount = 0;

      if (newHands[aiSeat].length === 0) {
        newWinOrder = [...currentWinOrder, aiSeat];
        if (newWinOrder.length >= 1) {
          // 检查游戏是否结束
          const remaining = newHands.map(h => h.length);
          const activePlayers = remaining.filter(r => r > 0);
          if (activePlayers.length <= 2) newPhase = 'finished';
        }
      }
    } else {
      // 过牌
      newPassCount = currentPassCount + 1;
      if (newPassCount >= 3) {
        // 所有人都过，重置
        newLastPlay = null;
        newLastPlaySeat = null;
        newPassCount = 0;
      }
    }

    // 下一个玩家
    let nextSeat = ((aiSeat + 1) % 4) as SeatPosition;
    // 跳过已出完的玩家
    let tries = 0;
    while (newHands[nextSeat].length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    const newState = {
      ...(state as object),
      hands: newHands,
      currentSeat: nextSeat,
      lastPlay: newLastPlay,
      lastPlaySeat: newLastPlaySeat,
      passCount: newPassCount,
      winOrder: newWinOrder,
      phase: newPhase,
      turnStartedAt: Date.now(),
    };

    await updateGameState(gs.id, {
      state: newState,
      current_player_seat: nextSeat,
      last_play: newLastPlay as unknown as Record<string, unknown>,
      last_play_seat: newLastPlaySeat,
      phase: newPhase,
    });
  };

  const toggleCard = (card: Card) => {
    setErrorMsg('');
    setAntiDumpWarning('');
    // 轻触觉反馈：选牌时轻震
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCards(prev => {
      const isSelected = prev.some(c => c.id === card.id);
      if (isSelected) return prev.filter(c => c.id !== card.id);
      return [...prev, card];
    });
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
      myHand.some(c => c.suit === 'diamonds' && c.rank === '3')
    );

    if (!validation.valid) {
      // 出牌失败：中度震动提示
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (validation.reason?.includes('上家')) {
        setAntiDumpWarning(validation.reason);
      } else {
        setErrorMsg(validation.reason ?? '出牌无效');
      }
      return;
    }

    const play = buildPlay(selectedCards);
    if (!play) { setErrorMsg('无效牌型'); return; }

    // 出牌成功：重击震动
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (countdownRef.current) clearInterval(countdownRef.current);

    const newHands = hands.map((h, idx) => idx === mySeat ? removeCards(h, selectedCards) : h);
    let newWinOrder = [...winOrder];
    let newPhase: 'playing' | 'finished' = phase;

    if (newHands[mySeat].length === 0) {
      newWinOrder = [...winOrder, mySeat];
      const remaining = newHands.map(h => h.length);
      const activePlayers = remaining.filter(r => r > 0);
      if (activePlayers.length <= 2) newPhase = 'finished';
    }

    let nextSeat = ((mySeat + 1) % 4) as SeatPosition;
    let tries = 0;
    while (newHands[nextSeat].length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    const newState = {
      ...(state as object),
      hands: newHands,
      currentSeat: nextSeat,
      lastPlay: play,
      lastPlaySeat: mySeat,
      passCount: 0,
      winOrder: newWinOrder,
      phase: newPhase,
      turnStartedAt: Date.now(),
    };

    await updateGameState(gs.id, {
      state: newState,
      current_player_seat: nextSeat,
      last_play: play as unknown as Record<string, unknown>,
      last_play_seat: mySeat,
      phase: newPhase,
    });

    setMyPlayCount(prev => prev + 1);
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
    let newLastPlay = lastPlay;
    let newLastPlaySeat = lastPlaySeat;

    if (newPassCount >= 3) {
      newLastPlay = null;
      newLastPlaySeat = null;
    }

    let nextSeat = ((mySeat + 1) % 4) as SeatPosition;
    let tries = 0;
    while (hands[nextSeat]?.length === 0 && tries < 4) {
      nextSeat = ((nextSeat + 1) % 4) as SeatPosition;
      tries++;
    }

    const newState = {
      ...(state as object),
      currentSeat: nextSeat,
      lastPlay: newPassCount >= 3 ? null : newLastPlay,
      lastPlaySeat: newPassCount >= 3 ? null : newLastPlaySeat,
      passCount: newPassCount >= 3 ? 0 : newPassCount,
      turnStartedAt: Date.now(),
    };

    await updateGameState(gs.id, {
      state: newState,
      current_player_seat: nextSeat,
      last_play: (newPassCount >= 3 ? null : newLastPlay) as unknown as Record<string, unknown>,
      last_play_seat: newPassCount >= 3 ? null : newLastPlaySeat,
    });

    setSelectedCards([]);
    setErrorMsg('');
    setAntiDumpWarning('');
  };

  const sendEmoji = (emoji: string) => {
    setEmojiMsg({ seat: mySeat, emoji });
    setShowEmoji(false);
    setTimeout(() => setEmojiMsg(null), 2000);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.bg }}>
        <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.4)' }} />
        {/* 金边加载卡片 */}
        <View style={{
          alignItems: 'center', gap: 16,
          backgroundColor: 'rgba(6,20,10,0.9)',
          borderRadius: 20, padding: 32,
          borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.4)',
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(255,215,0,0.15)' }],
        }}>
          <Text style={{ fontSize: 36 }}>🃏</Text>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={{
            color: '#FFD700', fontSize: 15, letterSpacing: 3, fontWeight: '700',
            textShadowColor: 'rgba(255,215,0,0.4)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
          }}>洗牌发牌中...</Text>
        </View>
      </View>
    );
  }

  const isMyTurn = currentSeat === mySeat;
  const prevSeat = ((mySeat + 3) % 4) as SeatPosition;
  const prevPlayer = players.find(p => p.seat === prevSeat);
  const showAntiDumpHint = prevPlayer?.handCount === 1;

  const getRelativeSeat = (mySeatNum: SeatPosition, offset: number): SeatPosition =>
    ((mySeatNum + offset) % 4) as SeatPosition;

  const leftSeat = getRelativeSeat(mySeat, 1);
  const topSeat = getRelativeSeat(mySeat, 2);
  const rightSeat = getRelativeSeat(mySeat, 3);

  const leftPlayer = players.find(p => p.seat === leftSeat);
  const topPlayer = players.find(p => p.seat === topSeat);
  const rightPlayer = players.find(p => p.seat === rightSeat);
  const myPlayer = players.find(p => p.seat === mySeat);

  const lastPlayPlayer = lastPlaySeat !== null ? players.find(p => p.seat === lastPlaySeat) : null;

  // 手牌弧形偏移：每张牌根据位置计算轻微Y轴偏移，模拟弧形扇面
  const getCardArcOffset = (idx: number, total: number) => {
    const center = (total - 1) / 2;
    const dist = idx - center;
    return Math.abs(dist) * 2.5; // 两端略高，中间最低
  };

  const cardOverlap = myHand.length > 10 ? -10 : myHand.length > 7 ? -5 : 2;

  // 是否有方块3（开局提示）
  const hasDiamond3 = myHand.some(c => c.suit === 'diamonds' && c.rank === '3');
  const isFirstPlay = round === 1 && winOrder.length === 0 && lastPlay === null;

  return (
    <View style={{ flex: 1, backgroundColor: THEME.bg }}>
      <StatusBar style="light" hidden />

      {/* ── 深蓝渐变背景 + 网格纹理 ── */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: THEME.bg }} />
      {/* 网格线横向 */}
      {Array.from({ length: 12 }).map((_, i) => (
        <View key={`h${i}`} style={{
          position: 'absolute', left: 0, right: 0,
          top: i * 52, height: 1,
          backgroundColor: 'rgba(212,175,55,0.04)',
        }} />
      ))}
      {/* 网格线纵向 */}
      {Array.from({ length: 20 }).map((_, i) => (
        <View key={`v${i}`} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: i * 52, width: 1,
          backgroundColor: 'rgba(212,175,55,0.04)',
        }} />
      ))}
      {/* 中央光晕 */}
      <View style={{
        position: 'absolute', alignSelf: 'center',
        top: '20%', width: 300, height: 200, borderRadius: 150,
        backgroundColor: 'rgba(20,50,120,0.35)',
        boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 80, color: 'rgba(30,60,160,0.3)' }],
      }} />

      {/* ══════════════════════════════════════════
          主布局：左玩家 | 中央区 | 右玩家
          ══════════════════════════════════════════ */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* ── 左侧：上家 ── */}
        <View style={{ width: 88, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
          {leftPlayer ? (
            <>
              <SidePlayerCard
                player={leftPlayer}
                isCurrentTurn={currentSeat === leftSeat}
                countdown={currentSeat === leftSeat ? countdown : 0}
              />
              <SideOpponentCards count={leftPlayer.handCount} />
            </>
          ) : (
            <View style={{
              width: 72, height: 100, borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderWidth: 1, borderColor: THEME.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: THEME.goldDim, fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

        {/* ── 中央区域 ── */}
        <View style={{ flex: 1, flexDirection: 'column' }}>

          {/* ═══ 顶部信息栏 ═══ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4,
            backgroundColor: 'rgba(10,22,60,0.85)',
            borderBottomWidth: 1, borderBottomColor: THEME.border,
          }}>
            {/* 离开按钮 */}
            <Pressable onPress={() => router.back()} style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
              paddingHorizontal: 10, paddingVertical: 4,
              borderWidth: 1, borderColor: THEME.border,
            }}>
              <Text style={{ color: THEME.dim, fontSize: 13 }}>←</Text>
              <Text style={{ color: THEME.dim, fontSize: 11 }}>离开</Text>
            </Pressable>

            {/* 中间：局号 + 方块3开局提示 + 防放水 */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{
                backgroundColor: 'rgba(212,175,55,0.1)', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 3,
                borderWidth: 1, borderColor: THEME.goldDim,
              }}>
                <Text style={{ color: THEME.gold, fontSize: 11, fontWeight: '700' }}>第 {round} 局</Text>
              </View>
              {isFirstPlay && hasDiamond3 && (
                <View style={{
                  backgroundColor: 'rgba(212,175,55,0.15)', borderRadius: 8,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: THEME.gold,
                }}>
                  <Text style={{ color: THEME.gold, fontSize: 10, fontWeight: '700' }}>♦3 先手开局</Text>
                </View>
              )}
              {showAntiDumpHint && (
                <View style={{
                  backgroundColor: 'rgba(230,57,70,0.15)', borderRadius: 8,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: THEME.red,
                }}>
                  <Text style={{ color: THEME.red, fontSize: 10, fontWeight: '600' }}>
                    ⚠ {prevPlayer?.nickname} 最后1张
                  </Text>
                </View>
              )}
            </View>

            {/* 右侧：我的豆数 + 表情 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                backgroundColor: 'rgba(212,175,55,0.1)', borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: THEME.goldDim,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <Text style={{ fontSize: 12 }}>🪙</Text>
                <Text style={{ color: THEME.gold, fontSize: 11, fontWeight: '700' }}>
                  {myBeans}
                </Text>
              </View>
              <Pressable onPress={() => setShowEmoji(true)} style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1, borderColor: THEME.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 16 }}>😊</Text>
              </Pressable>
            </View>
          </View>

          {/* ═══ 对家区（顶部）：头像条 + 牌背 ═══ */}
          <View style={{ alignItems: 'center', gap: 4, paddingTop: 6, paddingBottom: 2 }}>
            {topPlayer ? (
              <>
                <TopPlayerBar
                  player={topPlayer}
                  isCurrentTurn={currentSeat === topSeat}
                  countdown={currentSeat === topSeat ? countdown : 0}
                />
                <TopOpponentCards count={topPlayer.handCount} />
              </>
            ) : (
              <View style={{ height: 32 }} />
            )}
          </View>

          {/* ═══ 中央出牌桌面区 ═══ */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* 桌面主体：圆角矩形深蓝 */}
            <Animated.View style={[{
              width: 320, height: 160, borderRadius: 20,
              backgroundColor: THEME.tableBg,
              borderWidth: 2, borderColor: THEME.gold,
              alignItems: 'center', justifyContent: 'center',
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(212,175,55,0.2)' },
                { offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(0,0,0,0.7)' },
              ],
            }, glowStyle]}>
              {/* 内框细线 */}
              <View style={{
                position: 'absolute', inset: 8, borderRadius: 14,
                borderWidth: 1, borderColor: 'rgba(212,175,55,0.12)',
              }} />
              {/* 出牌展示 */}
              <PlayArea
                lastPlay={lastPlay}
                lastPlayNickname={lastPlayPlayer?.nickname ?? ''}
                mustBeat={lastPlay !== null && lastPlaySeat !== mySeat}
              />
            </Animated.View>

            {/* 错误/提示浮层 */}
            {(errorMsg || antiDumpWarning) && (
              <View style={{
                position: 'absolute', top: 4,
                backgroundColor: 'rgba(230,57,70,0.15)', borderRadius: 8,
                paddingHorizontal: 12, paddingVertical: 4,
                borderWidth: 1, borderColor: THEME.red,
              }}>
                <Text style={{ color: THEME.red, fontSize: 12, fontWeight: '600' }}>
                  {antiDumpWarning || errorMsg}
                </Text>
              </View>
            )}

            {/* 表情浮现 */}
            {emojiMsg && (
              <View style={{ position: 'absolute' }}>
                <Text style={{ fontSize: 44 }}>{emojiMsg.emoji}</Text>
              </View>
            )}
          </View>

          {/* ═══════════════════════════════════════════
              底部操作区：我的信息 | 手牌 | 出牌/过牌
              ═══════════════════════════════════════════ */}
          <View style={{
            backgroundColor: 'rgba(10,22,60,0.92)',
            borderTopWidth: 1.5, borderTopColor: THEME.border,
            paddingTop: 6, paddingBottom: 8, paddingHorizontal: 8,
          }}>
            {/* 底部信息条：昵称 + 豆数 + 倒计时 + 聊天 */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 4, marginBottom: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PlayerAvatar player={myPlayer ?? { seat: mySeat, userId: '', nickname: '我', handCount: 0, isAI: false, avatarUrl: null, hasPassed: false, isDisconnected: false }} isCurrentTurn={isMyTurn} size={32} />
                <Text style={{ color: isMyTurn ? THEME.gold : THEME.white, fontSize: 12, fontWeight: '700' }}>
                  {myPlayer?.nickname ?? '我'}
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 3,
                  backgroundColor: 'rgba(212,175,55,0.1)', borderRadius: 8,
                  paddingHorizontal: 7, paddingVertical: 2,
                  borderWidth: 1, borderColor: THEME.goldDim,
                }}>
                  <Text style={{ fontSize: 11 }}>🪙</Text>
                  <Text style={{ color: THEME.gold, fontSize: 11, fontWeight: '700' }}>
                    {myBeans}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isMyTurn && (
                  <CountdownBadge countdown={countdown} urgent={countdown <= 5} />
                )}
                {/* 聊天按钮 */}
                <Pressable onPress={() => setShowEmoji(true)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderWidth: 1, borderColor: THEME.border,
                }}>
                  <Text style={{ fontSize: 14 }}>💬</Text>
                  <Text style={{ color: THEME.dim, fontSize: 11 }}>聊天</Text>
                </Pressable>
              </View>
            </View>

            {/* 手牌 + 操作按钮行 */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              {/* 手牌区（弧形展开） */}
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'flex-end', paddingHorizontal: 4, paddingBottom: 4 }}
                style={{ flex: 1, height: 96 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  {myHand.map((card, idx) => (
                    <View
                      key={card.id}
                      style={{
                        marginLeft: idx === 0 ? 0 : cardOverlap,
                        marginBottom: getCardArcOffset(idx, myHand.length),
                      }}>
                      <CardView
                        card={card}
                        selected={selectedCards.some(c => c.id === card.id)}
                        onPress={() => isMyTurn ? toggleCard(card) : undefined}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* 出牌 / 过牌 按钮 */}
              <View style={{ gap: 6, width: 88, paddingBottom: 4 }}>
                <Pressable
                  cssInterop={false}
                  onPress={handlePlay}
                  disabled={!isMyTurn || selectedCards.length === 0}
                  style={({ pressed }) => {
                    const enabled = isMyTurn && selectedCards.length > 0;
                    return {
                      height: 44, borderRadius: 22,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: !enabled ? 'rgba(255,255,255,0.05)' : pressed ? '#b8290d' : THEME.red,
                      borderWidth: 1.5,
                      borderColor: enabled ? '#FF6070' : THEME.border,
                      boxShadow: enabled
                        ? [{ offsetX: 0, offsetY: 4, blurRadius: 14, color: 'rgba(230,57,70,0.55)' }]
                        : [],
                    };
                  }}>
                  <Text style={{
                    fontWeight: '900', fontSize: 17, letterSpacing: 3,
                    color: (!isMyTurn || selectedCards.length === 0) ? 'rgba(255,255,255,0.2)' : THEME.white,
                  }}>出牌</Text>
                </Pressable>
                <Pressable
                  cssInterop={false}
                  onPress={() => handlePass()}
                  disabled={!isMyTurn || lastPlay === null}
                  style={({ pressed }) => {
                    const enabled = isMyTurn && lastPlay !== null;
                    return {
                      height: 44, borderRadius: 22,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pressed ? 'rgba(212,175,55,0.15)' : 'rgba(212,175,55,0.07)',
                      borderWidth: 1.5,
                      borderColor: enabled ? THEME.goldDim : THEME.border,
                      boxShadow: enabled
                        ? [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(212,175,55,0.2)' }]
                        : [],
                    };
                  }}>
                  <Text style={{
                    fontSize: 16, letterSpacing: 3, fontWeight: '700',
                    color: (!isMyTurn || !lastPlay) ? 'rgba(255,255,255,0.15)' : THEME.gold,
                  }}>过牌</Text>
                </Pressable>
              </View>
            </View>
          </View>

        </View>

        {/* ── 右侧：下家 ── */}
        <View style={{ width: 88, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
          {rightPlayer ? (
            <>
              <SidePlayerCard
                player={rightPlayer}
                isCurrentTurn={currentSeat === rightSeat}
                countdown={currentSeat === rightSeat ? countdown : 0}
              />
              <SideOpponentCards count={rightPlayer.handCount} />
            </>
          ) : (
            <View style={{
              width: 72, height: 100, borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderWidth: 1, borderColor: THEME.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: THEME.goldDim, fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

      </View>

      {/* ── 表情/聊天 Modal ── */}
      <Modal visible={showEmoji} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowEmoji(false)}>
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 18, paddingBottom: 24,
            backgroundColor: THEME.bgCard,
            borderTopWidth: 1.5, borderColor: THEME.gold,
            boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 20, color: 'rgba(212,175,55,0.1)' }],
          }}>
            <Text style={{
              color: THEME.gold, textAlign: 'center', fontWeight: '800',
              fontSize: 14, letterSpacing: 2, marginBottom: 14,
            }}>发送表情</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              {EMOJIS.map(emoji => (
                <Pressable key={emoji} onPress={() => sendEmoji(emoji)}
                  style={{
                    width: 52, height: 52, borderRadius: 12,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(212,175,55,0.08)',
                    borderWidth: 1, borderColor: THEME.border,
                  }}>
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
