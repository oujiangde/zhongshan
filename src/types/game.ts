// 花色
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

// 点数
export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

// 一张牌
export interface Card {
  id: string;       // 唯一ID，如 "spades_3"
  suit: Suit;
  rank: Rank;
  value: number;    // 用于比较大小：3=0, 4=1, ..., K=10, A=11, 2=12
}

// 牌型
export type HandType = 'single' | 'pair' | 'triple' | 'quad' | 'straight4' | 'invalid';

// 出牌
export interface Play {
  type: HandType;
  cards: Card[];
  maxValue: number; // 用于比较
}

// 玩家座位类型
export type SeatPosition = 0 | 1 | 2 | 3; // 0=底部(自己), 1=左, 2=上, 3=右

// AI 难度
export type AIDifficulty = 'easy' | 'medium' | 'hard';

// 玩家状态
export interface PlayerState {
  seat: SeatPosition;
  userId: string | null;
  nickname: string;
  avatarUrl: string | null;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  handCount: number;   // 仅显示数量（对方）
  hand?: Card[];       // 仅自己可见
  hasPassed: boolean;
  isDisconnected: boolean;
}

// 游戏阶段
export type GamePhase = 'playing' | 'finished';

// 完整游戏状态
export interface GameState {
  roomId: string;
  round: number;
  players: PlayerState[];
  currentSeat: SeatPosition;
  lastPlay: Play | null;
  lastPlaySeat: SeatPosition | null;
  passCount: number;
  phase: GamePhase;
  firstPlayerSeat: SeatPosition; // 本局先手
  winOrder: SeatPosition[];      // 出完牌的顺序
  turnStartedAt: number;         // 计时器起点
  diamondThreeOwner: SeatPosition | null; // 首局方块3持有者
}

// 结算信息
export interface SettlementResult {
  seat: SeatPosition;
  userId: string | null;
  nickname: string;
  avatarUrl: string | null;
  remainingCards: number;
  role: 'big_winner' | 'small_winner' | 'loser' | 'sole_winner';
  beanChange: number; // 正数=赢，负数=输
}

// 豆子结算规则
export interface BeanSettlement {
  results: SettlementResult[];
  total: number;
}
