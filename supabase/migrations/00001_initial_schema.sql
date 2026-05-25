
-- 用户角色类型
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- profiles 表
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  role user_role NOT NULL DEFAULT 'user',
  nickname text NOT NULL DEFAULT '玩家',
  avatar_url text,
  beans integer NOT NULL DEFAULT 1000,
  diamonds integer NOT NULL DEFAULT 0,
  exp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  total_games integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  big_wins integer NOT NULL DEFAULT 0,
  is_online boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 用户注册触发器
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 公开视图
CREATE VIEW public.public_profiles AS
  SELECT id, nickname, avatar_url, level, exp, total_games, wins, big_wins, beans, is_online, role
  FROM profiles;

-- 辅助函数：获取用户角色（防止无限递归）
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "管理员有完整权限" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY "用户可查看自己" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "用户可更新自己" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- 游戏房间表
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL DEFAULT LPAD(floor(random()*1000000)::text, 6, '0'),
  host_id uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished')),
  mode text NOT NULL DEFAULT 'ranked' CHECK (mode IN ('ranked','room','ai')),
  ai_difficulty text DEFAULT 'medium' CHECK (ai_difficulty IN ('easy','medium','hard')),
  max_players integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有已认证用户可查看房间" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "已认证用户可创建房间" ON rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "房主和管理员可更新房间" ON rooms FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR get_user_role(auth.uid()) = 'admin');

-- 房间玩家表
CREATE TABLE public.room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  seat integer NOT NULL CHECK (seat BETWEEN 0 AND 3),
  is_ai boolean NOT NULL DEFAULT false,
  ai_difficulty text DEFAULT 'medium',
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, seat)
);

ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有已认证用户可查看房间玩家" ON room_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "已认证用户可加入房间" ON room_players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR is_ai = true);
CREATE POLICY "玩家可更新自己的状态" ON room_players FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "玩家可离开房间" ON room_players FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 游戏状态表（存储完整游戏状态）
CREATE TABLE public.game_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  state jsonb NOT NULL DEFAULT '{}',
  current_player_seat integer NOT NULL DEFAULT 0,
  last_play jsonb,
  last_play_seat integer,
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing','finished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "房间内玩家可查看游戏状态" ON game_states FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM room_players WHERE room_id = game_states.room_id AND user_id = auth.uid())
  OR get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "房间内玩家可更新游戏状态" ON game_states FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM room_players WHERE room_id = game_states.room_id AND user_id = auth.uid())
);
CREATE POLICY "已认证用户可创建游戏状态" ON game_states FOR INSERT TO authenticated WITH CHECK (true);

-- 对局历史表
CREATE TABLE public.game_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  round integer NOT NULL DEFAULT 1,
  players jsonb NOT NULL DEFAULT '[]',
  result jsonb NOT NULL DEFAULT '{}',
  duration_seconds integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的对局历史" ON game_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jsonb_array_elements(players) AS p WHERE (p->>'user_id')::uuid = auth.uid())
    OR get_user_role(auth.uid()) = 'admin'
  );
CREATE POLICY "已认证用户可插入历史" ON game_history FOR INSERT TO authenticated WITH CHECK (true);

-- 排行榜视图
CREATE VIEW public.leaderboard AS
  SELECT id, nickname, avatar_url, level, beans, total_games, wins, big_wins,
    RANK() OVER (ORDER BY beans DESC) AS rank
  FROM profiles
  WHERE role = 'user'
  ORDER BY beans DESC;

-- 成就定义表
CREATE TABLE public.achievement_defs (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🏆',
  condition_type text NOT NULL,
  condition_value integer NOT NULL,
  reward_beans integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.achievement_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有人可查看成就定义" ON achievement_defs FOR SELECT USING (true);
CREATE POLICY "管理员可管理成就定义" ON achievement_defs FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin');

-- 用户成就表
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievement_defs(id),
  progress integer NOT NULL DEFAULT 0,
  unlocked boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的成就" ON user_achievements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "用户可更新自己的成就" ON user_achievements FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "系统可插入用户成就" ON user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 商品表
CREATE TABLE public.shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('avatar_frame','card_back','table_skin')),
  price_diamonds integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有人可查看商品" ON shop_items FOR SELECT USING (is_active = true);
CREATE POLICY "管理员可管理商品" ON shop_items FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin');

-- 用户购买记录
CREATE TABLE public.user_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES shop_items(id),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的购买记录" ON user_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "用户可购买商品" ON user_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 好友表
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的好友关系" ON friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "用户可发送好友请求" ON friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "用户可更新好友关系" ON friendships FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- 邮箱/消息表
CREATE TABLE public.mailbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  reward_beans integer NOT NULL DEFAULT 0,
  is_read boolean NOT NULL DEFAULT false,
  is_claimed boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mailbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的邮件" ON mailbox FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "用户可更新自己的邮件" ON mailbox FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "管理员可发送邮件" ON mailbox FOR INSERT TO authenticated
  WITH CHECK (get_user_role(auth.uid()) = 'admin' OR user_id IS NULL OR auth.uid() = user_id);

-- 系统配置表
CREATE TABLE public.system_configs (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "所有人可读取系统配置" ON system_configs FOR SELECT USING (true);
CREATE POLICY "管理员可管理系统配置" ON system_configs FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin');

-- 玩家皮肤设置
CREATE TABLE public.user_skins (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  card_back_item_id uuid REFERENCES shop_items(id),
  table_skin_item_id uuid REFERENCES shop_items(id),
  avatar_frame_item_id uuid REFERENCES shop_items(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_skins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户可查看自己的皮肤设置" ON user_skins FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "用户可更新自己的皮肤" ON user_skins FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "用户可插入皮肤设置" ON user_skins FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 插入默认成就
INSERT INTO public.achievement_defs (id, name, description, icon, condition_type, condition_value, reward_beans) VALUES
  ('first_win', '初出茅庐', '赢得第一场对局', '🎉', 'wins', 1, 50),
  ('win_10', '小试牛刀', '累计赢得10场对局', '🥉', 'wins', 10, 100),
  ('win_50', '棋逢对手', '累计赢得50场对局', '🥈', 'wins', 50, 300),
  ('win_100', '百战百胜', '累计赢得100场对局', '🥇', 'wins', 100, 500),
  ('games_10', '入门选手', '累计游戏10场', '🃏', 'total_games', 10, 50),
  ('games_50', '资深玩家', '累计游戏50场', '🎴', 'total_games', 50, 150),
  ('games_100', '游戏达人', '累计游戏100场', '🎯', 'total_games', 100, 300),
  ('big_win_10', '大赢家', '累计成为大赢家10次', '👑', 'big_wins', 10, 200);

-- 插入默认系统配置
INSERT INTO public.system_configs (key, value, description) VALUES
  ('game_beans_reward', '{"big_win_base": 3, "small_win_base": 1}', '游戏豆子奖励配置'),
  ('match_timeout', '{"seconds": 30}', '匹配超时秒数'),
  ('turn_timeout', '{"seconds": 20}', '每轮出牌超时秒数');
