---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）打两组补丁：①聊天「思考」块流式中展开、思考结束后不立刻折叠（整块滚出视口上方才折成一行，折叠时补偿滚动、下方内容不动）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留；②首页每个会话行悬停时显示垃圾桶删除按钮，点击走官方删除确认框，**按住 Shift 点击直接删（不弹确认框）**，另有「多选删除」模式（右下角悬浮条或会话右键菜单进入，勾选多行一次删完）。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了 / 首页删除按钮没了 / 删除太麻烦 / 升级后要重新打补丁」时使用。
---

# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮）

## 背景

opencode 桌面端的界面打包在 `<安装目录>\resources\app.asar` 里，升级会整体覆盖，所以**每次升级后补丁都会丢**，需要重新打一次。

- 思考折叠：官方 2.0.x 原生只有「默认展开」或「默认折叠」两种静态行为，没有「流式展开 → 结束自动折叠」这套。
- 首页删除按钮：官方代码里删除按钮**已经写好**，只是开关被写死成关闭（只暴露了「归档」）。补丁把开关打开、换成垃圾桶图标、接上官方 `onDeleteSession`。

老板要的效果（2026-10-15 确认思考折叠；2026-10-16 要求合并首页删除按钮并发布新版本）：

1. 流式思考时**展开**显示正文
2. 思考结束后**不立刻折叠**：一直摊着，直到这块**整块滚出视口上方**（看不见了）才折成一行；折叠瞬间补偿滚动，下方内容原地不动，等于无感
3. 折起后点标题可展开
4. 展开状态下：点底部「收起 ▴」按钮、或**双击空白处**、或再点标题，都能收起
5. 手动开合状态在界面重渲染/滚动后**不被重置**
6. 首页每个会话行悬停时显示垃圾桶按钮，点击弹官方删除确认框，确认后删除该会话
7. 一次删很多要方便（2026-10-18 新增）：①**按住 Shift 点垃圾桶** → 跳过确认框直接删；②**多选删除**：右下角悬浮条点「多选删除」（或会话右键菜单选「多选删除」）进多选模式，点行勾选、可「全选」，按「删除 N」→「确认删除 N」一次删完

## 怎么做

脚本都在本目录下（仓库 clone、或 `~/.config/opencode/skills/<name>/`）：

```bash
# 1. 先看会改什么（dry-run，不动文件、不动进程）
node apply-patch.mjs

# 2. 真正写入（会自动：关掉桌面端 → 备份官方版为 app.asar.bak-<版本号> → 写补丁 → 再开回来）
node apply-patch.mjs --write

# 3. 等它起来后验证：点一下能收起/展开，历史思考块默认折叠
node verify.mjs

# 4. 想撤销补丁、回到官方原版（自动关桌面端 → 用 app.asar.bak-<版本号> 盖回 → 再开回来）
node apply-patch.mjs --restore
```

只把产物打出来、不动安装目录也不关进程（离线检查 / 手动部署用）：

```bash
node apply-patch.mjs --out patched.asar
```

一条 `--write` 就够（关/开桌面端都自动做了，不会断会话：agent 跑在后端 `opencode-cli.exe serve --service` 里）。`restart.mjs` 只在想单独重启时用。

`verify.mjs` 需要页面上有一个会话、且会话里有已完成的思考块。如果它报「没找到思考块」，让老板打开一个聊天再跑一次。

不想开调试口时用静态校验：`node verify.mjs --static`（自动找安装目录，也可 `--asar <path>` 指定某个 asar）——直接检查 asar 里两组补丁的 9 个标记，全在才退出码 0。

删除/多选补丁的行为验证：`node verify.mjs --delete`（同样要桌面端带调试口）——检查首页行上有垃圾桶按钮、右下角悬浮条在、`__ocMultiEnter$`/`__ocRegRow$`/`__ocDeleteApi$` 三个全局钩子已注入。**需要先切到首页**（在会话视图里 `[data-session-id]` 为 0，会报失败）。它只做存在性检查，不会真删东西。

**测试脚本改动时不要直接 `--write`**（它会 `taskkill` 掉真实桌面端）。用假安装目录跑 dry-run / `--out`：

```bash
LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
# /tmp/fakelocal/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
```

## 补丁做了什么

两组补丁在同一次运行里全部打上，**任一目标锚点对不上就整体报错、不写文件**。

### 一、思考折叠（目标 chunk：含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的 `route-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| P1 | `i()`（思考块是否展开）改成：流式中恒 true；否则优先本地 store `n.open`，其次 `globalThis.__ocReasoningOpen` 这张 Map（跨重挂载记忆），都没有时回退到 `!_later$()` —— `_later$` 现在要求「本块已整块滚出视口上方（`rect.height>0 && rect.bottom<=0`）**且** 后面出现下一段思考/正文」，任一不满足就**保持展开**。**同时**把 `_rx$`（全局 Map）、`_stream$`（`!!(e.streaming && e.content?.time?.completed === void 0)`）、`_later$` 声明进同一个 `let` 列表 |
| P4 | 摘掉 `get open()` 里 `?? (timelineDetail.thinking.details === 'expanded' : void 0)` 这个兜底 —— 就是它让每个思考块默认恒为展开 |
| P8 | `onOpenChange` 把用户的开合状态记进 `_rx$`（流式期间的 spurious `true` 不记），并把 `open` 写进本地 store 做即时反馈 |
| P2 | 底部加「收起 ▴」按钮、根节点加双击空白收起；**折叠时机** = `_later$()`：本块**整块滚出视口上方**（`rect.height>0 && rect.bottom<=0`）**且**后面出现「带收起按钮的思考块」或「非工具行、有文字的正文块」；工具调用行（含 `.tool-collapsible`）不算，否则每轮思考完一调工具就立刻收起。触发源有两个：`MutationObserver` 盯 `document.body`（200ms 节流、收一次就 disconnect），加一个全局 `scroll` 捕获监听（scroll 不冒泡，必须 `capture:true`；120ms 节流）扫描 `globalThis.__ocFoldQ$` 里注册的块。手动开合过的块（`_rx$` 里有记录）不自动收。**折叠时做滚动锚定**（`_anchor$`）：折叠前记下本块相对视口的位置，折叠后按差值补偿滚动容器的 `scrollTop`（块完全滚到视口上方时用底边做锚点，否则用顶边），否则翻历史时块一收，视口就被带偏；补偿要放在 `queueMicrotask` 里再补一次（微任务在渲染前执行，先画错位再补会闪一帧），`rAF` 只做兜底，且节点已卸载（`!n.isConnected`）时直接跳过 |

### 二、首页会话删除按钮（目标 chunk：含 `e.onArchiveSession(e.record.session)` 的 `main-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| D1 | 开关 `,bie=!1,xie=500;` → `,bie=!0,xie=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）定义；然后把多选删除 UI 的 IIFE（`D_MULTI_JS`）作为**独立语句**接在声明之后（`…ZZ_TRASH_ICON=…;(function(){…})();`）——为什么不能直接塞进那个逗号列表，见下面「坑」 |
| D2 | 文案 `common.archive` → `common.delete` |
| D3 | `data-action` `` `home-session-archive` `` → `` `home-session-delete` `` |
| D4 | 图标 `F(jP,{name:\`archive\`})` → `get icon(){return globalThis.__ocRegRow$&&globalThis.__ocRegRow$(e.server,e.record.session),globalThis.__ocDeleteApi$=e.onDeleteSession,F(ZZ_TRASH_ICON,{})}`（顺手把「行 → 会话对象」注册进 `__ocRowMap$`、把官方 `onDeleteSession` 存到 `__ocDeleteApi$` 供批量删用） |
| D5 | `aria-label` `common.archive` → `common.delete` |
| D6 | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层：记下旧 `__ocSkipConfirm`，置为 `!!t.shiftKey`，`try{ e.onDeleteSession(e.server,e.record.session) }finally{ 还原 }` —— 这样 **Shift+点击直接删、普通点击照旧弹确认框** |
| D7 | `showDelete` 加旁路：`(e,t)=>globalThis.__ocSkipConfirm?v(e,t):r.show(…确认框…)`（`v` 是同作用域里的官方内部删除函数，跳过确认框直接 `data.session.remove`）。`onDeleteSession` 就是 `sessions.session.showDelete`，所以行按钮/右键/批量三条路都走这里 |
| D8 | 会话右键菜单的「删除」项后面追加一项「多选删除」，`onSelect` 调 `globalThis.__ocMultiEnter$(e.server,e.record.session)` 进多选模式并选中该行 |

两个目标 chunk 必须**串行**重建：每替换一个文件会平移其后所有文件的 offset，第二个要在第一个的结果上继续（脚本里就是 `let out = source; for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。

## 坑（务必记住）

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → **Electron 启动失败，进程直接退出，连日志目录都不建**。`apply-patch.mjs` 已处理（`padEnd(jsonLen, ' ')` 且变长就报错）。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 直接「加载应用程序时发生错误」。脚本现在直接沿用原版 `dataStart` 并照抄尾部 padding 字节。
- 补丁是字符串替换，**替换出来的代码必须自检**：曾经因为分组数对不上，写出 `undefined.open` 让渲染进程崩（页面显示「加载应用程序时发生错误」）。脚本现在有自检（产物里出现 `undefined.<prop>` 就报错，另外检查 `home-session-delete` / 垃圾桶图标 / `showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):` / `globalThis.__ocMultiEnter$` / `__ocRegRow$` / `data-oc-multi` 都在、`e.onArchiveSession(` 与 `home-session-archive` 已消失）。
- **往 minified 的 `var`/`let` 声明列表里插东西，只能插 `name=expr` 形式的 declarator**：D1 锚点 `…,yie=B(…),bie=!1,xie=500;` 就是一条 `var` 声明，直接用逗号接一个 IIFE（`,(function(){…})()`）会 `SyntaxError: Unexpected token '('`——而且 `node --check` 只会把这口锅扣在**整行 chunk**（压缩后整个 bundle 就几行）上，行号完全没用。要么给 IIFE 一个赋值目标（`ZZ_X$=(function(){…})()`），要么像现在这样放到声明结尾 `;` 之后当独立语句。
- 校验 asar 时注意：`node_modules/@lydell/node-pty-win32-x64/*` 这类文件属于 `app.asar.unpacked`，数据不在 asar 内，拿 asar 里的字节比对 integrity **必然 mismatch**——官方原版同样 mismatch（18 个），别误判成补丁打坏了。
- 启动失败时看渲染进程日志找真因：`%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的 `TypeError: ...` + 堆栈直接指向出错 chunk 的 `行:列`（对着抽出来的 chunk 数一下就知道是哪处替换）。
- 改 asar **必须完全退出桌面端**再做，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已经变了）。
- 桌面端（`OpenCode.exe`）和后端（`opencode-cli.exe serve --service`）是两个进程：关掉窗口/重启桌面端**不会**重启后端，agent 会话不会断。所以可以放心 `taskkill /IM OpenCode.exe /F` 再重开。
- 官方原版备份命名 `app.asar.bak-<版本号>`（例如 `app.asar.bak-2.0.30`）。脚本发现已打过补丁又没有备份时会拒绝执行。
- 安装目录可能变（1.19.0 是 `@opencode-aidesktop`），脚本按「目录里有 `OpenCode.exe` 且 `resources\app.asar` 存在」来找。
- 老板本机曾出现：`app.asar.orig` 是旧版 2.0.29、安装目录是 2.0.30，用旧备份重放会把 renderer **降级**。判断版本要对比 asar 内 `/package.json` 的 `version` 和 `OpenCode.exe` 的 ProductVersion，别只看备份文件。

## 升级后锚点找不到怎么办

opencode 升级后 minified 代码会变，`apply-patch.mjs` 会明确报「锚点没找到」。此时：

1. 从 asar 里抽出所有 `/out/renderer/assets/*.js`，思考组件搜 `defaultOpen`、`data-timeline-part-id`、`ui.message.thought`；首页会话行搜 `onArchiveSession`、`home-session-archive`。
2. 看新版 `i=()=>...`（思考块展开状态）、`get open(){...}`、`onOpenChange:t=>{...}` 三处，以及 8 处删除按钮锚点的实际写法，更新 `apply-patch.mjs` 里的 `P1_FIND / P4_FIND / P8_FIND / P2_FIND` 和 `D_RULES`。
3. 重跑 dry-run，确认全部 OK 再 `--write`。

历史版本对照：
- 2.0.29：思考折叠 chunk `/out/renderer/assets/route-4O9GzN5h.js`（350831 字节），asar 176333529 → 约 176334560；**没有**首页删除按钮那段代码
- 2.0.30：思考折叠 chunk `/out/renderer/assets/route-CPNDqx0F.js`（355075 → 356889 字节）；删除按钮 chunk `/out/renderer/assets/main-CfL8Gr4d.js`（1321365 → 1321786 字节）；asar 176341661 → 176343896；`jsonLen` 2172835、`dataStart` 2172852 都不变
- 2.0.32：思考折叠 chunk `/out/renderer/assets/route-BYzALZ62.js`（357215 → 359029 字节，含多选删除 UI 后）；删除按钮 chunk `/out/renderer/assets/main-CZyBNj5O.js`（1321183 官方原版 → 1326572）；asar 176346919（官方）→ 176353638；`jsonLen` 2172835、`dataStart` 2172852 仍不变
