/**
 * 游戏核心页面 - 横屏4人牌桌（中国风）
 * 座位布局：0=底部(自己), 1=左, 2=上, 3=右
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { supabase } from '@/client/supabase';
import { getGameState, updateGameState, saveGameHistory, updateBeans, updateGameStats, getRoomPlayers, getProfile } from '@/db/api';
import {
  sortCards, buildPlay, validatePlay, removeCards, aiSelectPlay, getTypeName,
  calculateSettlement, RANK_VALUES,
} from '@/utils/gameLogic';
import type { Card, Play, SeatPosition, PlayerState } from '@/types/game';
import type { GameStateRow, RoomPlayer } from '@/types/db';

// ─── 资源 URL ───────────────────────────────────────────────
const BG_URL = 'https://miaoda-site-img.cdn.bcebos.com/images/baidu_image_search_484d4842-acef-432d-9593-c83f86205324.jpg';

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
// 扑克牌组件 — 精品金边风格
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
        {/* 内框金边 */}
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
    <Pressable onPress={onPress}
      style={{
        width: w, height: h,
        backgroundColor: selected ? '#fffce8' : '#ffffff',
        borderRadius: 6,
        borderWidth: selected ? 2.5 : 1.5,
        borderColor: selected ? '#FFD700' : '#d4c070',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ translateY: selected ? -16 : 0 }],
        boxShadow: selected
          ? [
            { offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(255,215,0,0.85)' },
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
  );
}

// ==========================================
// 对手竖向叠牌（左右两侧）
// ==========================================
function SideOpponentCards({ count }: { count: number }) {
  const total = Math.min(count, 9);
  return (
    <View style={{ alignItems: 'center', height: 40 + (total - 1) * 9 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', top: i * 9 }}>
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
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -14 }}>
          <CardView card={{ id: `tb${i}`, suit: 'spades', rank: '3', value: 0 }} small faceDown />
        </View>
      ))}
    </View>
  );
}

// ==========================================
// 左右对手玩家卡片 — 精品手游风格
// ==========================================
function SidePlayerCard({ player, isCurrentTurn, countdown }: {
  player: PlayerState;
  isCurrentTurn: boolean;
  countdown: number;
}) {
  return (
    <View style={{
      width: 76, borderRadius: 12, overflow: 'hidden',
      borderWidth: isCurrentTurn ? 2 : 1.5,
      borderColor: isCurrentTurn ? '#FFD700' : 'rgba(255,215,0,0.2)',
      backgroundColor: 'rgba(6,20,10,0.92)',
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 16, color: 'rgba(255,215,0,0.6)' }]
        : [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(0,0,0,0.7)' }],
    }}>
      {/* 头像区 */}
      <View style={{ height: 68, backgroundColor: '#071a0e', alignItems: 'center', justifyContent: 'center' }}>
        {player.avatarUrl ? (
          <Image source={{ uri: player.avatarUrl }} style={{ width: 76, height: 68 }} contentFit="cover" />
        ) : (
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: isCurrentTurn ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.07)',
            borderWidth: 2, borderColor: isCurrentTurn ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 22 }}>{player.isAI ? '🤖' : '👤'}</Text>
          </View>
        )}
        {/* 轮到该玩家时的金色底条 */}
        {isCurrentTurn && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
            backgroundColor: '#FFD700',
          }} />
        )}
      </View>
      {/* 信息区 */}
      <View style={{ paddingHorizontal: 4, paddingVertical: 5, alignItems: 'center', gap: 3 }}>
        <Text style={{
          color: isCurrentTurn ? '#FFD700' : '#fff',
          fontSize: 10, fontWeight: '700',
        }} numberOfLines={1}>{player.nickname}</Text>
        {/* 牌数 + 倒计时行 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{
            backgroundColor: isCurrentTurn ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)',
            borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1,
            borderWidth: 1, borderColor: isCurrentTurn ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)',
          }}>
            <Text style={{ color: isCurrentTurn ? '#FFD700' : 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>
              {player.handCount}张
            </Text>
          </View>
          {isCurrentTurn && countdown > 0 && (
            <View style={{
              backgroundColor: countdown <= 5 ? 'rgba(255,68,68,0.3)' : 'rgba(255,215,0,0.15)',
              borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
              borderWidth: 1, borderColor: countdown <= 5 ? '#FF4444' : 'rgba(255,215,0,0.4)',
            }}>
              <Text style={{ color: countdown <= 5 ? '#FF6B6B' : '#FFD700', fontSize: 10, fontWeight: '800' }}>{countdown}</Text>
            </View>
          )}
        </View>
        {player.hasPassed && (
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>过牌</Text>
        )}
      </View>
    </View>
  );
}

// ==========================================
// 上方对手信息条 — 精品胶囊设计
// ==========================================
function TopPlayerBar({ player, isCurrentTurn, countdown }: {
  player: PlayerState;
  isCurrentTurn: boolean;
  countdown: number;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 7,
      backgroundColor: isCurrentTurn ? 'rgba(255,215,0,0.1)' : 'rgba(0,0,0,0.75)',
      borderRadius: 22, paddingHorizontal: 8, paddingVertical: 5,
      borderWidth: isCurrentTurn ? 1.5 : 1,
      borderColor: isCurrentTurn ? '#FFD700' : 'rgba(255,215,0,0.2)',
      boxShadow: isCurrentTurn
        ? [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(255,215,0,0.5)' }]
        : [],
    }}>
      {/* 头像小圆 */}
      <View style={{
        width: 30, height: 30, borderRadius: 15, overflow: 'hidden',
        borderWidth: 2, borderColor: isCurrentTurn ? '#FFD700' : 'rgba(255,215,0,0.25)',
      }}>
        {player.avatarUrl ? (
          <Image source={{ uri: player.avatarUrl }} style={{ width: 30, height: 30 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071a0e' }}>
            <Text style={{ fontSize: 15 }}>{player.isAI ? '🤖' : '👤'}</Text>
          </View>
        )}
      </View>
      <Text style={{
        color: isCurrentTurn ? '#FFD700' : '#fff',
        fontSize: 11, fontWeight: '700',
      }}>{player.nickname}</Text>
      <View style={{
        backgroundColor: isCurrentTurn ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.12)',
        borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1,
        borderWidth: 1, borderColor: isCurrentTurn ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.15)',
      }}>
        <Text style={{ color: isCurrentTurn ? '#FFD700' : 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>
          {player.handCount}张
        </Text>
      </View>
      {isCurrentTurn && countdown > 0 && (
        <View style={{
          backgroundColor: countdown <= 5 ? 'rgba(255,68,68,0.25)' : 'transparent',
          borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1,
          borderWidth: 1, borderColor: countdown <= 5 ? '#FF4444' : 'rgba(255,215,0,0.3)',
        }}>
          <Text style={{
            color: countdown <= 5 ? '#FF6B6B' : '#FFD700',
            fontSize: 11, fontWeight: '800',
          }}>{countdown}s</Text>
        </View>
      )}
    </View>
  );
}

// ==========================================
// 中央桌面出牌区
// ==========================================
function PlayArea({ lastPlay, lastPlayNickname }: { lastPlay: Play | null; lastPlayNickname: string }) {
  if (!lastPlay) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
        <Text style={{ color: 'rgba(255,215,0,0.25)', fontSize: 13, letterSpacing: 2 }}>✦ 等待出牌 ✦</Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <View style={{
        backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 12,
        paddingHorizontal: 10, paddingVertical: 3,
        borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
      }}>
        <Text style={{ color: 'rgba(255,220,100,0.9)', fontSize: 11, fontWeight: '600' }}>
          {lastPlayNickname} · {getTypeName(lastPlay.type)}
        </Text>
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
  const [emojiMsg, setEmojiMsg] = useState<{ seat: SeatPosition; emoji: string } | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<{ currentSeat: SeatPosition; myHand: Card[]; players: PlayerState[] }>({
    currentSeat: 0,
    myHand: [],
    players: [],
  });

  useEffect(() => {
    init();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
      if (validation.reason?.includes('上家')) {
        setAntiDumpWarning(validation.reason);
      } else {
        setErrorMsg(validation.reason ?? '出牌无效');
      }
      return;
    }

    const play = buildPlay(selectedCards);
    if (!play) { setErrorMsg('无效牌型'); return; }

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#030f07' }}>
        <Image source={{ uri: BG_URL }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
        <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.72)' }} />
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

  // 手牌间距：最多 13 张，让每张牌主体都尽量可见
  const cardOverlap = myHand.length > 10 ? -8 : myHand.length > 7 ? -4 : 4;

  return (
    <View style={{ flex: 1, backgroundColor: '#030f07' }}>
      <StatusBar style="light" hidden />

      {/* ── 背景：深绿毡面 ── */}
      <Image source={{ uri: BG_URL }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" />
      {/* 深色蒙层强化绿毡感 */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(2,12,5,0.62)' }} />

      {/* ══════════════════════════════════════════
          布局：左面板 | 中央区 | 右面板
          ══════════════════════════════════════════ */}
      <View style={{ flex: 1, flexDirection: 'row' }}>

        {/* ── 左侧对手面板 ── */}
        <View style={{ width: 92, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 }}>
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
              width: 76, height: 110, borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderWidth: 1, borderColor: 'rgba(255,215,0,0.1)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: 'rgba(255,215,0,0.2)', fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

        {/* ── 中央区域 ── */}
        <View style={{ flex: 1, flexDirection: 'column' }}>

          {/* === 顶部信息栏 === */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 10, paddingTop: 5, paddingBottom: 3,
          }}>
            {/* 离开按钮 */}
            <Pressable onPress={() => router.back()}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14,
                paddingHorizontal: 10, paddingVertical: 5,
                borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
              }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>←</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>离开</Text>
            </Pressable>

            {/* 局号 + 防放水提示 */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{
                backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 10,
                paddingHorizontal: 10, paddingVertical: 3,
                borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
              }}>
                <Text style={{ color: '#FFD700', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>第 {round} 局</Text>
              </View>
              {showAntiDumpHint && (
                <View style={{
                  backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: 10,
                  paddingHorizontal: 9, paddingVertical: 3,
                  borderWidth: 1, borderColor: '#FF4444',
                }}>
                  <Text style={{ color: '#FF6B6B', fontSize: 10, fontWeight: '600' }}>⚠ {prevPlayer?.nickname} 最后1张！</Text>
                </View>
              )}
            </View>

            {/* 表情按钮 */}
            <Pressable onPress={() => setShowEmoji(true)}
              style={{
                width: 34, height: 34, borderRadius: 17,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 17 }}>😊</Text>
            </Pressable>
          </View>

          {/* === 上方对手区 === */}
          <View style={{ alignItems: 'center', gap: 5, paddingBottom: 3 }}>
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
              <View style={{ height: 36 }} />
            )}
          </View>

          {/* === 中央椭圆绿毡桌面 === */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* 外圈金光晕 */}
            <View style={{
              width: 320, height: 176,
              borderRadius: 88,
              position: 'absolute',
              backgroundColor: 'rgba(255,215,0,0.06)',
              boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 30, color: 'rgba(255,215,0,0.18)' }],
            }} />
            {/* 毡面主体椭圆 */}
            <View style={{
              width: 300, height: 164, borderRadius: 82,
              backgroundColor: '#0d4020',
              borderWidth: 3, borderColor: '#c8a800',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: [
                { offsetX: 0, offsetY: 0, blurRadius: 20, color: 'rgba(255,215,0,0.2)' },
                { offsetX: 0, offsetY: 6, blurRadius: 20, color: 'rgba(0,0,0,0.8)' },
              ],
            }}>
              {/* 内圈高光边 */}
              <View style={{
                position: 'absolute', width: 282, height: 148, borderRadius: 76,
                borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.18)',
              }} />
              {/* 桌面纹理暗圆 */}
              <View style={{
                position: 'absolute', width: 240, height: 118, borderRadius: 62,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
              }} />
              {/* 出牌展示 */}
              <PlayArea lastPlay={lastPlay} lastPlayNickname={lastPlayPlayer?.nickname ?? ''} />
            </View>

            {/* 错误/防放水提示浮层 */}
            {(errorMsg || antiDumpWarning) && (
              <View style={{
                position: 'absolute', top: 0,
                backgroundColor: 'rgba(255,68,68,0.12)', borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 5,
                borderWidth: 1, borderColor: '#FF4444',
                boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: 'rgba(255,68,68,0.3)' }],
              }}>
                <Text style={{ color: '#FF6B6B', fontSize: 12, fontWeight: '600' }}>{antiDumpWarning || errorMsg}</Text>
              </View>
            )}

            {/* 表情浮现 */}
            {emojiMsg && (
              <View style={{ position: 'absolute' }}>
                <Text style={{ fontSize: 44 }}>{emojiMsg.emoji}</Text>
              </View>
            )}
          </View>

          {/* ═══════════════════════════════════════
              底部操作区：头像 | 手牌 | 按钮
              ═══════════════════════════════════════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-end',
            paddingHorizontal: 8, paddingBottom: 8, paddingTop: 5, gap: 8,
            backgroundColor: 'rgba(2,10,5,0.88)',
            borderTopWidth: 1.5, borderTopColor: 'rgba(255,215,0,0.18)',
          }}>

            {/* 我的头像+信息 */}
            <View style={{ width: 68, alignItems: 'center', gap: 4, paddingBottom: 2 }}>
              {/* 头像圆 */}
              <View style={{
                width: 50, height: 50, borderRadius: 25, overflow: 'hidden',
                borderWidth: isMyTurn ? 2.5 : 2,
                borderColor: isMyTurn ? '#FFD700' : 'rgba(255,215,0,0.25)',
                boxShadow: isMyTurn
                  ? [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: 'rgba(255,215,0,0.65)' }]
                  : [],
              }}>
                {myPlayer?.avatarUrl ? (
                  <Image source={{ uri: myPlayer.avatarUrl }} style={{ width: 50, height: 50 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, backgroundColor: '#071a0e', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24 }}>👤</Text>
                  </View>
                )}
              </View>
              <Text style={{
                color: isMyTurn ? '#FFD700' : 'rgba(255,255,255,0.7)',
                fontSize: 10, fontWeight: '700',
              }} numberOfLines={1}>{myPlayer?.nickname ?? '我'}</Text>
              {isMyTurn && (
                <View style={{
                  backgroundColor: countdown <= 5 ? 'rgba(255,68,68,0.25)' : 'rgba(255,215,0,0.15)',
                  borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1,
                  borderWidth: 1, borderColor: countdown <= 5 ? '#FF4444' : 'rgba(255,215,0,0.5)',
                }}>
                  <Text style={{
                    color: countdown <= 5 ? '#FF6B6B' : '#FFD700',
                    fontSize: 10, fontWeight: '800',
                  }}>{countdown}s</Text>
                </View>
              )}
            </View>

            {/* 手牌区（横向可滚动） */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'flex-end', paddingHorizontal: 4 }}
              style={{ flex: 1, height: 88 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                {myHand.map((card, idx) => (
                  <View key={card.id} style={{ marginLeft: idx === 0 ? 0 : cardOverlap }}>
                    <CardView
                      card={card}
                      selected={selectedCards.some(c => c.id === card.id)}
                      onPress={() => isMyTurn ? toggleCard(card) : undefined}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* 操作按钮组 */}
            <View style={{ gap: 7, width: 86, paddingBottom: 2 }}>
              {/* 出牌按钮 */}
              <Pressable
                cssInterop={false}
                onPress={handlePlay}
                disabled={!isMyTurn || selectedCards.length === 0}
                style={({ pressed }) => {
                  const enabled = isMyTurn && selectedCards.length > 0;
                  return {
                    height: 46, borderRadius: 23,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: !enabled
                      ? 'rgba(255,255,255,0.06)'
                      : pressed ? '#b8290d' : '#E8340A',
                    borderWidth: 1.5,
                    borderColor: !enabled ? 'rgba(255,255,255,0.08)' : enabled ? '#FF6040' : 'transparent',
                    boxShadow: enabled
                      ? [{ offsetX: 0, offsetY: 5, blurRadius: 16, color: 'rgba(232,52,10,0.65)' }]
                      : [],
                  };
                }}>
                <Text style={{
                  fontWeight: '900', fontSize: 18, letterSpacing: 3,
                  color: (!isMyTurn || selectedCards.length === 0) ? 'rgba(255,255,255,0.18)' : '#fff',
                  textShadowColor: 'rgba(255,100,50,0.5)',
                  textShadowRadius: 6,
                  textShadowOffset: { width: 0, height: 0 },
                }}>出牌</Text>
              </Pressable>
              {/* 过牌按钮 */}
              <Pressable
                cssInterop={false}
                onPress={() => handlePass()}
                disabled={!isMyTurn || lastPlay === null}
                style={({ pressed }) => {
                  const enabled = isMyTurn && lastPlay !== null;
                  return {
                    height: 46, borderRadius: 23,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: pressed
                      ? 'rgba(255,215,0,0.18)'
                      : 'rgba(255,215,0,0.08)',
                    borderWidth: 1.5,
                    borderColor: enabled ? 'rgba(255,215,0,0.45)' : 'rgba(255,255,255,0.08)',
                    boxShadow: enabled
                      ? [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(255,215,0,0.2)' }]
                      : [],
                  };
                }}>
                <Text style={{
                  fontSize: 17, letterSpacing: 3, fontWeight: '700',
                  color: (!isMyTurn || !lastPlay) ? 'rgba(255,255,255,0.15)' : 'rgba(255,215,0,0.9)',
                }}>过牌</Text>
              </Pressable>
            </View>

          </View>
        </View>

        {/* ── 右侧对手面板 ── */}
        <View style={{ width: 92, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 8 }}>
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
              width: 76, height: 110, borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderWidth: 1, borderColor: 'rgba(255,215,0,0.1)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: 'rgba(255,215,0,0.2)', fontSize: 10 }}>等待</Text>
            </View>
          )}
        </View>

      </View>

      {/* ── 表情 Modal ── */}
      <Modal visible={showEmoji} transparent animationType="slide">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setShowEmoji(false)}>
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            padding: 18, paddingBottom: 24,
            backgroundColor: 'rgba(4,16,8,0.97)',
            borderTopWidth: 1.5, borderColor: 'rgba(255,215,0,0.3)',
            boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 20, color: 'rgba(255,215,0,0.1)' }],
          }}>
            <Text style={{
              color: '#FFD700', textAlign: 'center', fontWeight: '800',
              fontSize: 14, letterSpacing: 2, marginBottom: 14,
            }}>发送表情</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
              {EMOJIS.map(emoji => (
                <Pressable key={emoji} onPress={() => sendEmoji(emoji)}
                  style={{
                    width: 54, height: 54, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(255,215,0,0.08)',
                    borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
                  }}>
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
