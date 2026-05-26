/**
 * 跑得快核心游戏逻辑
 * 规则：4人，13张/人，顺子固定4张
 * 牌大小：3<4<5<6<7<8<9<10<J<Q<K<A<2
 */

import type { Card, Suit, Rank, HandType, Play, SeatPosition, SettlementResult, BeanSettlement } from '@/types/game';

// 牌值映射：3=0, 4=1, ..., K=10, A=11, 2=12
export const RANK_VALUES: Record<Rank, number> = {
  '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6,
  '10': 7, 'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12,
};

export const RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

// 生成一副52张牌
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${suit}_${rank}`,
        suit,
        rank,
        value: RANK_VALUES[rank],
      });
    }
  }
  return deck;
}

// 洗牌（Fisher-Yates）
export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// 发牌：4人每人13张
export function dealCards(deck: Card[]): [Card[], Card[], Card[], Card[]] {
  const shuffled = shuffleDeck(deck);
  return [
    shuffled.slice(0, 13),
    shuffled.slice(13, 26),
    shuffled.slice(26, 39),
    shuffled.slice(39, 52),
  ];
}

// 找方块3的持有者
export function findDiamond3Owner(hands: Card[][]): SeatPosition {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some(c => c.suit === 'diamonds' && c.rank === '3')) {
      return i as SeatPosition;
    }
  }
  return 0;
}

// 对手牌排序（从小到大）
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    // 同点数按花色排序（方块<梅花<红心<黑桃）
    const suitOrder: Record<Suit, number> = { diamonds: 0, clubs: 1, hearts: 2, spades: 3 };
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

// 判断牌型
export function detectHandType(cards: Card[]): HandType {
  const n = cards.length;
  if (n === 0) return 'invalid';
  if (n === 1) return 'single';
  if (n === 2) {
    return cards[0].value === cards[1].value ? 'pair' : 'invalid';
  }
  if (n === 3) {
    const allSame = cards.every(c => c.value === cards[0].value);
    return allSame ? 'triple' : 'invalid';
  }
  if (n === 4) {
    const allSame = cards.every(c => c.value === cards[0].value);
    if (allSame) return 'quad';
    // 判断是否为4张顺子
    return isStraight4(cards) ? 'straight4' : 'invalid';
  }
  return 'invalid';
}

// 判断4张顺子（A234为最小, 牌值连续）
// 规则：A=11，2=12，3=0
// 特殊顺序：A234 -> 值分别是 11,0,1,2，需单独处理
function isStraight4(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  const vals = cards.map(c => c.value).sort((a, b) => a - b);

  // 特殊顺子 A234：值 [0,1,2,11]
  if (JSON.stringify(vals) === JSON.stringify([0, 1, 2, 11])) return true;

  // 特殊顺子 2345：值 [2,3,4,12]
  if (JSON.stringify(vals) === JSON.stringify([2, 3, 4, 12])) return true;

  // 普通4连顺（检查是否连续）
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] !== vals[i - 1] + 1) return false;
  }
  return true;
}

// 获取顺子最大值（用于比较）
function getStraight4MaxValue(cards: Card[]): number {
  const vals = cards.map(c => c.value).sort((a, b) => a - b);
  // A234：最小顺子，最大值用 -1 表示
  if (JSON.stringify(vals) === JSON.stringify([0, 1, 2, 11])) return -1;
  // 2345: 值 sorted=[2,3,4,12]，最大是2（值12），但代表这个顺子的比较值用最高连续牌
  if (JSON.stringify(vals) === JSON.stringify([2, 3, 4, 12])) return 12;
  return vals[vals.length - 1];
}

// 构建 Play 对象
export function buildPlay(cards: Card[]): Play | null {
  const type = detectHandType(cards);
  if (type === 'invalid') return null;
  
  let maxValue: number;
  if (type === 'straight4') {
    maxValue = getStraight4MaxValue(cards);
  } else {
    maxValue = Math.max(...cards.map(c => c.value));
  }
  
  return { type, cards, maxValue };
}

// 检查是否可以压牌（新出的牌是否大于上一家）
// 跑得快规则：同类型比点数大小，不存在炸弹通杀
export function canBeat(newPlay: Play, lastPlay: Play): boolean {
  if (newPlay.type !== lastPlay.type) return false;
  return newPlay.maxValue > lastPlay.maxValue;
}

// 防放水规则检查
// 当上一家（prevSeat = (currentSeat + 3) % 4）只剩1张牌时
// 如果当前玩家选择出单张，必须出比自己手中最大的单张（即只能出最大单张）
export function checkAntiDump(
  selectedCards: Card[],
  myHand: Card[],
  prevPlayerCardCount: number
): { valid: boolean; reason?: string } {
  if (prevPlayerCardCount !== 1) return { valid: true };
  
  const type = detectHandType(selectedCards);
  if (type === 'invalid') return { valid: false, reason: '牌型无效' };
  
  // 出非单张牌型不受限制
  if (type !== 'single') return { valid: true };
  
  // 出单张时，检查是否是最大的单张
  const selectedValue = selectedCards[0].value;
  const maxValueInHand = Math.max(...myHand.map(c => c.value));
  
  if (selectedValue < maxValueInHand) {
    return { 
      valid: false, 
      reason: '上家只剩1张牌，单张必须从大往小出！' 
    };
  }
  
  return { valid: true };
}

// 检查出牌是否合法（综合验证）
export function validatePlay(
  selectedCards: Card[],
  myHand: Card[],
  lastPlay: Play | null,
  prevPlayerCardCount: number,
  isFirstTurn: boolean,
  isFirstRound: boolean,
  hasDiamond3: boolean
): { valid: boolean; reason?: string } {
  if (selectedCards.length === 0) {
    return { valid: false, reason: '请选择要出的牌' };
  }

  // 检查选的牌是否都在手中
  for (const card of selectedCards) {
    if (!myHand.some(c => c.id === card.id)) {
      return { valid: false, reason: '所选牌不在手中' };
    }
  }

  // 检查牌型
  const type = detectHandType(selectedCards);
  if (type === 'invalid') {
    return { valid: false, reason: '无效牌型，可出：单张/对子/三张/四张/4张顺子' };
  }

  // 第一局第一手必须包含方块3
  if (isFirstRound && isFirstTurn && hasDiamond3) {
    const hasDia3 = selectedCards.some(c => c.suit === 'diamonds' && c.rank === '3');
    if (!hasDia3) {
      return { valid: false, reason: '第一局必须出方块3' };
    }
  }

  // 如果是本轮第一手牌（没有lastPlay），可以随便出
  if (!lastPlay) {
    return { valid: true };
  }

  // 检查能否压牌
  const newPlay = buildPlay(selectedCards);
  if (!newPlay) return { valid: false, reason: '无效牌型' };
  
  if (!canBeat(newPlay, lastPlay)) {
    // 同类型但不够大
    if (newPlay.type !== lastPlay.type) {
      return { valid: false, reason: `必须出${getTypeName(lastPlay.type)}来压牌` };
    }
    return { valid: false, reason: '牌不够大，无法压牌' };
  }

  // 防放水检查
  const antiDump = checkAntiDump(selectedCards, myHand, prevPlayerCardCount);
  if (!antiDump.valid) return antiDump;

  return { valid: true };
}

export function getTypeName(type: HandType): string {
  const names: Record<HandType, string> = {
    single: '单张',
    pair: '对子',
    triple: '三张',
    quad: '四张',
    straight4: '4张顺子',
    invalid: '无效',
  };
  return names[type];
}

// 移除手中已打出的牌
export function removeCards(hand: Card[], played: Card[]): Card[] {
  const playedIds = new Set(played.map(c => c.id));
  return hand.filter(c => !playedIds.has(c.id));
}

// ==========================================
// 结算逻辑
// ==========================================

// 计算剩余牌数对应的输豆数
export function calcLossBeans(remainingCards: number): number {
  if (remainingCards === 0) return 0; // 赢家不输豆
  if (remainingCards === 13) return 4; // 一张没出
  if (remainingCards === 9) return 3;
  if (remainingCards === 8) return 2;
  return 1; // 1-7张
}

/**
 * 计算结算结果
 * 
 * 规则：
 * - 大赢家：第一个出完牌的
 * - 小赢家：剩余3人中剩牌≤7的，剩牌最少的那个
 * - 特殊：若出完后，其他3人剩牌完全相同 -> 3人全输，只有大赢家独赢
 * - 特殊：若其他3人剩牌均≥8 -> 只有大赢家独赢
 * 
 * 豆子：
 * - 大赢家收取两输家中输豆较多的那份
 * - 小赢家收取两输家中输豆较少的那份
 */
export function calculateSettlement(
  seatRemaining: Record<SeatPosition, number>, // 每个座位剩余牌数（大赢家=0）
  bigWinnerSeat: SeatPosition,
  seatNicknames: Record<SeatPosition, string>,
  seatAvatars: Record<SeatPosition, string | null>,
  seatUserIds: Record<SeatPosition, string | null>
): BeanSettlement {
  const otherSeats = ([0, 1, 2, 3] as SeatPosition[]).filter(s => s !== bigWinnerSeat);
  const otherRemaining = otherSeats.map(s => ({ seat: s, remaining: seatRemaining[s] }));

  // 检查特殊情况：其他3人剩牌完全相同 -> 全输
  const remainingValues = otherRemaining.map(o => o.remaining);
  const allSame = remainingValues.every(v => v === remainingValues[0]);

  // 所有人剩牌>=8或allSame -> 只有大赢家独赢
  const allLoser = allSame || otherRemaining.every(o => o.remaining >= 8);

  const results: SettlementResult[] = [];

  if (allLoser) {
    // 大赢家独赢，其他全输
    const lossBeans = otherRemaining.map(o => calcLossBeans(o.remaining));
    const totalBeans = lossBeans.reduce((a, b) => a + b, 0);

    results.push({
      seat: bigWinnerSeat,
      userId: seatUserIds[bigWinnerSeat],
      nickname: seatNicknames[bigWinnerSeat],
      avatarUrl: seatAvatars[bigWinnerSeat],
      remainingCards: 0,
      role: 'sole_winner',
      beanChange: totalBeans,
    });

    for (let i = 0; i < otherSeats.length; i++) {
      const seat = otherSeats[i];
      results.push({
        seat,
        userId: seatUserIds[seat],
        nickname: seatNicknames[seat],
        avatarUrl: seatAvatars[seat],
        remainingCards: otherRemaining[i].remaining,
        role: 'loser',
        beanChange: -lossBeans[i],
      });
    }
  } else {
    // 常规结算：找小赢家和输家
    // 输家：剩牌>=8
    // 小赢家候选：剩牌<=7
    const losers = otherRemaining.filter(o => o.remaining >= 8);
    const smallWinnerCandidates = otherRemaining.filter(o => o.remaining <= 7);

    let smallWinnerSeat: SeatPosition | null = null;
    if (smallWinnerCandidates.length > 0) {
      // 剩牌最少的为小赢家
      const minRemaining = Math.min(...smallWinnerCandidates.map(o => o.remaining));
      smallWinnerSeat = smallWinnerCandidates.find(o => o.remaining === minRemaining)!.seat;
    }

    // 计算输家豆子
    const loserBeans = losers.map(l => ({
      seat: l.seat,
      remaining: l.remaining,
      beans: calcLossBeans(l.remaining),
    }));

    // 大赢家拿最多的，小赢家拿最少的
    const sortedLoserBeans = [...loserBeans].sort((a, b) => b.beans - a.beans);
    const bigWinnerGain = sortedLoserBeans[0]?.beans ?? 0;
    const smallWinnerGain = sortedLoserBeans[1]?.beans ?? 0;

    // 大赢家
    results.push({
      seat: bigWinnerSeat,
      userId: seatUserIds[bigWinnerSeat],
      nickname: seatNicknames[bigWinnerSeat],
      avatarUrl: seatAvatars[bigWinnerSeat],
      remainingCards: 0,
      role: 'big_winner',
      beanChange: bigWinnerGain,
    });

    // 小赢家
    if (smallWinnerSeat !== null) {
      results.push({
        seat: smallWinnerSeat,
        userId: seatUserIds[smallWinnerSeat],
        nickname: seatNicknames[smallWinnerSeat],
        avatarUrl: seatAvatars[smallWinnerSeat],
        remainingCards: seatRemaining[smallWinnerSeat],
        role: 'small_winner',
        beanChange: smallWinnerGain,
      });
    }

    // 输家
    for (const loser of losers) {
      const beanLoss = loserBeans.find(l => l.seat === loser.seat)!.beans;
      results.push({
        seat: loser.seat,
        userId: seatUserIds[loser.seat],
        nickname: seatNicknames[loser.seat],
        avatarUrl: seatAvatars[loser.seat],
        remainingCards: loser.remaining,
        role: 'loser',
        beanChange: -beanLoss,
      });
    }

    // 剩余（非大/小赢家，非输家的人，即在smallWinnerCandidates但不是小赢家的）- 也算输家1豆
    const leftover = smallWinnerCandidates.filter(
      o => o.seat !== smallWinnerSeat
    );
    for (const p of leftover) {
      results.push({
        seat: p.seat,
        userId: seatUserIds[p.seat],
        nickname: seatNicknames[p.seat],
        avatarUrl: seatAvatars[p.seat],
        remainingCards: p.remaining,
        role: 'loser',
        beanChange: -calcLossBeans(p.remaining),
      });
    }
  }

  return {
    results,
    total: results.reduce((sum, r) => sum + (r.beanChange > 0 ? r.beanChange : 0), 0),
  };
}

// ==========================================
// AI 出牌逻辑
// ==========================================

/**
 * AI出牌策略
 * @param hand AI手牌
 * @param lastPlay 上一手牌（null=新轮次）
 * @param difficulty AI难度
 * @param prevPlayerCardCount 上家剩余牌数（防放水）
 * @returns 要出的牌，null=过牌
 */
export function aiSelectPlay(
  hand: Card[],
  lastPlay: Play | null,
  difficulty: 'easy' | 'medium' | 'hard',
  prevPlayerCardCount: number
): Card[] | null {
  const sorted = sortCards(hand);

  // 新轮次（自由出牌）
  if (!lastPlay) {
    return aiFreePick(sorted, difficulty);
  }

  // 压牌
  return aiBeatPlay(sorted, lastPlay, difficulty, prevPlayerCardCount);
}

function aiFreePick(hand: Card[], difficulty: 'easy' | 'medium' | 'hard'): Card[] {
  // 优先出对子、三张，清理多牌型
  const groups = groupByValue(hand);
  
  // 先出单牌（简单AI）
  if (difficulty === 'easy') {
    return [hand[0]]; // 出最小单张
  }
  
  // 中等/困难：优先出对子/三张
  const pairs = Object.values(groups).filter(g => g.length === 2);
  const triples = Object.values(groups).filter(g => g.length === 3);
  const quads = Object.values(groups).filter(g => g.length === 4);
  
  // 检查4张顺子
  const straight = findBestStraight4(hand, null);
  
  if (difficulty === 'hard') {
    if (quads.length > 0) return quads[0];
    if (straight) return straight;
    if (triples.length > 0) return triples[0];
    if (pairs.length > 0) return pairs[0];
  }
  
  if (triples.length > 0) return triples[0];
  if (pairs.length > 0) return pairs[0];
  return [hand[0]]; // 出最小单张
}

function aiBeatPlay(
  hand: Card[],
  lastPlay: Play,
  difficulty: 'easy' | 'medium' | 'hard',
  prevPlayerCardCount: number
): Card[] | null {
  switch (lastPlay.type) {
    case 'single': {
      // 防放水：上家只剩1张必须出最大单张
      if (prevPlayerCardCount === 1) {
        const maxCard = hand.reduce((max, c) => c.value > max.value ? c : max, hand[0]);
        if (maxCard.value > lastPlay.maxValue) return [maxCard];
        return null;
      }
      // 找能压的最小单张
      const bigger = hand.filter(c => c.value > lastPlay.maxValue);
      if (bigger.length === 0) return null;
      if (difficulty === 'easy') return [bigger[0]]; // 最小的能压
      // 中/困难：保留大牌，用小的压
      return [bigger[0]];
    }
    case 'pair': {
      const groups = groupByValue(hand);
      const validPairs = Object.values(groups)
        .filter(g => g.length >= 2 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 2));
      if (validPairs.length === 0) return null;
      return validPairs[0];
    }
    case 'triple': {
      const groups = groupByValue(hand);
      const validTriples = Object.values(groups)
        .filter(g => g.length >= 3 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 3));
      if (validTriples.length === 0) return null;
      return validTriples[0];
    }
    case 'quad': {
      const groups = groupByValue(hand);
      const validQuads = Object.values(groups)
        .filter(g => g.length >= 4 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 4));
      if (validQuads.length === 0) return null;
      return validQuads[0];
    }
    case 'straight4': {
      const betterStraight = findBestStraight4(hand, lastPlay.maxValue);
      return betterStraight;
    }
    default:
      return null;
  }
}

function groupByValue(cards: Card[]): Record<number, Card[]> {
  const groups: Record<number, Card[]> = {};
  for (const card of cards) {
    if (!groups[card.value]) groups[card.value] = [];
    groups[card.value].push(card);
  }
  return groups;
}

function findBestStraight4(hand: Card[], minMaxValue: number | null): Card[] | null {
  // 枚举所有可能的4张顺子
  const straights: Card[][] = [];
  
  // 普通4连顺（不含A234和2345）
  for (let start = 0; start <= 8; start++) { // 3到9开始
    const group = hand.filter(c => c.value >= start && c.value <= start + 3);
    const uniqueVals = new Set(group.map(c => c.value));
    if (uniqueVals.size === 4) {
      const selected: Card[] = [];
      for (let v = start; v <= start + 3; v++) {
        selected.push(group.find(c => c.value === v)!);
      }
      straights.push(selected);
    }
  }
  
  // A234：值 0,1,2,11
  const a234Needed = [0, 1, 2, 11];
  const a234Cards = a234Needed.map(v => hand.find(c => c.value === v));
  if (a234Cards.every(Boolean)) {
    straights.push(a234Cards as Card[]);
  }
  
  // 2345：值 2,3,4,12
  const s2345Needed = [2, 3, 4, 12];
  const s2345Cards = s2345Needed.map(v => hand.find(c => c.value === v));
  if (s2345Cards.every(Boolean)) {
    straights.push(s2345Cards as Card[]);
  }
  
  if (straights.length === 0) return null;
  
  if (minMaxValue === null) {
    // 自由出牌，出最小的顺子
    return straights[0];
  }
  
  // 找能压的最小顺子
  const beatingStraights = straights.filter(s => {
    const maxVal = getStraight4MaxValueFromCards(s);
    return maxVal > minMaxValue;
  });
  
  if (beatingStraights.length === 0) return null;
  return beatingStraights[0];
}

function getStraight4MaxValueFromCards(cards: Card[]): number {
  const vals = cards.map(c => c.value).sort((a, b) => a - b);
  if (JSON.stringify(vals) === JSON.stringify([0, 1, 2, 11])) return -1; // A234最小
  if (JSON.stringify(vals) === JSON.stringify([2, 3, 4, 12])) return 12; // 2345
  return vals[vals.length - 1];
}

// ==========================================
// 提示功能：推荐最优出牌
// ==========================================

/**
 * 从手牌中找出能压上一家的最小合法出牌（提示）
 * 若 lastPlay=null，返回手牌中价值最低的一组牌（优先对子/三张）
 * @returns 推荐出牌的 Card[]，null 表示只能过牌
 */
export function getHintCards(hand: Card[], lastPlay: Play | null): Card[] | null {
  if (hand.length === 0) return null;
  const sorted = sortCards(hand);

  if (!lastPlay) {
    // 自由出牌：优先出对子>三张>顺子>单张（最小的）
    const groups = groupByValue(sorted);
    const triples = Object.values(groups).filter(g => g.length >= 3).map(g => g.slice(0, 3));
    const pairs = Object.values(groups).filter(g => g.length >= 2).map(g => g.slice(0, 2));
    const straight = findBestStraight4(sorted, null);
    if (pairs.length > 0) return pairs[0];
    if (triples.length > 0) return triples[0];
    if (straight) return straight;
    return [sorted[0]];
  }

  // 找能压的最小牌组
  switch (lastPlay.type) {
    case 'single': {
      const bigger = sorted.filter(c => c.value > lastPlay.maxValue);
      return bigger.length > 0 ? [bigger[0]] : null;
    }
    case 'pair': {
      const gs = groupByValue(sorted);
      const valid = Object.values(gs)
        .filter(g => g.length >= 2 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 2));
      return valid.length > 0 ? valid[0] : null;
    }
    case 'triple': {
      const gs = groupByValue(sorted);
      const valid = Object.values(gs)
        .filter(g => g.length >= 3 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 3));
      return valid.length > 0 ? valid[0] : null;
    }
    case 'quad': {
      // 四张只能用更大的四张压
      const gs = groupByValue(sorted);
      const valid = Object.values(gs)
        .filter(g => g.length >= 4 && g[0].value > lastPlay.maxValue)
        .map(g => g.slice(0, 4));
      return valid.length > 0 ? valid[0] : null;
    }
    case 'straight4': {
      const better = findBestStraight4(sorted, lastPlay.maxValue);
      return better ?? null;
    }
    default:
      return null;
  }
}
