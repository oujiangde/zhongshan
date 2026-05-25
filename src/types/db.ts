// Supabase 数据库类型
export interface Profile {
  id: string;
  email: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  nickname: string;
  avatar_url: string | null;
  beans: number;
  diamonds: number;
  exp: number;
  level: number;
  total_games: number;
  wins: number;
  big_wins: number;
  is_online: boolean;
  is_banned: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  code: string;
  host_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  mode: 'ranked' | 'room' | 'ai';
  ai_difficulty: 'easy' | 'medium' | 'hard' | null;
  max_players: number;
  created_at: string;
  updated_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string | null;
  seat: number;
  is_ai: boolean;
  ai_difficulty: string | null;
  is_ready: boolean;
  joined_at: string;
}

export interface GameStateRow {
  id: string;
  room_id: string;
  round: number;
  state: Record<string, unknown>;
  current_player_seat: number;
  last_play: Record<string, unknown> | null;
  last_play_seat: number | null;
  phase: 'playing' | 'finished';
  created_at: string;
  updated_at: string;
}

export interface GameHistoryRow {
  id: string;
  room_id: string | null;
  round: number;
  players: Array<{
    user_id: string;
    seat: number;
    nickname: string;
    role: string;
    bean_change: number;
    remaining_cards: number;
  }>;
  result: Record<string, unknown>;
  duration_seconds: number;
  created_at: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number;
  required_value: number; // alias of condition_value
  reward_beans: number;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  progress: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  category: 'avatar_frame' | 'card_back' | 'table_skin';
  price_diamonds: number;
  image_url: string | null;
  is_active: boolean;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
}

export interface MailboxItem {
  id: string;
  user_id: string | null;
  type: 'system' | 'reward' | 'invite';
  title: string;
  content: string;
  reward_beans: number | null;
  reward_diamonds: number | null;
  is_read: boolean;
  reward_claimed: boolean;
  expires_at: string | null;
  created_at: string | null;
}

// Mail = MailboxItem alias
export type Mail = MailboxItem;
