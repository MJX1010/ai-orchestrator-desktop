# ccstatusline 在 ccswitch 切换时被覆盖的维护方案

## 背景

- `ccstatusline` 把 `statusLine` 字段写入 `~/.claude/settings.json` 才能生效。
- `ccswitch` 把每个账号的整块 settings 存在 SQLite 里:
  - 数据库:`~/.cc-switch/cc-switch.db`
  - 表:`providers`
  - 字段:`settings_config`(整段 JSON blob)
- 切换账号时,`ccswitch` 用对应 profile 的 `settings_config` **整体覆盖写** `~/.claude/settings.json`。
- 因此 `statusLine` 不在任何一个 provider 的 `settings_config` 里时,每次切换都会被冲掉。

当前 Claude provider(`app_type='claude'`)共 5 个:
- `朱丽文-packyapi-1778139965182` (朱丽文-PackyAPI)
- `朱丽文-yescode-1778139968386` (朱丽文-YesCode)
- `毛局兴-packyapi-1778498050040` (毛局兴-PackyAPI)
- `毛局兴-yescode-1778498056131` (毛局兴-YesCode)
- `claude-official` (Claude Official)

---

## 方案 A(推荐):把 statusLine 写进每个 provider 的 settings_config

一次性把 `statusLine` 注入到所有 5 个 Claude profile 的 SQLite 记录里,之后任意切换都自带 statusLine,无感。

### 步骤

#### 1. 备份数据库

```bash
cp ~/.cc-switch/cc-switch.db ~/.cc-switch/cc-switch.db.bak-$(date +%Y%m%d_%H%M%S)
```

#### 2. 确定要注入的 statusLine 配置

两种来源,二选一:

**来源 1:从当前 `~/.claude/settings.json` 读(如果你已经手动加好了)**

```bash
jq '.statusLine' ~/.claude/settings.json
```

**来源 2:用 ccstatusline 标准默认配置**

```json
{
  "type": "command",
  "command": "npx -y ccstatusline@latest",
  "padding": 0
}
```

#### 3. 关闭 ccswitch 桌面应用

ccswitch 是托盘 GUI(`showInTray: true`),如果它持有 db 连接,UPDATE 可能写不进去。先从托盘退出。

#### 4. 注入 statusLine 到所有 Claude provider

下面是一个 Node.js 脚本(因为 jq + sqlite3 拼接 JSON 在 Windows 上转义很痛苦),保存为 `~/.cc-switch/inject-statusline.mjs`:

```javascript
// inject-statusline.mjs
// 用法: node inject-statusline.mjs
// 作用: 给所有 app_type='claude' 的 provider 注入/更新 statusLine 字段

import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';

const STATUSLINE = {
  type: 'command',
  command: 'npx -y ccstatusline@latest',
  padding: 0,
};

const dbPath = join(homedir(), '.cc-switch', 'cc-switch.db');
const db = new Database(dbPath);

const rows = db
  .prepare("SELECT id, name, settings_config FROM providers WHERE app_type = 'claude'")
  .all();

const update = db.prepare(
  "UPDATE providers SET settings_config = ? WHERE id = ? AND app_type = 'claude'"
);

const tx = db.transaction((rows) => {
  for (const row of rows) {
    const cfg = JSON.parse(row.settings_config);
    cfg.statusLine = STATUSLINE;
    update.run(JSON.stringify(cfg), row.id);
    console.log(`updated: ${row.name} (${row.id})`);
  }
});

tx(rows);
console.log(`\nDone. ${rows.length} provider(s) updated.`);
db.close();
```

执行:

```bash
cd ~/.cc-switch
npm init -y >/dev/null 2>&1
npm install better-sqlite3
node inject-statusline.mjs
```

> 如果不想装 npm 依赖,也可以用 Python(自带 sqlite3 模块,见附录)。

#### 5. 验证

```bash
sqlite3 ~/.cc-switch/cc-switch.db \
  "SELECT name, json_extract(settings_config, '\$.statusLine') FROM providers WHERE app_type='claude';"
```

每一行都应该输出 `statusLine` 的 JSON,不是 NULL。

#### 6. 启动 ccswitch,切换一次 profile,确认 statusLine 还在

```bash
jq '.statusLine' ~/.claude/settings.json
```

#### 7. 后续维护提示

- 在 ccswitch GUI 里**新增 / 编辑** profile 时,请确保 `statusLine` 字段保留(GUI 可能会有 "高级设置" 面板让你看到原始 JSON)。
- 升级 ccstatusline 或换 statusLine 内容时,重新跑一次 `inject-statusline.mjs`(改一下 `STATUSLINE` 常量即可)。

---

## 方案 B:走 project-level settings.local.json

Claude Code 合并 user-level (`~/.claude/settings.json`) 与 project-level (`<repo>/.claude/settings.local.json`) 配置。把 `statusLine` 放在 project 级,ccswitch 完全不会碰它。

### 步骤

在每个需要 statusLine 的项目根目录:

```bash
mkdir -p .claude
```

编辑 `.claude/settings.local.json`(注意此文件通常被 gitignore,不会污染 repo):

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0
  }
}
```

### 优劣

- 优点:不动 ccswitch 的 SQLite,升级 ccswitch 不会冲突。
- 缺点:**per-repo**,新项目得各自配。可以用一个 dotfile 模板批量铺。

---

## 方案 C:post-switch hook 重新注入(不推荐)

ccswitch 是托盘 GUI,没有官方 post-switch 钩子。可行的 hack:

- 用文件监听器(`chokidar` / Windows `Watch-FileChange`)盯 `~/.claude/settings.json`,被写入后自动 patch 加回 `statusLine`。
- 容易和 ccswitch 自身写入产生竞态;且 ccstatusline 升级时还要改 watcher。

不建议走这条路,留作存档。

---

## 附录:Python 版注入脚本(无需 npm 依赖)

保存为 `~/.cc-switch/inject_statusline.py`:

```python
# inject_statusline.py
# 用法: python inject_statusline.py

import json
import os
import sqlite3
from pathlib import Path

STATUSLINE = {
    "type": "command",
    "command": "npx -y ccstatusline@latest",
    "padding": 0,
}

db_path = Path.home() / ".cc-switch" / "cc-switch.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

rows = conn.execute(
    "SELECT id, name, settings_config FROM providers WHERE app_type = 'claude'"
).fetchall()

for row in rows:
    cfg = json.loads(row["settings_config"])
    cfg["statusLine"] = STATUSLINE
    conn.execute(
        "UPDATE providers SET settings_config = ? WHERE id = ? AND app_type = 'claude'",
        (json.dumps(cfg, ensure_ascii=False), row["id"]),
    )
    print(f"updated: {row['name']} ({row['id']})")

conn.commit()
conn.close()
print(f"\nDone. {len(rows)} provider(s) updated.")
```

执行:

```bash
python ~/.cc-switch/inject_statusline.py
```

---

## 回滚

如果出问题,从备份恢复:

```bash
# 先关闭 ccswitch 托盘
cp ~/.cc-switch/cc-switch.db.bak-<时间戳> ~/.cc-switch/cc-switch.db
```

ccswitch 自身也在 `~/.cc-switch/backups/` 里保留每日备份,可作为兜底。
