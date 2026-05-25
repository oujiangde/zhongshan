
-- 应用版本管理表
CREATE TABLE IF NOT EXISTS app_versions (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  version     text NOT NULL,              -- 版本号，如 "1.0.20"
  version_code integer NOT NULL,          -- 数字版本，用于比较大小，如 20
  download_url text NOT NULL DEFAULT '',  -- APK 下载链接
  changelog   text NOT NULL DEFAULT '',   -- 更新内容说明
  force_update boolean NOT NULL DEFAULT false, -- 是否强制更新
  is_active   boolean NOT NULL DEFAULT true,   -- 是否为当前最新版
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 索引：快速找最新版本
CREATE INDEX IF NOT EXISTS idx_app_versions_active ON app_versions (is_active, version_code DESC);

-- RLS：所有人可读（需要检查更新），只有管理员可写
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人可查询版本信息" ON app_versions
  FOR SELECT USING (true);

-- 插入当前版本记录（v1.0.19，对应已发布的安装包）
INSERT INTO app_versions (version, version_code, download_url, changelog, force_update, is_active)
VALUES ('1.0.19', 19, '', '初始版本', false, true);
