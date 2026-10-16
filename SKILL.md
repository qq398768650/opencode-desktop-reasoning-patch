---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）的聊天「思考」块打补丁，实现流式中展开、思考结束后不立刻折叠（等下一段思考开始、或正文结果出来时才折成一行）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了/升级后要重新打补丁」时使用。
---

# opencode 桌面端「思考折叠」补丁

## 背景

opencode 桌面端的界面打包在 `<安装目录>\resources\app.asar` 里，升级会整体覆盖，所以**每次升级后补丁都会丢**，需要重新打一次。官方 2.0.x 原生只有「默认展开」或「默认折叠」两种静态行为，没有「流式展开 → 结束自动折叠」这套。

老板要的效果（2026-10-15 确认）：

1. 流式思考时**展开**显示正文
2. 思考结束后**不立刻折叠**：一直摊着，直到「同一条消息里下一段思考开始」或「正文结果出来了」才折成一行
3. 折起后点标题可展开
4. 展开状态下：点底部「收起 ▴」按钮、或**双击空白处**、或再点标题，都能收起
5. 手动开合状态在界面重渲染/滚动后**不被重置**

## 怎么做

脚本都在本技能目录下（`~/.config/opencode/skills/desktop-reasoning-patch/`）：

```bash
cd ~/.config/opencode/skills/desktop-reasoning-patch

# 1. 先看会改什么（dry-run，不动文件、不动进程）
node apply-patch.mjs

# 2. 真正写入（会自动：关掉桌面端 → 备份官方版为 app.asar.bak-<版本号> → 写补丁 → 再开回来）
node apply-patch.mjs --write

# 3. 等它起来后验证：点一下能收起/展开，历史思考块默认折叠
node verify.mjs
```

一条 `--write` 就够（关/开桌面端都自动做了，不会断会话：agent 跑在后端 `opencode-cli.exe serve --service` 里）。`restart.mjs` 只在想单独重启时用。

`verify.mjs` 需要页面上有一个会话、且会话里有已完成的思考块。如果它报「没找到思考块」，让老板打开一个聊天再跑一次。

## 补丁做了什么（5 处，都在 renderer 的某个 chunk 里）

目标 chunk 不写死文件名，脚本会自动在所有 `/out/renderer/assets/*.js` 里找含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的那个。

| 标记 | 改什么 |
|---|---|
| P1 | `i()`（思考块是否展开）改成：流式中恒 true；否则优先本地 store `n.open`，其次 `globalThis.__ocReasoningOpen` 这张 Map（跨重挂载记忆），都没有时回退到 `!_later$()` —— 后面还没出现下一段思考/正文时**保持展开**（这是「思考结束先别收」的关键：思考结束时组件会卸载重挂载，光靠「不主动收」撑不住）。**同时**把 `_rx$`（全局 Map）、`_stream$`（`!!(e.streaming && e.content?.time?.completed === void 0)`）、`_later$` 声明进同一个 `let` 列表 |
| P4 | 摘掉 `get open()` 里 `?? (timelineDetail.thinking.details === 'expanded' : void 0)` 这个兜底 —— 就是它让每个思考块默认恒为展开 |
| P8 | `onOpenChange` 把用户的开合状态记进 `_rx$`（流式期间的 spurious `true` 不记），并把 `open` 写进本地 store 做即时反馈 |
| P2+P3 | 底部加「收起 ▴」按钮、根节点加双击空白收起；**折叠时机**用 `_later$()`：后面出现「带收起按钮的思考块」（= 下一段思考开始）或「非工具行、有文字的正文块」（= 出结果）时收一次；工具调用行（含 `.tool-collapsible`）不算，否则每轮思考完一调工具就立刻收起。用 `MutationObserver` 盯 `document.body`（200ms 节流、收一次就 disconnect）；手动开合过的块（`_rx$` 里有记录）不自动收 |

## 坑（务必记住）

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → **Electron 启动失败，进程直接退出，连日志目录都不建**。`apply-patch.mjs` 已处理（`padEnd(jsonLen, ' ')` 且变长就报错）。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 直接「加载应用程序时发生错误」。脚本现在直接沿用原版 `dataStart` 并照抄尾部 padding 字节。
- 补丁是字符串替换，**替换出来的代码必须自检**：曾经因为分组数对不上，写出 `undefined.open` 让渲染进程崩（页面显示「加载应用程序时发生错误」）。脚本现在有自检（产物里出现 `undefined.<prop>` 就报错）。
- 启动失败时看渲染进程日志找真因：`%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的 `TypeError: ...` + 堆栈直接指向出错 chunk 的 `行:列`（对着抽出来的 chunk 数一下就知道是哪处替换）。
- 改 asar **必须完全退出桌面端**再做，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已经变了）。
- 桌面端（`OpenCode.exe`）和后端（`opencode-cli.exe serve --service`）是两个进程：关掉窗口/重启桌面端**不会**重启后端，agent 会话不会断。所以可以放心 `taskkill /IM OpenCode.exe /F` 再重开。
- 官方原版备份命名 `app.asar.bak-<版本号>`（例如 `app.asar.bak-2.0.29`）。脚本发现已打过补丁又没有备份时会拒绝执行。
- 安装目录可能变（1.19.0 是 `@opencode-aidesktop`），脚本按「目录里有 `OpenCode.exe` 且 `resources\app.asar` 存在」来找。

## 升级后锚点找不到怎么办

opencode 升级后 minified 代码会变，`apply-patch.mjs` 会明确报「锚点没找到」。此时：

1. 从 asar 里抽出所有 `/out/renderer/assets/*.js`（或用 `--dump` 思路手工抽），搜 `defaultOpen`、`data-timeline-part-id`、`ui.message.thought` 定位思考组件所在的 chunk。
2. 看新版 `i=()=>...`（思考块展开状态）、`get open(){...}`、`onOpenChange:t=>{...}` 这三处的实际写法，更新 `apply-patch.mjs` 里的 `P1_FIND / P4_FIND / P8_FIND / P2_FIND`。
3. 重跑 dry-run，确认 5 处都 OK 再 `--write`。

历史版本对照：
- 2.0.29：目标 chunk `/out/renderer/assets/route-4O9GzN5h.js`（350831 字节），asar 176333529 → 约 176334560
- 2.0.30：目标 chunk `/out/renderer/assets/route-CPNDqx0F.js`（355075 → 356889 字节），asar 176341661 → 176343475；`jsonLen` 2172835、`dataStart` 2172852 都不变
