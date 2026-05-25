#!/usr/bin/env python3
"""
推送项目文件到 GitHub
用法:
  export GITHUB_TOKEN=你的token
  python3 scripts/push-to-github.py [提交信息]

或者直接:
  GITHUB_TOKEN=xxx python3 scripts/push-to-github.py "提交信息"
"""
import os, sys, base64, json
from urllib import request
from pathlib import Path

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = "oujiangde/zhongshan"
PROJECT_ROOT = Path(__file__).parent.parent

if not GITHUB_TOKEN:
    print("❌ 请先设置环境变量 GITHUB_TOKEN")
    sys.exit(1)

# 需要推送的文件列表（相对于项目根目录）
PUSH_FILES = [
    "src/app/(app)/game.tsx",
    "src/app/(app)/home.tsx",
    "src/app/(app)/lobby.tsx",
    "src/app/(app)/profile.tsx",
    "src/app/(app)/achievements.tsx",
    "src/app/(app)/history.tsx",
    "src/app/(app)/leaderboard.tsx",
    "src/app/(app)/settings.tsx",
    "src/app/(app)/_layout.tsx",
    "src/app/(auth)/sign-in.tsx",
    "src/app/_layout.tsx",
    "src/app/index.tsx",
    "src/db/api.ts",
    "src/types/game.ts",
    "src/types/db.ts",
    "src/utils/gameLogic.ts",
    "src/client/supabase.ts",
    "app.json",
    "package.json",
    "tailwind.config.js",
    "babel.config.js",
    "metro.config.js",
]

def api_call(method, path, data=None):
    url = f"https://api.github.com/repos/{REPO}/{path}"
    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json",
    }
    body = json.dumps(data).encode() if data else None
    req = request.Request(url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

def get_sha(filepath):
    result = api_call("GET", f"contents/{filepath}")
    return result.get("sha", "")

def push_file(filepath, commit_msg):
    local_path = PROJECT_ROOT / filepath
    if not local_path.exists():
        print(f"  跳过（不存在）: {filepath}")
        return False
    content = base64.b64encode(local_path.read_bytes()).decode()
    sha = get_sha(filepath)
    data = {"message": commit_msg, "content": content}
    if sha:
        data["sha"] = sha
    result = api_call("PUT", f"contents/{filepath}", data)
    if "content" in result:
        print(f"  ✅ {filepath}")
        return True
    else:
        print(f"  ❌ {filepath}: {result.get('message', result)}")
        return False

if __name__ == "__main__":
    commit_msg = sys.argv[1] if len(sys.argv) > 1 else "自动推送更新"
    print(f"\n🚀 推送到 github.com/{REPO}")
    print(f"   提交信息: {commit_msg}\n")
    ok, fail = 0, 0
    for f in PUSH_FILES:
        if push_file(f, commit_msg):
            ok += 1
        else:
            fail += 1
    print(f"\n完成: {ok} 成功, {fail} 跳过/失败")
    print(f"仓库: https://github.com/{REPO}\n")
