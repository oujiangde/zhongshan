
-- profiles: add is_banned column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- mailbox: add type, reward_diamonds, reward_claimed columns; rename is_claimed -> reward_claimed if needed
ALTER TABLE mailbox
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS reward_diamonds integer,
  ADD COLUMN IF NOT EXISTS reward_claimed boolean NOT NULL DEFAULT false;

-- Sync is_claimed data into reward_claimed if is_claimed exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mailbox' AND column_name='is_claimed') THEN
    UPDATE mailbox SET reward_claimed = is_claimed WHERE reward_claimed = false;
  END IF;
END $$;

-- Insert some sample system mails for demonstration
INSERT INTO mailbox (user_id, type, title, content, reward_beans, reward_diamonds, is_read, reward_claimed)
VALUES
  (NULL, 'system', '🎉 欢迎来到跑得快！', '感谢您加入跑得快大家庭！祝您游戏愉快，牌运亨通！新手礼包已发放，请查收。', 50, 5, false, false),
  (NULL, 'reward', '🎁 新手礼包', '恭喜获得新手专属豆子奖励！快去牌桌上大展身手吧！', 100, 0, false, false),
  (NULL, 'system', '📢 游戏更新公告', '本次更新优化了AI对战体验，修复了若干已知问题，感谢您的支持！', 0, 0, false, false);
