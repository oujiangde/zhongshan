import { supabase } from '@/client/supabase';
import type { Profile, Room, RoomPlayer, GameStateRow, GameHistoryRow, MailboxItem, ShopItem, AchievementDef, UserAchievement, Friendship } from '@/types/db';

// ==========================================
// 用户相关
// ==========================================

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<void> {
  await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function setOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
  await supabase.from('profiles').update({ is_online: isOnline, last_seen_at: new Date().toISOString() }).eq('id', userId);
}

export async function getLeaderboard(limit = 50): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id,nickname,avatar_url,level,beans,total_games,wins,big_wins')
    .eq('role', 'user')
    .order('beans', { ascending: false })
    .limit(limit);
  return Array.isArray(data) ? data as Profile[] : [];
}

export async function getUserRank(userId: string): Promise<number> {
  const profile = await getProfile(userId);
  if (!profile) return 0;
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user')
    .gt('beans', profile.beans);
  return (count ?? 0) + 1;
}

// ==========================================
// 房间相关
// ==========================================

export async function createRoom(hostId: string, mode: Room['mode']): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .insert({ host_id: hostId, mode, status: 'waiting' })
    .select()
    .maybeSingle();
  return data;
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .maybeSingle();
  return data;
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle();
  return data;
}

export async function updateRoomStatus(roomId: string, status: Room['status']): Promise<void> {
  await supabase.from('rooms').update({ status, updated_at: new Date().toISOString() }).eq('id', roomId);
}

export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .order('seat');
  return Array.isArray(data) ? data : [];
}

export async function joinRoom(roomId: string, userId: string, seat: number): Promise<void> {
  await supabase.from('room_players').insert({ room_id: roomId, user_id: userId, seat });
}

export async function addAIPlayer(roomId: string, seat: number, difficulty: string): Promise<void> {
  await supabase.from('room_players').insert({
    room_id: roomId,
    user_id: null,
    seat,
    is_ai: true,
    ai_difficulty: difficulty,
  });
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', userId);
}

// 快速匹配：找一个等待中的ranked房间
export async function findMatchRoom(): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'waiting')
    .eq('mode', 'ranked')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data;
}

export async function countRoomPlayers(roomId: string): Promise<number> {
  const { count } = await supabase
    .from('room_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('is_ai', false);
  return count ?? 0;
}

// ==========================================
// 游戏状态
// ==========================================

export async function createGameState(roomId: string, state: Record<string, unknown>): Promise<GameStateRow | null> {
  const { data } = await supabase
    .from('game_states')
    .insert({ room_id: roomId, state, phase: 'playing' })
    .select()
    .maybeSingle();
  return data;
}

export async function getGameState(roomId: string): Promise<GameStateRow | null> {
  const { data } = await supabase
    .from('game_states')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function updateGameState(
  gameStateId: string,
  updates: Partial<GameStateRow>
): Promise<void> {
  await supabase
    .from('game_states')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', gameStateId);
}

// ==========================================
// 对局历史
// ==========================================

export async function saveGameHistory(
  roomId: string,
  round: number,
  players: GameHistoryRow['players'],
  result: Record<string, unknown>,
  durationSeconds: number
): Promise<void> {
  await supabase.from('game_history').insert({
    room_id: roomId,
    round,
    players,
    result,
    duration_seconds: durationSeconds,
  });
}

export async function getMyGameHistory(userId: string, page = 0, pageSize = 20): Promise<GameHistoryRow[]> {
  // 直接取最近记录，客户端过滤包含当前用户的对局
  const { data } = await supabase
    .from('game_history')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize + pageSize - 1); // 多取一些供客户端过滤
  if (!Array.isArray(data)) return [];
  return data.filter(row =>
    Array.isArray(row.players) && row.players.some((p: { user_id: string }) => p.user_id === userId)
  ).slice(0, pageSize);
}

// ==========================================
// 豆子更新
// ==========================================

export async function updateBeans(userId: string, change: number): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;
  const newBeans = Math.max(0, profile.beans + change);
  await supabase.from('profiles').update({ beans: newBeans, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function updateDiamonds(userId: string, change: number): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;
  const newDiamonds = Math.max(0, profile.diamonds + change);
  await supabase.from('profiles').update({ diamonds: newDiamonds, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function updateGameStats(userId: string, isWin: boolean, isBigWin: boolean): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;
  await supabase.from('profiles').update({
    total_games: profile.total_games + 1,
    wins: isWin ? profile.wins + 1 : profile.wins,
    big_wins: isBigWin ? profile.big_wins + 1 : profile.big_wins,
    exp: profile.exp + (isBigWin ? 50 : isWin ? 30 : 10),
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
}

// ==========================================
// 成就
// ==========================================

export async function getAchievementDefs(): Promise<AchievementDef[]> {
  const { data } = await supabase.from('achievement_defs').select('*');
  return Array.isArray(data) ? data : [];
}

export async function getUserAchievements(userId: string): Promise<UserAchievement[]> {
  const { data } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId);
  return Array.isArray(data) ? data : [];
}

export async function upsertAchievementProgress(
  userId: string,
  achievementId: string,
  progress: number,
  unlocked: boolean
): Promise<void> {
  await supabase.from('user_achievements').upsert({
    user_id: userId,
    achievement_id: achievementId,
    progress,
    unlocked,
    unlocked_at: unlocked ? new Date().toISOString() : null,
  }, { onConflict: 'user_id,achievement_id' });
}

// ==========================================
// 商城
// ==========================================

export async function getShopItems(): Promise<ShopItem[]> {
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .eq('is_active', true)
    .order('category');
  return Array.isArray(data) ? data : [];
}

export async function purchaseItem(userId: string, itemId: string, priceDiamonds: number): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile(userId);
  if (!profile) return { success: false, error: '用户不存在' };
  if (profile.diamonds < priceDiamonds) return { success: false, error: '钻石不足' };

  // 检查是否已购买
  const { data: existing } = await supabase
    .from('user_purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .maybeSingle();
  if (existing) return { success: false, error: '已拥有此商品' };

  // 扣钻石
  await supabase.from('profiles').update({ diamonds: profile.diamonds - priceDiamonds }).eq('id', userId);
  // 记录购买
  await supabase.from('user_purchases').insert({ user_id: userId, item_id: itemId });
  return { success: true };
}

export async function getUserPurchases(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_purchases')
    .select('item_id')
    .eq('user_id', userId);
  return Array.isArray(data) ? data.map(d => d.item_id) : [];
}

// ==========================================
// 好友
// ==========================================

export async function getFriends(userId: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id,addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (!data) return [];
  const friendIds = data.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
  if (friendIds.length === 0) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,nickname,avatar_url,level,is_online,beans')
    .in('id', friendIds);
  return Array.isArray(profiles) ? profiles as Profile[] : [];
}

export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<void> {
  await supabase.from('friendships').insert({ requester_id: requesterId, addressee_id: addresseeId });
}

export async function respondFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  await supabase.from('friendships').update({
    status: accept ? 'accepted' : 'blocked',
    updated_at: new Date().toISOString(),
  }).eq('id', friendshipId);
}

export async function getPendingFriendRequests(userId: string): Promise<Friendship[]> {
  const { data } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  return Array.isArray(data) ? data : [];
}

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id,nickname,avatar_url,level')
    .ilike('nickname', `%${query}%`)
    .limit(20);
  return Array.isArray(data) ? data as Profile[] : [];
}

// ==========================================
// 邮箱
// ==========================================

export async function getMailbox(userId: string): Promise<MailboxItem[]> {
  const { data } = await supabase
    .from('mailbox')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

export async function markMailRead(mailId: string): Promise<void> {
  await supabase.from('mailbox').update({ is_read: true }).eq('id', mailId);
}
export async function claimMailReward(
  mailId: string,
  userId: string,
  rewardBeans: number,
  rewardDiamonds = 0
): Promise<void> {
  await supabase.from('mailbox').update({ reward_claimed: true }).eq('id', mailId);
  if (rewardBeans > 0) await updateBeans(userId, rewardBeans);
  if (rewardDiamonds > 0) await updateDiamonds(userId, rewardDiamonds);
}

// ==========================================
// 管理员
// ==========================================

export async function getAllUsers(page = 0, pageSize = 50): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  return Array.isArray(data) ? data : [];
}

export async function banUser(userId: string, banned: boolean): Promise<void> {
  await supabase.from('profiles').update({ is_banned: banned, updated_at: new Date().toISOString() }).eq('id', userId);
}

export async function getAdminStats(): Promise<{ totalUsers: number; totalGames: number; todayGames: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [usersRes, gamesRes, todayRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user'),
    supabase.from('game_history').select('*', { count: 'exact', head: true }),
    supabase.from('game_history').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
  ]);
  return {
    totalUsers: usersRes.count ?? 0,
    totalGames: gamesRes.count ?? 0,
    todayGames: todayRes.count ?? 0,
  };
}

export async function sendSystemMail(title: string, content: string, rewardBeans: number): Promise<void> {
  await supabase.from('mailbox').insert({
    user_id: null,
    type: 'system',
    title,
    content,
    reward_beans: rewardBeans > 0 ? rewardBeans : null,
    reward_diamonds: null,
    is_read: false,
    reward_claimed: false,
  });
}
