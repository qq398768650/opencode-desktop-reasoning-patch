---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）打四组补丁：①聊天「思考」块流式中展开、思考结束后不立刻折叠（后面最后一块是正文、整轮真结束才直接折，还在调工具/还有下一段思考时都等整块滚出视口上方；折叠时补偿滚动、下方内容不动）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留；②首页每个会话行悬停时显示垃圾桶删除按钮，点击走官方删除确认框，**按住 Shift 点击直接删（不弹确认框）**，另有「多选删除」模式（右下角悬浮条或会话右键菜单进入，勾选多行一次删完）；③时间与用量（参照 dsh 布局）：每条助手回复的操作按钮行右侧显示「用量 33.2K tok」和完成时间（今天 `14:32`、同年 `10月16日 14:34`、跨年带年份），点用量弹「本轮用量」明细；输入框下方一行三块统计「⟳ 2 轮 37 步 · 97 tok/s」「▤ 1.6M tok · 缓存命中 95%」「◑ 1%」，三块都能点开对应面板（会话统计 / Token 用量 / 上下文已用）；tok/s 只显示在统计行第一块里（参考 pi 的「生成速度」口径：流式中是本轮累计的实时估算、带「约」，结束后落回该轮 tokens ÷ **纯生成时间**——不含 TTFT/网络等待/工具执行；title 里写明 tok 数与秒数）；首页每个会话行右侧显示最后活跃时间；④文件定位：在会话里 **Ctrl+左键点击文件路径**（正文里的路径、编辑/写入文件卡片上的文件名都行），用资源管理器打开所在目录并选中该文件。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了 / 首页删除按钮没了 / 删除太麻烦 / 看不到回复时间 / 看不到速度 / 点路径打不开目录 / 升级后要重新打补丁」时使用。
---

# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮 + 时间/速度显示 + 文件定位）

## 背景

opencode 桌面端的界面打包在 `<安装目录>\resources\app.asar` 里，升级会整体覆盖，所以**每次升级后补丁都会丢**，需要重新打一次。

- 思考折叠：官方 2.0.x 原生只有「默认展开」或「默认折叠」两种静态行为，没有「流式展开 → 结束自动折叠」这套。
- 首页删除按钮：官方代码里删除按钮**已经写好**，只是开关被写死成关闭（只暴露了「归档」）。补丁把开关打开、换成垃圾桶图标、接上官方 `onDeleteSession`。
- 时间显示：官方只在助手消息末尾显示「Build · 模型 · 耗时」，没有绝对时间、也没有速度；首页会话行也没有时间。补丁从后端 API 取 `time.completed` / `tokens` / `session.time.updated` 补上。

老板要的效果（2026-10-15 确认思考折叠；2026-10-16 要求合并首页删除按钮并发布新版本；2026-10-19 要求加时间）：

1. 流式思考时**展开**显示正文
2. 思考结束后**不立刻折叠**：后面**最后一块是正文**（整轮回复真结束、不会再调工具）就直接折成一行；如果还在调工具（工作中）、或后面只有下一段思考，就等这块**整块滚出视口上方**（看不见了）再折。折叠瞬间补偿滚动，下方内容原地不动
3. 折起后点标题可展开
4. 展开状态下：点底部「收起 ▴」按钮、或**双击空白处**、或再点标题，都能收起
5. 手动开合状态在界面重渲染/滚动后**不被重置**
6. 首页每个会话行悬停时显示垃圾桶按钮，点击弹官方删除确认框，确认后删除该会话
7. 一次删很多要方便（2026-10-18 新增）：①**按住 Shift 点垃圾桶** → 跳过确认框直接删；②**多选删除**：右下角悬浮条点「多选删除」（或会话右键菜单选「多选删除」）进多选模式，点行勾选、可「全选」，按「删除 N」→「确认删除 N」一次删完
8. 每条助手回复的操作按钮行右侧显示本轮用量和完成时间（2026-10-19 新增，2026-10-23 参照 dsh 改造）：`用量 33.2K tok   10月16日 14:34`，靠右对齐；时间格式同 dsh（今天 `HH:MM`、同年 `M月D日 HH:MM`、跨年带年份）；流式进行中不显示，消息完成才出现；点「用量」弹「本轮用量」面板（提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理）
9. 首页每个会话行右侧显示最后活跃时间（2026-10-19 新增）：今天显示 `HH:MM`，跨天显示 `MM/DD`，跨年显示 `YYYY/MM/DD`；悬停时排在项目名和垃圾桶按钮之间，不重叠
10. 输入框下方一行三块统计（2026-10-23 参照 dsh 新增）：`⟳ 2 轮 37 步 · 97 tok/s` / `▤ 1.6M tok · 缓存命中 95%` / `◑ 1%`，各自可点开面板：①**会话统计**（模型用时、工具调用用时、单步平均耗时、输出速度 TPS）②**Token 用量**（总量、缓存命中、未缓存输入、缓存读取、输出、其中推理）③**上下文已用**（百分比、`~12K / 1M`、进度条、对话消息占用）
10b. **tok/s 统一放在统计行第一块**（2026-10-24 从发送按钮左侧挪下来；2026-10-28 改按会话隔离）：订阅页面内 SSE（`/api/event`）统计 `session.text.delta` / `session.reasoning.delta` 的字符增量，按 2 秒滑动窗口 + token/字符 比例换算，再叠指数平滑 `ALPHA=0.4`；delta 记录带 `sid`（`dd.sessionID || OWN.get(mid)`）并按会话分桶 —— SSE 是全进程的，不过滤就会出现「这个会话没在跑，却在跳别的会话的实时速度」。最后一个 delta 后约 2 秒（`IDLE=2000`）停止刷新，落回**最后一轮的生成速度**：`ST.lastTurn = {tps, tok, ms, ch, est}`，取自最后一条有正文的 assistant message，`tps = (tokens.output + tokens.reasoning) * 1000 / genMs`，其中 `genMs` = 首个 `text/reasoning` part 的 `time.created` → `message.time.streamed`（拿不到才退回 `time.completed`，`<300ms` 视为残缺、跳过该轮；`tps` 落在 10~800 之外也跳过）—— 即 pi 的「生成速度」口径：**分母只含模型生成，不含 TTFT / 网络等待 / 工具执行**；title 显示 `本轮生成速度（N tok / M 秒，不含等待）`。流式中改成本轮累计（`LIVE_BY[sid].t0/ch`，同一消息的首个 delta 到现在的字符数 × 该会话上一轮的 `tok/ch` 比 ÷ 已用秒数），title 是「本轮生成速度（实时估算：约 N tok / M 秒，不含等待）」。会话累计平均 `avgTps()` 只在没有轮数据时兜底（只用有纯生成窗口的轮次，分子分母同口径）
11b. **正文宽度可拖拽**（2026-10-28 新增，对齐 pi-desktop）：会话正文列右缘、视口垂直居中有**一条常驻的 3px 淡灰竖线**（190px 高），鼠标移上去变粗变亮、光标变 `col-resize` 水平缩放；左右拖改列宽（居中列，拖动 1px 宽度变 2px），拖动时手柄上方显示当前 px 数；双击恢复默认 1000px；宽度存 `localStorage['oc-read-width']`，换会话/重启都保留
11. **Ctrl+左键点文件路径 → 资源管理器打开所在目录并选中该文件**（2026-10-22 新增）：正文里出现的磁盘路径（`C:\a\b.ts`、`src/index.ts`、`apply-patch.mjs`，带 `:12` 行号也认）、编辑/写入文件卡片上的文件名都能点；Ctrl 按住悬停在路径上会变成手型，点了不跳网页（`http://` 之类不接管）。相对路径按当前会话的工作目录解析，目录里没有同名文件时再递归找一次

## 怎么做

**第 0 步：每次执行前先拉取最新补丁（必做）**

本目录就是仓库 clone（`C:\Users\JS\.config\opencode\skills\desktop-reasoning-patch`），动手前先同步远端，避免拿旧锚点/旧逻辑去打新版本：

```bash
cd "C:/Users/JS/.config/opencode/skills/desktop-reasoning-patch" && git pull --ff-only
```

- 输出 `Already up to date.` 就直接往下走。
- **本机直连 GitHub 经常超时**（报 `Failed to connect to github.com port 443`）。这时走本机代理重试，别反复干等：
  ```bash
  git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull --ff-only
  ```
  7897 是 Clash 默认混合端口；换了代理软件就先探一下哪个端口通（`curl -x http://127.0.0.1:<port> -sS -o /dev/null -w "%{http_code}" https://github.com`）。
- 拉失败（有本地未提交改动）**不要强拉**：先 `git stash -u` 备份，再 `git pull --ff-only`，完事用 `git stash list` 确认备份还在，并告诉老板有本地改动被 stash 了。
- 拉完顺手看一眼 `git log --oneline -1`，确认拿到的是最新提交。

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

一条 `--write` 就够（关/开桌面端都自动做了，不会断会话：agent 跑在后端 `opencode-cli.exe serve --service` 里）。它还会顺手把 `commands/reasoning-patch.md` 装到 `~/.config/opencode/commands/`，让 `/reasoning-patch` 可用（内容没变时只打印「已是最新」）。`restart.mjs` 只在想单独重启时用。

调试口不用管：`apply-patch.mjs` / `restart.mjs` 会调 `debug-port.mjs` 自动挑一个没被 Windows 保留、也没被占用的端口（`--port` 或环境变量 `OC_DEBUG_PORT` 可指定）；`verify.mjs` 不传 `--port` 时自己扫 9222–9400，连上后会打印 `调试口: <port>`。

`verify.mjs` 需要页面上有一个会话、且会话里有已完成的思考块。如果它报「没找到思考块」，让老板打开一个聊天再跑一次。

不想开调试口时用静态校验：`node verify.mjs --static`（自动找安装目录，也可 `--asar <path>` 指定某个 asar）——直接检查 asar 里四组补丁的 30 个标记（renderer chunk 27 个 + preload 1 个 + 主进程 2 个），全在才退出码 0。

删除/多选补丁的行为验证：`node verify.mjs --delete`（同样要桌面端带调试口）——检查首页行上有垃圾桶按钮、右下角悬浮条在、`__ocMultiEnter$`/`__ocRegRow$`/`__ocDeleteApi$` 三个全局钩子已注入。**需要先切到首页**（在会话视图里 `[data-session-id]` 为 0，会报失败）。它只做存在性检查，不会真删东西。

时间/速度补丁的行为验证：`node verify.mjs --time`——在首页检查每行 `[data-oc-home-time]` 有时间；在会话页检查 `[data-slot="text-part-meta"]` 后面有 `[data-oc-done-time]`；速度检查 `__ocSpeedBoot$` 为真、`[data-oc-live-tps]` 和 `[data-oc-tps-wrap]` 存在（静止时也该有数字，流式时是实时值）。它等 2.5s 让 API 数据回来再判定；会话页要有已完成的回复。**当前正在流式输出的会话永远验证不了时间**（没有完成消息就没有 meta 行），要切到一个历史会话再跑；要看速度则必须趁它输出时用 `sample-speed.mjs` 这类采样脚本。

**测试脚本改动时不要直接 `--write`**（它会 `taskkill` 掉真实桌面端）。用假安装目录跑 dry-run / `--out`：

```bash
LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
# /tmp/fakelocal/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
```

## 补丁做了什么

四组补丁在同一次运行里全部打上，**任一目标锚点对不上就整体报错、不写文件**。

### 一、思考折叠（目标 chunk：含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的 `route-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| P1 | `i()`（思考块是否展开）改成：流式中恒 true；否则优先本地 store `n.open`，其次 `globalThis.__ocReasoningOpen` 这张 Map（跨重挂载记忆），都没有时回退到 `!_later$()` —— `_later$` 一直扫到最后一个 part 再判断：最后一块是正文块 → 直接算「该折」；最后一块是工具调用（还在工作中）或下一段思考块 → 还要求本块已整块滚出视口上方（`rect.height>0 && rect.bottom<=0`）；都不满足就**保持展开**。**同时**把 `_rx$`（全局 Map）、`_stream$`（`!!(e.streaming && e.content?.time?.completed === void 0)`）、`_later$` 声明进同一个 `let` 列表 |
| P4 | 摘掉 `get open()` 里 `?? (timelineDetail.thinking.details === 'expanded' : void 0)` 这个兜底 —— 就是它让每个思考块默认恒为展开 |
| P8 | `onOpenChange` 把用户的开合状态记进 `_rx$`（流式期间的 spurious `true` 不记），并把 `open` 写进本地 store 做即时反馈 |
| P2 | 底部加「收起 ▴」按钮、根节点加双击空白收起；**折叠时机** = `_later$()`：扫到最后一个 part 再判断 —— 最后一块是「非工具行、有文字的正文块」（整轮回复结束）→ 直接折；最后一块是工具调用（工作中）或「带收起按钮的思考块」→ 还要本块**整块滚出视口上方**（`rect.height>0 && rect.bottom<=0`）才折；工具调用行（含 `.tool-collapsible`）不算，否则每轮思考完一调工具就立刻收起。触发源有两个：`MutationObserver` 盯 `document.body`（200ms 节流、收一次就 disconnect），加一个全局 `scroll` 捕获监听（scroll 不冒泡，必须 `capture:true`；120ms 节流）扫描 `globalThis.__ocFoldQ$` 里注册的块。手动开合过的块（`_rx$` 里有记录）不自动收。**折叠时做滚动锚定**（`_anchor$`）：折叠前记下本块相对视口的位置，折叠后按差值补偿滚动容器的 `scrollTop`（块完全滚到视口上方时用底边做锚点，否则用顶边），否则翻历史时块一收，视口就被带偏；补偿要放在 `queueMicrotask` 里再补一次（微任务在渲染前执行，先画错位再补会闪一帧），`rAF` 只做兜底，且节点已卸载（`!n.isConnected`）时直接跳过 |

### 二、首页会话删除按钮（目标 chunk：含 `e.onArchiveSession(e.record.session)` 的 `main-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| D1 | 开关 `,p8=!1,m8=500;` → `,p8=!0,m8=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）定义；然后把多选删除 UI 的 IIFE（`D_MULTI_JS`）作为**独立语句**接在声明之后（`…ZZ_TRASH_ICON=…;(function(){…})();`）——为什么不能直接塞进那个逗号列表，见下面「坑」 |
| D2 | 文案 `common.archive` → `common.delete` |
| D3 | `data-action` `` `home-session-archive` `` → `` `home-session-delete` `` |
| D4 | 图标 `F(hP,{name:\`archive\`})` → `get icon(){return globalThis.__ocRegRow$&&globalThis.__ocRegRow$(e.server,e.record.session),globalThis.__ocDeleteApi$=e.onDeleteSession,F(ZZ_TRASH_ICON,{})}`（顺手把「行 → 会话对象」注册进 `__ocRowMap$`、把官方 `onDeleteSession` 存到 `__ocDeleteApi$` 供批量删用） |
| D5 | `aria-label` `common.archive` → `common.delete` |
| D6 | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层：记下旧 `__ocSkipConfirm`，置为 `!!t.shiftKey`，`try{ e.onDeleteSession(e.server,e.record.session) }finally{ 还原 }` —— 这样 **Shift+点击直接删、普通点击照旧弹确认框** |
| D7 | `showDelete` 加旁路：`(e,t)=>globalThis.__ocSkipConfirm?v(e,t):r.show(…确认框…)`（`v` 是同作用域里的官方内部删除函数，跳过确认框直接 `data.session.remove`）。`onDeleteSession` 就是 `sessions.session.showDelete`，所以行按钮/右键/批量三条路都走这里 |
| D8 | 会话右键菜单的「删除」项后面追加一项「多选删除」，`onSelect` 调 `globalThis.__ocMultiEnter$(e.server,e.record.session)` 进多选模式并选中该行 |

### 三、时间 / 用量 / 速度（跟着 D1 一起注入 `inject/time-stats.js`，全局 IIFE）

| 位置 | 做什么 |
|---|---|
| 消息行用量 + 时间 | 官方 `[data-slot="text-part-meta"]` 的父级就是 dsh 的 `MessageIconActions` 位置（`display:flex`，第一个子元素是「复制回复」按钮）。在同一个父级末尾追加两个 span：`<span data-oc-usage>用量 33.2K tok</span>`（`margin-left:auto` 靠右、带 `#opencode-v2-icon-window-analytics` 图标）和 `<span data-oc-done-time>10月16日 14:34</span>`。消息 id 取最近的 `[data-timeline-part-id]` 前缀（`msg_xxx:text:0` → `msg_xxx`），兼容祖先 `[data-message-id]`；数据来自 `GET /api/session/<sid>/message` 的 `time.completed` 与 `tokens`，没有 `completed`（还在流式）就不显示 |
| 用量面板 | 点 `[data-oc-usage]` 弹 `[data-oc-usage-panel]`（fixed 定位、跟随锚点、点外部/滚动关闭），内容参照 dsh：`本轮用量 33,196 tok`、提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理 |
| 底部会话统计 | `ensureStats()` 在 `form[data-component="composer"]` 的父级里、`form.nextSibling` 位置插 `[data-oc-stats]`（`display:flex` 用 `setProperty(...,'important')` 兜底、`justify-content:center`、`gap:24px`、11px、`opacity:.8`），三个 span `[data-oc-stat=rounds|usage|ctx]`；第一块内部是 `[data-oc-rounds-text]`（`⟳ {turns} 轮 {steps} 步`，turns 为 0 时不显示轮数）+ `[data-oc-tps-wrap]`（`· {n} tok/s`，内含 `[data-oc-live-tps]`），另两块 `▤ {total} tok · 缓存命中 {hit}%`、「圆环 + {pct}%」（`[data-oc-ring]`：`conic-gradient(currentColor calc(var(--p)*1%), 22% 透明轨道)` + `-webkit-mask: radial-gradient` 挖空中心，10px、环宽 2.5px，`--p` 即百分比）。旧结构（无 `[data-oc-tps-wrap]`）会被检测到并重建 |
| 三个面板 | `rounds` → 会话统计（模型用时 `Σ(completed-created)`、工具调用用时 `span - decMs`、TTFT `Σ(streamed-created)/steps`、TPS `Σ(output+reasoning)/decMs`）；`usage` → Token 用量（`session.tokens` 累计：总量、缓存命中、未缓存输入、缓存读取、输出、其中推理）；`ctx` → 上下文已用（`lastCtx / limit.context`，带进度条与 `~12K / 1M`；按会话内「正文 / 工具」字符占比把总占用拆成「对话消息 / 工具结果 / 合计」，API 只给整轮 token 总量，拆分是估算） |
| 首页活跃时间 | 对每个 `[data-session-id]` 行，在 `[data-slot="home-session-labels"]` 末尾追加 `<span data-oc-home-time>`，值取 `__ocRowMap$` 里该会话的 `session.time.updated`；今天 `HH:MM`，跨天 `MM/DD`，跨年 `YYYY/MM/DD` |
| 实时速度 | 不再是独立元素：`[data-oc-live-tps]` 就在统计行第一块里（`paintSpeed` 只改它的 textContent，显隐由外层 `[data-oc-tps-wrap]` 控制）。`fetch(apiBase()+"/api/event")` 用 `getReader()` + `TextDecoder` 按 `\n\n` 分帧，取 `data: ` 行的 JSON；`session.text.delta` / `session.reasoning.delta` 的 `delta` 是**增量文本**，把 `{t: performance.now(), n: delta.length}` 推进 `D` |
| 统计块样式 | 每块 `padding:2px 9px;border-radius:999px` + hover 底色由一段 `<style id="oc-stats-css">` 注入（`[data-oc-stat]` 选择器），行本身 `gap:24px` 居中 |
| 速度算法 | `WIN=2500` 滑动窗口，`span = max(1000, min(WIN, now - 最老样本))`，`raw = sum(n)/span*1000*k`，`k` 是 token/字符 比；每 400ms 重绘，**不做指数平滑**；最后一个 delta 超过 `IDLE=2000` 就从实时值切成平均值 `ST.oTok / (ST.decMs/1000)`（`decMs = Σ(completed - created)`，只累加正文 ≥50 字符的模型步），数字不会消失 |
| `k` 怎么来（`kAdj()`） | 遍历 `__ocMsgTime$`，只收 `c >= 200` 且单条比值落在 `0.25 < n/c < 1.2` 的消息，累加后取**聚合比** `sum(n)/sum(c)`；样本总字符不足 2000 时回退常量 `K=0.6` |
| 消息数据 | `loadSid()` 把每条消息存成 `M.set(m.id, {t: m.time, k: m.tokens, c: ch, p: model.providerID, m: model.id})`（`ch` = content 里 text + reasoning 字符数），同时累加 `ST.turns/steps/oTok/decMs/sttMs/spanMs/ctx`，完成后 `loadSess(sid)` 拉 `/api/session/<sid>` 拿会话累计 `tokens`；`loadModel(mid)` 拉 `/api/model` 找 `limit.context` 存进按 model id 索引的 `__ocCtxLimits$[mid]`（旧版是单值 `__ocCtxLimit$`，见坑「上下文上限串模型」），`curMid()` 取最新一条带 model 的消息、回退到 `ST.model.id` |
| sid 怎么找 | DOM 上不暴露当前会话 id。`guessSid()` 顺序：① `localStorage` 里 `opencode.desktop.window.<uuid>.last-active-url` 的 `/session/ses_xxx`；② `performance.getEntriesByType('resource')` 里最近的 `/api/session/<sid>/...`；③ 所有 `[data-tab-key]`（格式 `sidecar
/server/<b64>/session/ses_xxx`）。`syncSid()` 每 2 秒比对一次，切会话后自动重载；`loadSid` 最多 6 个 sid 并发，缓存进 `__ocMsgTime$`（Map） |
| 刷新 | `MutationObserver` 盯 `document.body`（120ms 节流）重绘；首页另有 15s 定时重绘兜底（`session.time.updated` 变化不一定触发 DOM 变更）；SSE 事件到达时立即 `paint()` | `syncSid()` 在每次 `paintAll()` 时按 2 秒限流检查当前会话是否切换。

时间不写进 asar 里的 chunk 常量，而是作为独立 IIFE 接在 `D_MULTI_JS` 之后（同样在 `p8=!0,m8=500,` 那条声明结尾的 `;` 之后，理由同「坑」里那条）。

### 四、文件定位（Ctrl+左键点路径 → 资源管理器选中文件）

三处配合，缺一不可：

| 位置 | 改什么 |
|---|---|
| `/out/preload/index.cjs`（F1） | 在 `exposeInMainWorld('electron', {…, getPathForFile:…})` 里加 `revealPath: t => e.ipcRenderer.invoke("oc:reveal-path", t)`。preload 是沙箱里的（`sandbox:!0`），没有 `shell`，只能靠 IPC 转给主进程 |
| `/out/main/index.js` 末尾追加（F2） | `import("electron").then(m => m.ipcMain.handle("oc:reveal-path", (e, t) => …))`：参数 `t` 支持字符串或 `{path, dir}`；`fs.existsSync` 为假时用 `fs.globSync("**/"+basename, {cwd: dir || dirname(path)})` 找同名文件（编辑卡片只显示文件名），还找不到就返回 `false`；找到就 `m.shell.showItemInFolder(p)`——正好是「打开所在目录 + 选中文件」。**不写死打包后的压缩变量名**，内置模块走 `process.getBuiltinModule("node:fs")`，升级后也基本不会失效 |
| renderer 注入 `inject/file-reveal.js`（跟着 D1，`T_FILE_JS`） | 全局 IIFE，`__ocFileBoot$` 防重入。`mousemove`（capture）在 Ctrl 按住且指到路径上时把 `cursor` 设为 `pointer`；`click`（capture）在 `ctrlKey && button===0` 时按优先级取路径：①`[data-slot="apply-patch-filename"]` 的文本 ②`document.caretRangeFromPoint(x,y)` 拿到文本节点，用正则取**点击位置那个 token** ③兜底整块 `<code>` 文本；然后 `absPath()` 归一化（去 `:12`/`:12:3` 行号、认盘符/UNC/Unix 绝对路径、相对路径拼会话目录）、`revealPath({path, dir})` |

- 会话目录怎么来：`ensureDir()` 先查 `__ocRowMap$`（首页渲染过才有），没有再页面内 `fetch(/api/session/<sid>)` 取 `location.directory`（Node 直连 401，页面内 fetch 带得上认证）；sid 从 `localStorage` 的 `last-active-url` 里抠。
- 点击时**必须** `preventDefault()` + `stopPropagation()`，否则 markdown 里的链接/选中行为会抢先。
- 含 `://` 的 token 一律不接管（`http://127.0.0.1:45278/...` 这类会被正则匹配成 `p://127.0.0.1:...`，要按子串判断而不是 `^https?:`）。

两个目标 chunk 必须**串行**重建：每替换一个文件会平移其后所有文件的 offset，第二个要在第一个的结果上继续（脚本里就是 `let out = source; for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。

## 坑（务必记住）

- **`--write` 重启后调试口不一定是 9222（2026-10-28 实测）**：9222 落进 Windows 保留区间或被残留进程占着时，`debug-port.mjs` 会挑 9223/9224……`verify.mjs` 自己会扫 9222–9400，但**手写 CDP 脚本别把端口写死**；`go-home-fast.mjs` 已改成自动扫。
- **扫调试口不能串行 + 无超时**：9222/9223 可能被 Windows 保留区间或残留监听占住，TCP 能握手但永远不回 HTTP —— `curl --max-time 2` 要 2 秒才判定 000，不带 `AbortSignal` 的 `fetch` 直接挂死。2026-10-24 实测：桌面端起在 9224，`verify.mjs` 卡了 5 分钟一行输出没有。现在 `page()` 改成 `Promise.all` 并发探 179 个端口、每个 `AbortSignal.timeout(900)`，一轮最多 0.9 秒，命中就返回。
- **2.1.4 起 `--delete` 必须在「主页」面板打开时跑（2026-10-24 实测）**：2.1.4 首页是左侧 `aria-label="主页"` 按钮打开的独立面板（`[data-slot="home-panel"]`），在会话视图里 `[data-session-id]` 和 `data-action="home-session-delete"` 都是 0，verify 一定报「删除补丁没生效」——这是假失败，别去改锚点。打开主页后只有**展开的项目**才渲染会话行（实测 `rows=1`、`home-session-delete:1`，hover 后按钮 `aria-label="删除"`、28×28、opacity 1）。`--time` 验首页活跃时间同理。
- **`verify.mjs --time` 在首页会误判失败（2026-10-24 修）**：首页没有输入框，`[data-oc-stats]`（统计行）不存在，`speedEl`/`tpsWrap` 必为 0、布局必为 null → 明明首页活跃时间全有，却报「没生效」。现在按场景判定：首页（`rows>0 && !statsLayout`）只验 `[data-oc-home-time]`，速度与布局两项视为不适用；回到会话页再验完成时间 + 统计行。
- **点「主页」后约 3 秒会自动跳回会话页（2026-10-27 实测 2.2.0）**：`[data-action="vertical-tabs-home"]` 点完 0.4~1.5s 首页一切正常（`rows=2`、`home-session-delete` 按钮 2 个、`[data-oc-home-time]` 2 个），到 3.5s 已被换回会话页（`rows=0`、`[data-oc-stats]` 又出现，`probe` 在 0.4/1.5/3.5/6.5s 四次快照证实）。所以 `--delete` / `--time` 首页验证必须点完立刻跑，超 3 秒就是假失败（报 rows=0）。做法：`node go-home-fast.mjs`（仓库根，CDP 点完 250ms 立即退出）紧接着 `node verify.mjs --delete`，中间别插别的事。
- **`style.cssText` 里的 `display:flex` 会被丢掉（2026-10-24 实测）**：`statsEl.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:24px;...'` 执行后 `el.style.display` 是空串、computed 变 `display:block`，`gap`/`justify-content` 全部失效 —— 三块挤成一坨、整体靠左（实测 gaps=[0,0]、左右留白 4/447）。必须补 `el.style.setProperty('display','flex','important')`，并且放在 `ensureStats()` 的**所有返回路径**之前（复用早退分支也要补）。`verify.mjs --time` 会打印 `display/gap/实际间距/左右留白/居中`，只看元素存在会漏掉这个坑。
- **统计行会「频繁消失又出现」，尤其在新会话（2026-10-24 修）**：三个独立原因叠在一起。①`want()` 会**并发** `loadSid()` 拉多个候选 sid，任何一个后到的结果都会覆盖 `ST.turns/steps`（变成别的会话的数字，或者 0 步 → `paintStats` 直接隐藏整行）；现在 `loadSid()`/`loadSess()` 只在 `sid === guessSid()`（`guessSid()` 为空时也放行，新会话刚建会这样）才写 `ST`，其余只写消息缓存 `M`。②`loadSid()` 每成功一次都 `LIVE.v = LIVE.last = 0`，把刚钉住的 tok/s 打回 0 → `[data-oc-tps-wrap]` 内容变空、第一块变窄 → 居中布局下整行左右横跳；现在只有 `syncSid()` 判定**真换会话**（`cur !== ST.sid`）才清。③隐藏用 `display:none` 会把那 23px 高度塌掉、输入框跟着上下跳；统计行与 tok/s 一律改 `visibility:hidden` 保位（`ensureStats()` 里 `display:flex !important` 不变）。④`guessSid()` 在新会话刚建时会在「新 sid / 旧最近资源 / 空」之间抖，抖一次就切一次会话、清一次统计；`syncSid()` 现在要求同一 sid **连续两轮一致**（`SID.lastCur`，首轮放行）才认，并且真切会话时立刻把 `ST.turns/steps/oTok/ctx/sess` 清零 —— 否则新会话会先显示上一条会话的轮数再变成新数。

- **「token 总用量」不跟对话、不跟会话切换（2026-10-27 修）**：三个原因叠在一起。①`loadSess()` 开头是 `if (ST.sessSid === sid) { then && then(); return; }` —— 同一个会话只拉一次 `/api/session/<sid>`，之后永久冻结在打开那一刻；现在改成「`ST.sessAt` 超过 2500ms 就重拉」，并在 `paintStats()` 里超过 3000ms 兜底触发 `loadSess(ST.sid, paintStats)`（`tick()` 只在 DOM 变动时才跑，光盯着数字不刷新会以为卡死）；`fetch` 失败也写 `ST.sessAt`，避免每帧重试。②`guessSid()` 原来只认 `localStorage` 的 `last-active-url` 和 `performance` 里最近的 `/api/session` 请求，切标签页 3 秒后仍返回旧会话（实测切到 36M 的会话，UI 还是本会话的「▤ 509K tok」）；现在首选标题栏 `[data-tab-key][data-active="true"]`（key 里就带 `/session/ses_…`，切换瞬间就变，且置 `SID.src = 2` 绕过 `syncSid()` 的「连续两轮一致」防抖），次选 DOM 里 `[data-timeline-part-id]` 反查 `__ocMsgOwner$`（msgId→sid，在 `loadSid()` 里逐条写）。③`/api/session/<sid>/message` 只返回**最后 50 条**（实测长会话 50 条里 0 条 user → 显示「0 轮 45 步」），轮数/步数对长会话本来就不准，别当成 bug 去改锚点；`session.tokens` 也只在**一轮结束**后才更新，所以流式过程中第二块数字不动属正常，别去接流式增量。④（2026-10-27 补）默认 50 条连「轮数」都算不出来（实测 120 条的会话只显示「⟳ 0 轮 46 步」），补丁把 URL 改成 `?limit=200` —— **200 是服务端上限，250/300/500/999/1000/0 全部 HTTP 400**，`?page=2`、`?offset=50` 无效（仍 50 条）。⑤一轮结束的 SSE 分支原来只 `setTimeout(paintAll,1500)`，从不重拉 `/message` → 同一会话里轮数/步数永远停在打开那一刻；现在是 1.5 秒后 `loadSid(ST.sid, paintAll)`，另加 `setInterval(… loadSid(ST.sid, paintStats) …, 20000)` 兜底（`BUSY[sid]` 挡住并发）。⑥切 tab 后 DOM 渲染完就不再变动，`tick()`（`MutationObserver` 120ms 节流）不再触发，统计行要等 20 秒兜底才跟上；现在 400ms 的速度定时器顺手喊 `syncSid()`（它自己 2 秒限流），实测点 tab 后 **4 秒内**轮数/用量/上下文三块全部换新（`e836e10f` 4 轮 129 步 6.7M → `e83a41` 2 轮 181 步 45M）。⑦消息 JSON 里 part 在 **`m.content`**，不是 `m.parts`（一条消息是 `{id,time,type,agent,model,content}`，content 项是 `{type,text,native,time}`）；调试时用 `m.content` 数 reasoning 块，用 `m.parts` 会永远数到 0。
- **统计行 tok/s 的两个坑：「看不到速度」+「串台」（2026-10-28 修）**：
  ① **看不到**：tok/s 只由 `paintSpeed()` 的 `LIVE.last`（最后一次实时值）驱动，早期实现 `val = LIVE.last || 0`，而 `LIVE` 是进程内闭包变量、`syncSid()` 真换会话时会清零 —— 「刚启动桌面端就打开会话」「刚切到另一个会话」时 `LIVE.last=0`，走 `if (!val) { wrap.style.visibility = 'hidden'; return; }`，`· XX tok/s` 整块隐藏，只剩轮数/步数，看起来像速度补丁没生效（**不是锚点问题**）。`avgTps()`（Σoutput / Σ有正文模型步的墙钟）明明有数（实测 79 tok/s）。
  ② **串台**：`/api/event` 的 SSE 是**全进程**的，别的会话在输出时也会推 `session.text.delta`，`D.push({t,n,mid})` 里没有 sid，导致「这个会话没在跑，却在跳别的会话的实时速度」。
  现在：`D.push` 带 `sid: dd.sessionID || OWN.get(dd.assistantMessageID)`；`LIVE` 改成按会话分桶 `LIVE_BY[sid]`（`liveFor(sid)` + `sameSid(rec,cur)`）；`paintSpeed()` 用 `cur = guessSid() || ST.sid`，滑窗只累加 `sameSid` 的 chunk；非 live 时 `val = (ST.sid === cur ? avgTps() : 0) || L.last` —— 没在跑就显示**这个会话自己**的平均速度，ST 还没切过来时宁可空着也不拿上一个会话的数字顶替。title 三档：实时 / 本会话平均 / 最后一次输出。
- **正文宽度拖拽（对齐 pi-desktop，2026-10-28 加）**：会话正文列是 `[class*="max-w-session"]`（`min-w-0 w-full max-w-full md:max-w-session md:mx-auto`，默认 `max-width:1000px`，`mx-auto` 居中，每个 turn 一个、实测 5 个同时在），所以调宽要**遍历所有**元素设 `style.maxWidth`（内联会盖掉 `md:max-w-session`）。手柄是 `[data-oc-width-grip]`：`position:fixed;display:flex;width:16px;height:190px;cursor:col-resize`，**内部常驻一条 3px 淡竖线**（`[data-oc-grip-line]`，`rgba(150,150,150,.22)`；悬停变 4px / `.62`，拖动时同亮态并在光标上方显示 `1200px` 小气泡 `[data-oc-grip-chip]`）—— 第一版整条手柄是 `10px` 全透明、只有 hover 才显色，老板实测「根本没看到拖拽手柄」，所以必须有常驻可见的细线。left 跟着 `els[0].getBoundingClientRect().right - 8` 走（垂直居中 `(innerHeight-190)/2`，列居中、垂直滚动不影响 left；不能拿「第一个 `[data-slot=session-turn-message-container]`」算位置，那个 turn 常常滚出屏幕、rect.bottom 是负的，会导致手柄一直 `display:none`）。拖动系数 **2**：`maxWidth = baseW + (clientX - baseX) * 2`（居中列，右缘动 1px 宽度变 2px 才跟手）；夹在 560 ~ `innerWidth-140`；存 `localStorage['oc-read-width']`；双击恢复默认（清 inline + 删 key）。代码在 `inject/time-stats.js` 末尾 `rwInstall/rwPlace/rwApply`。**位置刷新不能只靠轮询**：右上角「切换审查」是按宽度过渡动画开合面板的（实测正文列 1000px ↔ 600px，动画约 350ms），只靠 `setInterval(rwBoot, 800)` 会在动画中途才重算，看起来「竖条没跟着面板走」→ 现在加了 `ResizeObserver` 盯住每个 `max-w-session` 列的尺寸（`__ocRwRo---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）打四组补丁：①聊天「思考」块流式中展开、思考结束后不立刻折叠（后面最后一块是正文、整轮真结束才直接折，还在调工具/还有下一段思考时都等整块滚出视口上方；折叠时补偿滚动、下方内容不动）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留；②首页每个会话行悬停时显示垃圾桶删除按钮，点击走官方删除确认框，**按住 Shift 点击直接删（不弹确认框）**，另有「多选删除」模式（右下角悬浮条或会话右键菜单进入，勾选多行一次删完）；③时间与用量（参照 dsh 布局）：每条助手回复的操作按钮行右侧显示「用量 33.2K tok」和完成时间（今天 `14:32`、同年 `10月16日 14:34`、跨年带年份），点用量弹「本轮用量」明细；输入框下方一行三块统计「⟳ 2 轮 37 步 · 97 tok/s」「▤ 1.6M tok · 缓存命中 95%」「◑ 1%」，三块都能点开对应面板（会话统计 / Token 用量 / 上下文已用）；tok/s 只显示在统计行第一块里（参考 pi 的「生成速度」口径：流式中是本轮累计的实时估算、带「约」，结束后落回该轮 tokens ÷ **纯生成时间**——不含 TTFT/网络等待/工具执行；title 里写明 tok 数与秒数）；首页每个会话行右侧显示最后活跃时间；④文件定位：在会话里 **Ctrl+左键点击文件路径**（正文里的路径、编辑/写入文件卡片上的文件名都行），用资源管理器打开所在目录并选中该文件。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了 / 首页删除按钮没了 / 删除太麻烦 / 看不到回复时间 / 看不到速度 / 点路径打不开目录 / 升级后要重新打补丁」时使用。
---

# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮 + 时间/速度显示 + 文件定位）

## 背景

opencode 桌面端的界面打包在 `<安装目录>\resources\app.asar` 里，升级会整体覆盖，所以**每次升级后补丁都会丢**，需要重新打一次。

- 思考折叠：官方 2.0.x 原生只有「默认展开」或「默认折叠」两种静态行为，没有「流式展开 → 结束自动折叠」这套。
- 首页删除按钮：官方代码里删除按钮**已经写好**，只是开关被写死成关闭（只暴露了「归档」）。补丁把开关打开、换成垃圾桶图标、接上官方 `onDeleteSession`。
- 时间显示：官方只在助手消息末尾显示「Build · 模型 · 耗时」，没有绝对时间、也没有速度；首页会话行也没有时间。补丁从后端 API 取 `time.completed` / `tokens` / `session.time.updated` 补上。

老板要的效果（2026-10-15 确认思考折叠；2026-10-16 要求合并首页删除按钮并发布新版本；2026-10-19 要求加时间）：

1. 流式思考时**展开**显示正文
2. 思考结束后**不立刻折叠**：后面**最后一块是正文**（整轮回复真结束、不会再调工具）就直接折成一行；如果还在调工具（工作中）、或后面只有下一段思考，就等这块**整块滚出视口上方**（看不见了）再折。折叠瞬间补偿滚动，下方内容原地不动
3. 折起后点标题可展开
4. 展开状态下：点底部「收起 ▴」按钮、或**双击空白处**、或再点标题，都能收起
5. 手动开合状态在界面重渲染/滚动后**不被重置**
6. 首页每个会话行悬停时显示垃圾桶按钮，点击弹官方删除确认框，确认后删除该会话
7. 一次删很多要方便（2026-10-18 新增）：①**按住 Shift 点垃圾桶** → 跳过确认框直接删；②**多选删除**：右下角悬浮条点「多选删除」（或会话右键菜单选「多选删除」）进多选模式，点行勾选、可「全选」，按「删除 N」→「确认删除 N」一次删完
8. 每条助手回复的操作按钮行右侧显示本轮用量和完成时间（2026-10-19 新增，2026-10-23 参照 dsh 改造）：`用量 33.2K tok   10月16日 14:34`，靠右对齐；时间格式同 dsh（今天 `HH:MM`、同年 `M月D日 HH:MM`、跨年带年份）；流式进行中不显示，消息完成才出现；点「用量」弹「本轮用量」面板（提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理）
9. 首页每个会话行右侧显示最后活跃时间（2026-10-19 新增）：今天显示 `HH:MM`，跨天显示 `MM/DD`，跨年显示 `YYYY/MM/DD`；悬停时排在项目名和垃圾桶按钮之间，不重叠
10. 输入框下方一行三块统计（2026-10-23 参照 dsh 新增）：`⟳ 2 轮 37 步 · 97 tok/s` / `▤ 1.6M tok · 缓存命中 95%` / `◑ 1%`，各自可点开面板：①**会话统计**（模型用时、工具调用用时、单步平均耗时、输出速度 TPS）②**Token 用量**（总量、缓存命中、未缓存输入、缓存读取、输出、其中推理）③**上下文已用**（百分比、`~12K / 1M`、进度条、对话消息占用）
10b. **tok/s 统一放在统计行第一块**（2026-10-24 从发送按钮左侧挪下来；2026-10-28 改按会话隔离）：订阅页面内 SSE（`/api/event`）统计 `session.text.delta` / `session.reasoning.delta` 的字符增量，按 2 秒滑动窗口 + token/字符 比例换算，再叠指数平滑 `ALPHA=0.4`；delta 记录带 `sid`（`dd.sessionID || OWN.get(mid)`）并按会话分桶 —— SSE 是全进程的，不过滤就会出现「这个会话没在跑，却在跳别的会话的实时速度」。最后一个 delta 后约 2 秒（`IDLE=2000`）停止刷新，落回**最后一轮的生成速度**：`ST.lastTurn = {tps, tok, ms, ch, est}`，取自最后一条有正文的 assistant message，`tps = (tokens.output + tokens.reasoning) * 1000 / genMs`，其中 `genMs` = 首个 `text/reasoning` part 的 `time.created` → `message.time.streamed`（拿不到才退回 `time.completed`，`<300ms` 视为残缺、跳过该轮；`tps` 落在 10~800 之外也跳过）—— 即 pi 的「生成速度」口径：**分母只含模型生成，不含 TTFT / 网络等待 / 工具执行**；title 显示 `本轮生成速度（N tok / M 秒，不含等待）`。流式中改成本轮累计（`LIVE_BY[sid].t0/ch`，同一消息的首个 delta 到现在的字符数 × 该会话上一轮的 `tok/ch` 比 ÷ 已用秒数），title 是「本轮生成速度（实时估算：约 N tok / M 秒，不含等待）」。会话累计平均 `avgTps()` 只在没有轮数据时兜底（只用有纯生成窗口的轮次，分子分母同口径）
11b. **正文宽度可拖拽**（2026-10-28 新增，对齐 pi-desktop）：会话正文列右缘、视口垂直居中有**一条常驻的 3px 淡灰竖线**（190px 高），鼠标移上去变粗变亮、光标变 `col-resize` 水平缩放；左右拖改列宽（居中列，拖动 1px 宽度变 2px），拖动时手柄上方显示当前 px 数；双击恢复默认 1000px；宽度存 `localStorage['oc-read-width']`，换会话/重启都保留
11. **Ctrl+左键点文件路径 → 资源管理器打开所在目录并选中该文件**（2026-10-22 新增）：正文里出现的磁盘路径（`C:\a\b.ts`、`src/index.ts`、`apply-patch.mjs`，带 `:12` 行号也认）、编辑/写入文件卡片上的文件名都能点；Ctrl 按住悬停在路径上会变成手型，点了不跳网页（`http://` 之类不接管）。相对路径按当前会话的工作目录解析，目录里没有同名文件时再递归找一次

## 怎么做

**第 0 步：每次执行前先拉取最新补丁（必做）**

本目录就是仓库 clone（`C:\Users\JS\.config\opencode\skills\desktop-reasoning-patch`），动手前先同步远端，避免拿旧锚点/旧逻辑去打新版本：

```bash
cd "C:/Users/JS/.config/opencode/skills/desktop-reasoning-patch" && git pull --ff-only
```

- 输出 `Already up to date.` 就直接往下走。
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

一条 `--write` 就够（关/开桌面端都自动做了，不会断会话：agent 跑在后端 `opencode-cli.exe serve --service` 里）。它还会顺手把 `commands/reasoning-patch.md` 装到 `~/.config/opencode/commands/`，让 `/reasoning-patch` 可用（内容没变时只打印「已是最新」）。`restart.mjs` 只在想单独重启时用。

调试口不用管：`apply-patch.mjs` / `restart.mjs` 会调 `debug-port.mjs` 自动挑一个没被 Windows 保留、也没被占用的端口（`--port` 或环境变量 `OC_DEBUG_PORT` 可指定）；`verify.mjs` 不传 `--port` 时自己扫 9222–9400，连上后会打印 `调试口: <port>`。

`verify.mjs` 需要页面上有一个会话、且会话里有已完成的思考块。如果它报「没找到思考块」，让老板打开一个聊天再跑一次。

不想开调试口时用静态校验：`node verify.mjs --static`（自动找安装目录，也可 `--asar <path>` 指定某个 asar）——直接检查 asar 里四组补丁的 30 个标记（renderer chunk 27 个 + preload 1 个 + 主进程 2 个），全在才退出码 0。

删除/多选补丁的行为验证：`node verify.mjs --delete`（同样要桌面端带调试口）——检查首页行上有垃圾桶按钮、右下角悬浮条在、`__ocMultiEnter$`/`__ocRegRow$`/`__ocDeleteApi$` 三个全局钩子已注入。**需要先切到首页**（在会话视图里 `[data-session-id]` 为 0，会报失败）。它只做存在性检查，不会真删东西。

时间/速度补丁的行为验证：`node verify.mjs --time`——在首页检查每行 `[data-oc-home-time]` 有时间；在会话页检查 `[data-slot="text-part-meta"]` 后面有 `[data-oc-done-time]`；速度检查 `__ocSpeedBoot$` 为真、`[data-oc-live-tps]` 和 `[data-oc-tps-wrap]` 存在（静止时也该有数字，流式时是实时值）。它等 2.5s 让 API 数据回来再判定；会话页要有已完成的回复。**当前正在流式输出的会话永远验证不了时间**（没有完成消息就没有 meta 行），要切到一个历史会话再跑；要看速度则必须趁它输出时用 `sample-speed.mjs` 这类采样脚本。

**测试脚本改动时不要直接 `--write`**（它会 `taskkill` 掉真实桌面端）。用假安装目录跑 dry-run / `--out`：

```bash
LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
# /tmp/fakelocal/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
```

## 补丁做了什么

四组补丁在同一次运行里全部打上，**任一目标锚点对不上就整体报错、不写文件**。

### 一、思考折叠（目标 chunk：含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的 `route-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| P1 | `i()`（思考块是否展开）改成：流式中恒 true；否则优先本地 store `n.open`，其次 `globalThis.__ocReasoningOpen` 这张 Map（跨重挂载记忆），都没有时回退到 `!_later$()` —— `_later$` 一直扫到最后一个 part 再判断：最后一块是正文块 → 直接算「该折」；最后一块是工具调用（还在工作中）或下一段思考块 → 还要求本块已整块滚出视口上方（`rect.height>0 && rect.bottom<=0`）；都不满足就**保持展开**。**同时**把 `_rx$`（全局 Map）、`_stream$`（`!!(e.streaming && e.content?.time?.completed === void 0)`）、`_later$` 声明进同一个 `let` 列表 |
| P4 | 摘掉 `get open()` 里 `?? (timelineDetail.thinking.details === 'expanded' : void 0)` 这个兜底 —— 就是它让每个思考块默认恒为展开 |
| P8 | `onOpenChange` 把用户的开合状态记进 `_rx$`（流式期间的 spurious `true` 不记），并把 `open` 写进本地 store 做即时反馈 |
| P2 | 底部加「收起 ▴」按钮、根节点加双击空白收起；**折叠时机** = `_later$()`：扫到最后一个 part 再判断 —— 最后一块是「非工具行、有文字的正文块」（整轮回复结束）→ 直接折；最后一块是工具调用（工作中）或「带收起按钮的思考块」→ 还要本块**整块滚出视口上方**（`rect.height>0 && rect.bottom<=0`）才折；工具调用行（含 `.tool-collapsible`）不算，否则每轮思考完一调工具就立刻收起。触发源有两个：`MutationObserver` 盯 `document.body`（200ms 节流、收一次就 disconnect），加一个全局 `scroll` 捕获监听（scroll 不冒泡，必须 `capture:true`；120ms 节流）扫描 `globalThis.__ocFoldQ$` 里注册的块。手动开合过的块（`_rx$` 里有记录）不自动收。**折叠时做滚动锚定**（`_anchor$`）：折叠前记下本块相对视口的位置，折叠后按差值补偿滚动容器的 `scrollTop`（块完全滚到视口上方时用底边做锚点，否则用顶边），否则翻历史时块一收，视口就被带偏；补偿要放在 `queueMicrotask` 里再补一次（微任务在渲染前执行，先画错位再补会闪一帧），`rAF` 只做兜底，且节点已卸载（`!n.isConnected`）时直接跳过 |

### 二、首页会话删除按钮（目标 chunk：含 `e.onArchiveSession(e.record.session)` 的 `main-*.js`，脚本自动找）

| 标记 | 改什么 |
|---|---|
| D1 | 开关 `,p8=!1,m8=500;` → `,p8=!0,m8=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）定义；然后把多选删除 UI 的 IIFE（`D_MULTI_JS`）作为**独立语句**接在声明之后（`…ZZ_TRASH_ICON=…;(function(){…})();`）——为什么不能直接塞进那个逗号列表，见下面「坑」 |
| D2 | 文案 `common.archive` → `common.delete` |
| D3 | `data-action` `` `home-session-archive` `` → `` `home-session-delete` `` |
| D4 | 图标 `F(hP,{name:\`archive\`})` → `get icon(){return globalThis.__ocRegRow$&&globalThis.__ocRegRow$(e.server,e.record.session),globalThis.__ocDeleteApi$=e.onDeleteSession,F(ZZ_TRASH_ICON,{})}`（顺手把「行 → 会话对象」注册进 `__ocRowMap$`、把官方 `onDeleteSession` 存到 `__ocDeleteApi$` 供批量删用） |
| D5 | `aria-label` `common.archive` → `common.delete` |
| D6 | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层：记下旧 `__ocSkipConfirm`，置为 `!!t.shiftKey`，`try{ e.onDeleteSession(e.server,e.record.session) }finally{ 还原 }` —— 这样 **Shift+点击直接删、普通点击照旧弹确认框** |
| D7 | `showDelete` 加旁路：`(e,t)=>globalThis.__ocSkipConfirm?v(e,t):r.show(…确认框…)`（`v` 是同作用域里的官方内部删除函数，跳过确认框直接 `data.session.remove`）。`onDeleteSession` 就是 `sessions.session.showDelete`，所以行按钮/右键/批量三条路都走这里 |
| D8 | 会话右键菜单的「删除」项后面追加一项「多选删除」，`onSelect` 调 `globalThis.__ocMultiEnter$(e.server,e.record.session)` 进多选模式并选中该行 |

### 三、时间 / 用量 / 速度（跟着 D1 一起注入 `inject/time-stats.js`，全局 IIFE）

| 位置 | 做什么 |
|---|---|
| 消息行用量 + 时间 | 官方 `[data-slot="text-part-meta"]` 的父级就是 dsh 的 `MessageIconActions` 位置（`display:flex`，第一个子元素是「复制回复」按钮）。在同一个父级末尾追加两个 span：`<span data-oc-usage>用量 33.2K tok</span>`（`margin-left:auto` 靠右、带 `#opencode-v2-icon-window-analytics` 图标）和 `<span data-oc-done-time>10月16日 14:34</span>`。消息 id 取最近的 `[data-timeline-part-id]` 前缀（`msg_xxx:text:0` → `msg_xxx`），兼容祖先 `[data-message-id]`；数据来自 `GET /api/session/<sid>/message` 的 `time.completed` 与 `tokens`，没有 `completed`（还在流式）就不显示 |
| 用量面板 | 点 `[data-oc-usage]` 弹 `[data-oc-usage-panel]`（fixed 定位、跟随锚点、点外部/滚动关闭），内容参照 dsh：`本轮用量 33,196 tok`、提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理 |
| 底部会话统计 | `ensureStats()` 在 `form[data-component="composer"]` 的父级里、`form.nextSibling` 位置插 `[data-oc-stats]`（`display:flex` 用 `setProperty(...,'important')` 兜底、`justify-content:center`、`gap:24px`、11px、`opacity:.8`），三个 span `[data-oc-stat=rounds|usage|ctx]`；第一块内部是 `[data-oc-rounds-text]`（`⟳ {turns} 轮 {steps} 步`，turns 为 0 时不显示轮数）+ `[data-oc-tps-wrap]`（`· {n} tok/s`，内含 `[data-oc-live-tps]`），另两块 `▤ {total} tok · 缓存命中 {hit}%`、「圆环 + {pct}%」（`[data-oc-ring]`：`conic-gradient(currentColor calc(var(--p)*1%), 22% 透明轨道)` + `-webkit-mask: radial-gradient` 挖空中心，10px、环宽 2.5px，`--p` 即百分比）。旧结构（无 `[data-oc-tps-wrap]`）会被检测到并重建 |
| 三个面板 | `rounds` → 会话统计（模型用时 `Σ(completed-created)`、工具调用用时 `span - decMs`、TTFT `Σ(streamed-created)/steps`、TPS `Σ(output+reasoning)/decMs`）；`usage` → Token 用量（`session.tokens` 累计：总量、缓存命中、未缓存输入、缓存读取、输出、其中推理）；`ctx` → 上下文已用（`lastCtx / limit.context`，带进度条与 `~12K / 1M`；按会话内「正文 / 工具」字符占比把总占用拆成「对话消息 / 工具结果 / 合计」，API 只给整轮 token 总量，拆分是估算） |
| 首页活跃时间 | 对每个 `[data-session-id]` 行，在 `[data-slot="home-session-labels"]` 末尾追加 `<span data-oc-home-time>`，值取 `__ocRowMap$` 里该会话的 `session.time.updated`；今天 `HH:MM`，跨天 `MM/DD`，跨年 `YYYY/MM/DD` |
| 实时速度 | 不再是独立元素：`[data-oc-live-tps]` 就在统计行第一块里（`paintSpeed` 只改它的 textContent，显隐由外层 `[data-oc-tps-wrap]` 控制）。`fetch(apiBase()+"/api/event")` 用 `getReader()` + `TextDecoder` 按 `\n\n` 分帧，取 `data: ` 行的 JSON；`session.text.delta` / `session.reasoning.delta` 的 `delta` 是**增量文本**，把 `{t: performance.now(), n: delta.length}` 推进 `D` |
| 统计块样式 | 每块 `padding:2px 9px;border-radius:999px` + hover 底色由一段 `<style id="oc-stats-css">` 注入（`[data-oc-stat]` 选择器），行本身 `gap:24px` 居中 |
| 速度算法 | `WIN=2500` 滑动窗口，`span = max(1000, min(WIN, now - 最老样本))`，`raw = sum(n)/span*1000*k`，`k` 是 token/字符 比；每 400ms 重绘，**不做指数平滑**；最后一个 delta 超过 `IDLE=2000` 就从实时值切成平均值 `ST.oTok / (ST.decMs/1000)`（`decMs = Σ(completed - created)`，只累加正文 ≥50 字符的模型步），数字不会消失 |
| `k` 怎么来（`kAdj()`） | 遍历 `__ocMsgTime$`，只收 `c >= 200` 且单条比值落在 `0.25 < n/c < 1.2` 的消息，累加后取**聚合比** `sum(n)/sum(c)`；样本总字符不足 2000 时回退常量 `K=0.6` |
| 消息数据 | `loadSid()` 把每条消息存成 `M.set(m.id, {t: m.time, k: m.tokens, c: ch, p: model.providerID, m: model.id})`（`ch` = content 里 text + reasoning 字符数），同时累加 `ST.turns/steps/oTok/decMs/sttMs/spanMs/ctx`，完成后 `loadSess(sid)` 拉 `/api/session/<sid>` 拿会话累计 `tokens`；`loadModel(mid)` 拉 `/api/model` 找 `limit.context` 存进按 model id 索引的 `__ocCtxLimits$[mid]`（旧版是单值 `__ocCtxLimit$`，见坑「上下文上限串模型」），`curMid()` 取最新一条带 model 的消息、回退到 `ST.model.id` |
| sid 怎么找 | DOM 上不暴露当前会话 id。`guessSid()` 顺序：① `localStorage` 里 `opencode.desktop.window.<uuid>.last-active-url` 的 `/session/ses_xxx`；② `performance.getEntriesByType('resource')` 里最近的 `/api/session/<sid>/...`；③ 所有 `[data-tab-key]`（格式 `sidecar
/server/<b64>/session/ses_xxx`）。`syncSid()` 每 2 秒比对一次，切会话后自动重载；`loadSid` 最多 6 个 sid 并发，缓存进 `__ocMsgTime$`（Map） |
| 刷新 | `MutationObserver` 盯 `document.body`（120ms 节流）重绘；首页另有 15s 定时重绘兜底（`session.time.updated` 变化不一定触发 DOM 变更）；SSE 事件到达时立即 `paint()` | `syncSid()` 在每次 `paintAll()` 时按 2 秒限流检查当前会话是否切换。

时间不写进 asar 里的 chunk 常量，而是作为独立 IIFE 接在 `D_MULTI_JS` 之后（同样在 `p8=!0,m8=500,` 那条声明结尾的 `;` 之后，理由同「坑」里那条）。

### 四、文件定位（Ctrl+左键点路径 → 资源管理器选中文件）

三处配合，缺一不可：

| 位置 | 改什么 |
|---|---|
| `/out/preload/index.cjs`（F1） | 在 `exposeInMainWorld('electron', {…, getPathForFile:…})` 里加 `revealPath: t => e.ipcRenderer.invoke("oc:reveal-path", t)`。preload 是沙箱里的（`sandbox:!0`），没有 `shell`，只能靠 IPC 转给主进程 |
| `/out/main/index.js` 末尾追加（F2） | `import("electron").then(m => m.ipcMain.handle("oc:reveal-path", (e, t) => …))`：参数 `t` 支持字符串或 `{path, dir}`；`fs.existsSync` 为假时用 `fs.globSync("**/"+basename, {cwd: dir || dirname(path)})` 找同名文件（编辑卡片只显示文件名），还找不到就返回 `false`；找到就 `m.shell.showItemInFolder(p)`——正好是「打开所在目录 + 选中文件」。**不写死打包后的压缩变量名**，内置模块走 `process.getBuiltinModule("node:fs")`，升级后也基本不会失效 |
| renderer 注入 `inject/file-reveal.js`（跟着 D1，`T_FILE_JS`） | 全局 IIFE，`__ocFileBoot$` 防重入。`mousemove`（capture）在 Ctrl 按住且指到路径上时把 `cursor` 设为 `pointer`；`click`（capture）在 `ctrlKey && button===0` 时按优先级取路径：①`[data-slot="apply-patch-filename"]` 的文本 ②`document.caretRangeFromPoint(x,y)` 拿到文本节点，用正则取**点击位置那个 token** ③兜底整块 `<code>` 文本；然后 `absPath()` 归一化（去 `:12`/`:12:3` 行号、认盘符/UNC/Unix 绝对路径、相对路径拼会话目录）、`revealPath({path, dir})` |

- 会话目录怎么来：`ensureDir()` 先查 `__ocRowMap$`（首页渲染过才有），没有再页面内 `fetch(/api/session/<sid>)` 取 `location.directory`（Node 直连 401，页面内 fetch 带得上认证）；sid 从 `localStorage` 的 `last-active-url` 里抠。
- 点击时**必须** `preventDefault()` + `stopPropagation()`，否则 markdown 里的链接/选中行为会抢先。
- 含 `://` 的 token 一律不接管（`http://127.0.0.1:45278/...` 这类会被正则匹配成 `p://127.0.0.1:...`，要按子串判断而不是 `^https?:`）。

两个目标 chunk 必须**串行**重建：每替换一个文件会平移其后所有文件的 offset，第二个要在第一个的结果上继续（脚本里就是 `let out = source; for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。

## 坑（务必记住）

- **正文宽度拖拽（对齐 pi-desktop，2026-10-28 加）**：会话正文列是 `[class*="max-w-session"]`（`min-w-0 w-full max-w-full md:max-w-session md:mx-auto`，默认 `max-width:1000px`，`mx-auto` 居中，每个 turn 一个、实测 5 个同时在），所以调宽要**遍历所有**元素设 `style.maxWidth`（内联会盖掉 `md:max-w-session`）。手柄是 `[data-oc-width-grip]`：`position:fixed;display:flex;width:16px;height:190px;cursor:col-resize`，**内部常驻一条 3px 淡竖线**（`[data-oc-grip-line]`，`rgba(150,150,150,.22)`；悬停变 4px / `.62`，拖动时同亮态并在光标上方显示 `1200px` 小气泡 `[data-oc-grip-chip]`）—— 第一版整条手柄是 `10px` 全透明、只有 hover 才显色，老板实测「根本没看到拖拽手柄」，所以必须有常驻可见的细线。left 跟着 `els[0].getBoundingClientRect().right - 8` 走（垂直居中 `(innerHeight-190)/2`，列居中、垂直滚动不影响 left；不能拿「第一个 `[data-slot=session-turn-message-container]`」算位置，那个 turn 常常滚出屏幕、rect.bottom 是负的，会导致手柄一直 `display:none`）。拖动系数 **2**：`maxWidth = baseW + (clientX - baseX) * 2`（居中列，右缘动 1px 宽度变 2px 才跟手）；夹在 560 ~ `innerWidth-140`；存 `localStorage['oc-read-width']`；双击恢复默认（清 inline + 删 key）。 标记防重复 observe），任何布局变化即时 `rwPlace()`；再叠一层兜底：`window.addEventListener("click", …, true)` 后用 rAF 逐帧跟 1.5 秒（`rwTrack/rwTrackUntil`），覆盖过渡动画期间。实测每 80ms 采样 `grip.left` 与 `column.right-8`：开面板 24 点全对齐（1024→876），关面板 36 点 0 错位（876→1590）。另：拖动系数 2（`maxWidth = baseW + (clientX - baseX) * 2`），夹 560 ~ `innerWidth-140`，双击恢复默认；实测 1000→1200（拖 100px）、5 列同步、双击回 1000。
- **2.2.0 助手消息的 `text-part-meta` / `text-part-footer` 默认是 0（2026-10-27 实测）**：2.1.x 里每条正文末尾都有 `<div data-slot=text-part-footer><span data-slot=text-part-meta>`，时间/用量补丁靠它取宿主。2.2.0 把助手 turn 的工具+思考整块折叠进 `[data-component=collapsed-tool-group]`，折叠状态下正文 part 根本不渲染 —— `[data-slot=text-part-meta]`、`footer`、`copy-wrapper` 全是 0（实测 `metas=0 / usageCount=0 / doneTimes=[]`，但 `[data-oc-stats]` 统计行正常）。**这不是补丁没打上**，别去改锚点。`inject/time-stats.js` 现在有回退路径 `paintMsgRow()`：按 `[data-timeline-row=AssistantPart]` 整轮处理，在 `[data-slot=session-turn-message-container]` 末尾自建 `[data-oc-msg-line]`（`display:flex;justify-content:flex-end;gap:12px`）。代表消息不能取行上的 `data-message-id`（2.2.0 那里是**这一轮的用户消息 id**，只有 `time.created`），要遍历行内所有 `data-timeline-part-id` 里 `msg_` 前缀的 id，取 `__ocMsgTime$` 中 `time.completed` 最大的那条。行内若已渲染 `text-part-meta`（非折叠状态/旧版本）则跳过回退，避免重复显示。实测两条路径都出数：折叠组展开时 `metas=1`，纯折叠行 `line=1` 显示「用量 70.6K tok / 19:33」。
- **2.2.0 的思考块要先把工具组点开才有（2026-10-27 实测）**：历史会话 `[data-component=collapsed-tool-group]` 默认 `aria-expanded=false`，里面 `reasoning-part` 数是 0、`[data-reasoning-collapse]` 也是 0，`verify.mjs` 会报「页面上没找到思考块」。同理滚轮也没用（scrollHeight 会变，但 part 一直是 2~5 个）。点开一个组（`[data-slot=context-tool-group-trigger]` 的真实坐标，实测 (960,530) 那个「使用了 93 个编辑、Shell、compress 和写入」）后 part 130、思考块 48，verify 立刻通过。
- **2.2.0 还没进历史版本对照的细节**：`data-slot` 全量 94 个里已没有 `text-part-*`（只有 `user-message-copy-wrapper` 这类用户消息 slot）；助手正文在 `[data-component=markdown]` 里，但只在 reasoning 或折叠组展开时存在。
- **重启后会话正文要滚一下才渲染，`verify.mjs` 会假报「页面上没找到思考块」（2026-10-27 实测）**：桌面端重启后无论用标题栏 tab 还是首页点行打开会话，都只渲染末尾一两条消息 —— `[data-timeline-part-id]` 只有 2 个、`[data-reasoning-collapse]` 是 0，`.scroll-view__viewport` 的 `scrollHeight` 才 2102。在 `.scroll-view__viewport` 上执行 `scrollTop -= 1500` 滚 1~3 次、每次等 1.2 秒，会突然变成 26 个 part / 9 个思考块，verify 随即通过。**2026-10-27 复测：`scrollTop -= 1400` 和 `dispatchEvent(new WheelEvent(…))` 都无效**（`scrollTop` 动了、`scrollHeight` 不变，永远 3 个 part），只有真实滚轮才行 —— 用 CDP `Input.dispatchMouseEvent{type:'mouseWheel',deltaY:-1200}` 在 viewport 中心滚 8~12 次、每次等 1 秒，`scrollHeight` 1785→7435、part 3→81、思考块 0→37，`verify.mjs` 才通过（脚本：`C:\Users\xyw\AppData\Local\Temp\opencode\cdp-wheel.mjs <port> <deltaY> <times> <stepMs>`）。这不是补丁坏了，别改锚点；`--delete` 也要注意先回首页面板。

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → **Electron 启动失败，进程直接退出，连日志目录都不建**。`apply-patch.mjs` 已处理（`padEnd(jsonLen, ' ')` 且变长就报错）。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 直接「加载应用程序时发生错误」。脚本现在直接沿用原版 `dataStart` 并照抄尾部 padding 字节。
- 补丁是字符串替换，**替换出来的代码必须自检**：曾经因为分组数对不上，写出 `undefined.open` 让渲染进程崩（页面显示「加载应用程序时发生错误」）。脚本现在有自检（产物里出现 `undefined.<prop>` 就报错，另外检查 `home-session-delete` / 垃圾桶图标 / `showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):` / `globalThis.__ocMultiEnter$` / `__ocRegRow$` / `data-oc-multi` 都在、`e.onArchiveSession(` 与 `home-session-archive` 已消失）。
- **往 minified 的 `var`/`let` 声明列表里插东西，只能插 `name=expr` 形式的 declarator**：D1 锚点 `…,f8=B(…),p8=!1,m8=500;` 就是一条 `var` 声明，直接用逗号接一个 IIFE（`,(function(){…})()`）会 `SyntaxError: Unexpected token '('`——而且 `node --check` 只会把这口锅扣在**整行 chunk**（压缩后整个 bundle 就几行）上，行号完全没用。要么给 IIFE 一个赋值目标（`ZZ_X$=(function(){…})()`），要么像现在这样放到声明结尾 `;` 之后当独立语句。
- **minified 辅助函数名每版都可能换，别照抄旧版的 `x`/`U`/`Y`**：`P2_REPL` 的**开头**也必须用新名字重写（它复刻了被替换掉的那段 `effect(prop)` 调用）。2.1.1 里 route 的 effect 是 `V`、prop setter 是 `B`，而 `Y` 已经变成 Show 组件——写成 `x(()=>U(...))` 语法照样过，但运行时是错的。抽完 chunk 先数一遍 `V(()=>` / `U(Y,` 的出现次数确认谁是谁。
- 校验 asar 时注意：`node_modules/@lydell/node-pty-win32-x64/*` 这类文件属于 `app.asar.unpacked`，数据不在 asar 内，拿 asar 里的字节比对 integrity **必然 mismatch**——官方原版同样 mismatch（18 个），别误判成补丁打坏了。
- 启动失败时看渲染进程日志找真因：`%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的 `TypeError: ...` + 堆栈直接指向出错 chunk 的 `行:列`（对着抽出来的 chunk 数一下就知道是哪处替换）。
- **同一个调试口上可能有多个 Electron 页面**：本机跑着「本地服务管理器」时，`/json/list` 里第一个 page 是 `http://127.0.0.1:7900/`，`verify.mjs` 若直接取第一个 page 就会去查那个页面，报「页面上没找到思考块」——不是补丁坏了。`verify.mjs` 现在优先挑 `oc://renderer/index.html`，只在找不到时才退回第一个 page。
- **别写死调试口 9222**：Windows 上 Hyper-V / WSL / Docker 会占掉一段 TCP 保留端口（`netsh interface ipv4 show excludedportrange protocol=tcp`，本机实测有 `[1114,1613]`、`[9611,9710]`、`[50000,50059]` 等），9222 落进去时 Electron **绑不上也不报错**，表现为 `verify.mjs` 报「连不上调试口」。`debug-port.mjs` 会读保留区间 + `netstat` 占用，从 9222 往后挑第一个可用端口；`verify.mjs` 则反向扫 9222–9400 找已经在跑的那个。
- 改 asar **必须完全退出桌面端**再做，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已经变了）。
- 桌面端（`OpenCode.exe`）和后端（`opencode-cli.exe serve --service`）是两个进程：关掉窗口/重启桌面端**不会**重启后端，agent 会话不会断。所以可以放心 `taskkill /IM OpenCode.exe /F` 再重开。
- 官方原版备份命名 `app.asar.bak-<版本号>`（例如 `app.asar.bak-2.0.30`）。脚本发现已打过补丁又没有备份时会拒绝执行。
- 安装目录可能变（1.19.0 是 `@opencode-aidesktop`），脚本按「目录里有 `OpenCode.exe` 且 `resources\app.asar` 存在」来找。
- 老板本机曾出现：`app.asar.orig` 是旧版 2.0.29、安装目录是 2.0.30，用旧备份重放会把 renderer **降级**。判断版本要对比 asar 内 `/package.json` 的 `version` 和 `OpenCode.exe` 的 ProductVersion，别只看备份文件。
- **后端 API 端口每个进程都不一样**（这次是 `127.0.0.1:45278`，重启就变），时间补丁不要写死端口：从 `performance.getEntriesByType('resource')` 里找最近的 `http://127.0.0.1:<port>/api/` 前缀当 base。同理，**`/json/list` 里的页面也不止一个**（本地服务管理器），见上面那条。
- **当前会话 id 在 DOM 里查不到**（会话页 `[data-session-id]` 数量是 0，那是首页行专用）。别指望 `[data-session-id]`，也别信「最近一次 message 请求的 sid 就是当前会话」——切过 tab 后不是。补丁的做法是拿所有候选 sid 挨个 fetch 消息列表，用消息 id 命中判断。
- 时间补丁**不要塞进** `p8=!0,m8=500,` 那条逗号声明，理由和「坑」里 D1 那条完全一样（IIFE 直接接逗号会 `SyntaxError`）。现在统一放在 `D_MULTI_JS` 后面、以 `;` 分隔的独立语句。
- 回复时间的 meta 行**只在消息完成后才出现**，所以「流式中不显示时间」是天然的，不需要额外判断 `streaming`；反过来说，`verify.mjs --time` 在会话页必须等 2.5s 让 `/message` 请求回来，否则会误报。
- **2.1.2 桌面端不再用 HTTP 拉消息**：`performance` 里只有 `/api/info`、`/api/fs/find` 之类，没有 `/api/session/<sid>/message`，所以 `cands()` 的主力是 `[data-tab-key]`（13 个 tab 各带一个 `ses_xxx`）。API base 仍可从任意 `/api/` 资源 URL 的前缀取（`apiBase()` 就是干这个的），别改成只匹配 `/api/session/`。
- **别在正在流式输出的会话里验证时间**：那个会话的助手消息永远没有 `completed`，也就没有 meta 行，`verify.mjs --time` 和探测脚本都会读到空数组。切到任意历史会话（或首页）再验证。速度那项反过来，**必须趁正在输出时采样**才有数字。
- **流式中的消息在 DOM 里没有 `data-message-id`**：第一版按 DOM 里的消息 id 白名单过滤 SSE delta，结果一条都匹配不上（`hit: 0`）——`data-message-id` 只挂在已经结束的 `[data-timeline-row="AssistantPart"]` 上，正在输出的那条还没有。别做白名单，直接统计窗口内全部 delta。
- **`/api/event` 在 Node 里直连是 401**：`{"_tag":"UnauthorizedError","message":"Authentication required"}`，只有页面内 `fetch` 才带得上认证。所以调试速度只能注入到页面里跑（或用 CDP `Runtime.evaluate` 在页面上下文执行），别在外面写脚本拉。
- **token/字符 比不能用中位数，也不能只用聚合比**：中位数会被纯工具调用消息带偏（`tokens` 有值但 `content` 没文本，比值能到 5.96，中位数算出 0.794）；只用聚合比也会被少数异常样本拉高（实测 0.732 vs 真实 0.62）。正确做法是**先过滤再聚合**：`c >= 200` 且 `0.25 < n/c < 1.2`，剩下的 `sum(n)/sum(c)`。
- **速度口径：会话累计会被工具停顿稀释（2026-10-28 改，同日按 pi 再校准）**：老板明确要「以实际为准，取每轮的平均」，并补「参考其他 agent 比如 pi」「要力求准确」。会话累计 `Σoutput / Σ每轮墙钟` 把很多轮混在一起，看不出「这一轮到底多快」；现在显示**最后一轮**的生成速度，流式中用本轮累计字符估算。pi-desktop（`C:\Users\xyw\AppData\Local\Programs\PI-Desktop`）的口径是 `throughput = outputTokens / (responseDurationMs/1000)`（`DQ(e,t) => Math.round(e/(t/1e3))`，i18n 文案 `usageThroughput:"{{count}} tokens/s"`、估算带 `≈/约` 前缀、拿不到显示 `—`），并且把「网络请求耗时」（`providerWaitMs`，即发出请求到首个响应事件）和工具耗时**单列**，不混进速度。实测同一批消息：整步墙钟 5975ms / 纯生成窗口 2499ms，一个 468 tok 的轮次 = 78 tok/s（墙钟）vs **187 tok/s（纯生成）**；另一条 144 tok、part 时间只有 15ms 的畸形数据按墙钟算只有 5 tok/s，必须跳过。
- **`message.time.created` 里含 TTFT，不能直接当生成耗时（2026-10-28 修）**：`time = {created, streamed, completed}`，`created` 是「发出请求」，`streamed` 是最后一次流式更新，`completed` 是收尾 —— `completed - created` 把网络等待、首个 token 等待、以及同一 message 内的收尾全算进去，实测能把 187 tok/s 压到 78。**纯生成窗口**用 content part 自己的时间：`{type:'text'|'reasoning', text, time:{created, completed}}`，`genMs = message.time.streamed - min(part.time.created)`（`streamed` 缺失时退 `outLast`），`<300ms` 认为 part 时间被覆盖过、不可信。注意 `message.time.streamed` 和 `completed` 只差几十毫秒（老版本观察），所以 `streamed` 只能当上界，不能替代下界 `part.time.created`；单靠 `completed - streamed` 会算出 1.4 万 tok/s。
- **`tokens.output` 不含 `tokens.reasoning`（2026-10-28 实测）**：同一条消息里 `output:86` 而 `reasoning:514`、推理文本 1377 字符，若 output 含推理就不可能小于 reasoning；反过来 `output` 里还含 tool call 的参数 token（`state.input` 的 JSON 很长）。所以速度分子必须 `output + reasoning` 两项相加，并按字符比例 `kAdj()` 交叉校验（`tk/ch` 落在 0.25~1.2 才计入学习样本）。
- **速度窗口下限别给 500ms**：刚开口的第一秒窗口没填满，拿 500ms 当分母等于把速度乘二（实测飙到 296 tok/s）。下限至少 1000ms。
- **SSE 断了不会自动重连**：`connect()` 的 `catch` 只吞错误，用久了速度不显示就是这个原因。要修就加重连退避，别在 `paint` 里反复 `fetch`。
- **preload 是 `/out/preload/index.cjs`，不是 `.js`**：`extract-chunk.mjs 'out/preload/.*\.js$'` 会报 no match。`--static` 校验也必须单独读这个文件和 `/out/main/index.js`，只扫 `/out/renderer/assets` 是查不到文件定位那两项的。
- **`window.electron` 是 contextBridge 暴露的 frozen 对象**（`Object.isFrozen === true`），没法 monkey-patch `revealPath` 来记录调用。要验证「真的弹出资源管理器」，用 PowerShell COM 读窗口的选中项：`(New-Object -ComObject Shell.Application).Windows() | % { $_.Document.SelectedItems() }`，`showItemInFolder` 对已打开的窗口是**复用 + 改选中**，不会新增窗口，别拿窗口数量判断。
- **主进程补丁只能追加到 `/out/main/index.js` 末尾当独立语句**：那文件是 ESM，已经 `import` 了 `node:fs`、`electron`，但变量名全是压缩后的单字母（`p`/`d`/`o`），升级就变。追加的代码用 `import("electron").then(...)` + `process.getBuiltinModule("node:fs")` 自取，别引用任何现有标识符。
- **`fs.globSync` 要 Node 22+**（Electron 36 自带 Node 22，可用）。用它做「只给文件名」的兜底时，`cwd` 必须是**会话工作目录**，不是 `path.dirname(path)`——否则编辑卡片上的 `apply-patch.mjs` 会去会话目录以外的地方找，或者干脆找不到。所以 renderer 传给主进程的是 `{path, dir}` 而不是单个字符串。
- **`time.streamed` 只当上界，别单独用（2026-10-28 修正）**：`{created, streamed, completed}` 里 `streamed` 与 `completed` 只差几十毫秒（`msg_158676538001` 322 个 token 只差 23ms），`completed - streamed` 会算出 1.4 万 tok/s；它必须和 **part 的 `time.created`** 配对才是纯生成窗口。另外只统计正文 ≥20 字符的消息，否则纯工具调用消息会把 TPS 拉飞（实测 2223 tok/s → 168 tok/s）。
- **`tokens` 全是累计值**：每条 assistant 的 `tokens` 是该轮所有 step 的累计，`session.tokens` 是整会话累计，都不能当「当前上下文占用」。上下文用最后一条 assistant 的 `input + cache.read + cache.write`（再加 `output` 更接近下一轮输入规模）。另外缓存命中率用 `cache.read / (input + cache.read + cache.write)`，别把 output 算进分母。
- **上下文上限不能只存一个值**：旧实现 `if (!mid || globalThis.__ocCtxLimit$ || BUSY[...]) return;` 让 `__ocCtxLimit$` 一旦被写就永不更新，先打开过 200K 的会话（`cn:deepseek-v4.1-flash` / `deepseek-v4.1-flash-free` / `deepseek-v4-flash-free` 都是 200000），之后切到 1M 模型面板仍按 200K 算（50% 而不是 10%）。现在按 model id 存 `__ocCtxLimits$[mid]`，`curMid()` 取消息缓存里最后一条带 `model.id` 的记录（会话中途换模型也跟得上），查不到时 60 秒冷却（`__ocCtxTried$`），查到后写回 `__ocCtxLimit$` 只作兼容/人工排查。验证：往 `__ocMsgTime$` 插一条带别的 model 的记录 + 抖一下 DOM 触发重绘，看 `__ocCtxLimits$` 是否各自独立、百分比是否跟着变。
- **底部统计条要插在 `form[data-component="composer"]` 的父级、`form.nextSibling`**：`div[data-component="session-composer-dock"]` 带 `pointer-events-none`，插进去点击会被吞；`[data-oc-stats]` 自己也要 `pointer-events:auto`，否则三个 pill 点不开面板。
- **消息行的用量 pill 靠 `margin-left:auto` 推到右侧**，前提是宿主 `[data-slot="text-part-copy-wrapper"]` 是 `display:flex`（2.1.2 实测 `width:696px; gap:10px`）。别改成绝对定位，官方布局一变就会压到按钮上。
- **别用 `^https?://` 判断「是不是网页链接」**：正则把 `http://127.0.0.1:45278/x` 匹配出来的 token 是 `p://127.0.0.1:45278/x`（`[\w.@~-]+\.[A-Za-z0-9]{1,8}` 从 `p` 开始吃），前缀判断会漏掉，得用 `indexOf("://") >= 0`。

## 升级后锚点找不到怎么办

opencode 升级后 minified 代码会变，`apply-patch.mjs` 会明确报「锚点没找到」。此时：

1. 从 asar 里抽出所有 `/out/renderer/assets/*.js`，思考组件搜 `defaultOpen`、`data-timeline-part-id`、`ui.message.thought`；首页会话行搜 `onArchiveSession`、`home-session-archive`。
2. 看新版 `i=()=>...`（思考块展开状态）、`get open(){...}`、`onOpenChange:t=>{...}` 三处，以及 8 处删除按钮锚点的实际写法，更新 `apply-patch.mjs` 里的 `P1_FIND / P4_FIND / P8_FIND / P2_FIND` 和 `D_RULES`。文件定位那组还要确认 `/out/preload/index.cjs` 里仍有 `getPathForFile:t=>e.webUtils.getPathForFile(t)});` 这段（`F1_FIND`）；主进程那段是纯追加，不依赖旧代码，一般不会失效。
3. 重跑 dry-run，确认全部 OK 再 `--write`。

历史版本对照：
- 2.0.29：思考折叠 chunk `/out/renderer/assets/route-4O9GzN5h.js`（350831 字节），asar 176333529 → 约 176334560；**没有**首页删除按钮那段代码
- 2.0.30：思考折叠 chunk `/out/renderer/assets/route-CPNDqx0F.js`（355075 → 356889 字节）；删除按钮 chunk `/out/renderer/assets/main-CfL8Gr4d.js`（1321365 → 1321786 字节）；asar 176341661 → 176343896；`jsonLen` 2172835、`dataStart` 2172852 都不变
- 2.0.32：思考折叠 chunk `/out/renderer/assets/route-BYzALZ62.js`（357215 → 360467 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-CZyBNj5O.js`（1321667 官方原版 → 1330501，含多选删除 UI + 时间补丁，+8834）；asar 176346919（官方）→ 176359005；`jsonLen` 2172835、`dataStart` 2172852 仍不变
- 2.1.1：思考折叠 chunk `/out/renderer/assets/route-B8ouoQvI.js`（357032 → 360284 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-ptWBkiKT.js`（1311929 官方原版 → 1320763，+8834）；asar 176355995（官方）→ 176368081；`jsonLen` 2172835、`dataStart` 2172852 仍不变。这次变的是 minified 辅助函数名：route 里 `x`(effect)/`U`(prop setter) 变成 `V`/`B`（`Y` 现在是 Show 组件，**不能**再当 effect 用）；main 里 `jP`→`hP`（archive 图标）、`B3.Item`→`G4.Item`（右键菜单）、`bie/xie`→`p8/m8`（行按钮开关）
- 2.2.0：思考折叠 chunk `/out/renderer/assets/route-B6j9WPw6.js`（424406 → 427658 字节，+3252）；删除按钮+时间 chunk `/out/renderer/assets/main-Cs-Uxtxi.js`（2433134 官方原版 → 2498310，+65176（2026-10-28 实测，含 df2082f 统计行跟随会话、d063400 会话页 meta 行回退、tok/s 按会话分桶、平均速度回退、正文宽度拖拽、速度改 pi 的纯生成窗口口径））；`/out/preload/index.cjs` 832 → 887（+55）；`/out/main/index.js` 56505 → 57168（+663）；asar 233258702（官方，已存为 `app.asar.bak-2.2.0`）→ 233327466（2026-10-28 实测，同一套补丁内容，含手柄跟随审查面板）；静态 30 项全绿。**失效的锚点 5 处**：① P2 —— route 里 effect=`X`、prop setter=`k`（实测 `V(()=>` 0 处、`X(()=>k(` 39 处、`H(()=>` 123 处；`V` 已降级成挂载子节点 `V(parent,child)`，`H` 是 memo），原文变成 `X(()=>k(n,`data-timeline-part-id`,e.id)),n})()}`，P2_FIND / P2_REPL 前缀与内部两处 effect 调用一起改；② D1 —— 开关声明 `,f8=!1,p8=500;` 变成 `,fBt=!1,pBt=500,mBt=250,hBt=200,gBt=[56,38,66,46,30,52];`（开关 f8→fBt，且 500 后面还有三个常量，D1_REPL 要保留整段到 `gBt` 数组再追加注入代码）；③ D4 —— 归档图标 `F(VP,{name:`archive`})`→`M(VG,{name:`archive`})`（组件挂载 F→M）；④ D7 —— `F(y,{server…})`→`M(y,{server…})`；⑤ D8 —— `W4.Item`→`J$.Item`、文案渲染 `z`→`Jt`。P1/P4/P8/D2/D3/D5/D6/F1/F2 原样可用。
- 2.1.4：思考折叠 chunk `/out/renderer/assets/route-BCLDih8W.js`（380688 → 383940 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-BCYk92jp.js`（1314097 官方原版 → 1361573，+47476，2026-10-27 实测）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819139 → 819802（+663）；asar 178068364（官方，已存为 `app.asar.bak-2.1.4`）→ 178119810（2026-10-27 实测）。**失效的锚点 4 处**：① P2 —— effect/prop setter 又从 2.1.3 的 `H`/`V` 换回 2.1.1 的 `V`/`B`，原文变成 `V(()=>B(n,`data-timeline-part-id`,e.id))`，P2_FIND / P2_REPL 前缀与内部两处 effect 调用一起改（实测 `V(()=>` 44 处、`V(()=>B(` 28 处、`H(()=>` 0 处）；② D1 —— 首页按钮开关声明 `,p8=!1,m8=500;` 变成 `,f8=!1,p8=500;`（开关 p8→f8，常量 m8→p8）；③ D4 —— 归档图标组件 `hP`→`VP`；④ D8 —— 右键菜单组件 `G4.Item`→`W4.Item`。P1/P4/P8/D2/D3/D5/D6/D7/F1/F2 原样可用，静态标记 20 项全绿。
- 2.1.3：思考折叠 chunk `/out/renderer/assets/route-D__rI7PP.js`（369421 → 372673 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-DomFRUsy.js`（1312668 官方原版 → 1354617，+41949）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819130 → 819793（+663）；asar 178044242（官方，已存为 `app.asar.bak-2.1.3`）→ 178090161。**唯一失效的锚点是 P2**：route 里 effect 函数名从 `V` 换成了 `H`，原来的 `V(()=>B(n,...))` 现在写成 `H(()=>V(n,...))`（即 2.1.1 的 `V`=effect 在 2.1.3 里降级成 prop setter `V`，effect 挪到 `H`）。改 3 处即可：`P2_FIND` 与 `P2_REPL` 的开头前缀，以及 `P2_REPL` 内部两处 `'V(()=>{...})'` 的 effect 调用。P1/P4/P8/D1–D8/F1/F2 全部沿用，静态标记 19 → 20 项。补丁自身修复（2026-10-23，不动锚点）：① 上下文上限从单值 `__ocCtxLimit$` 改成按 model id 缓存 `__ocCtxLimits$[mid]`；② 上下文面板拆出「对话消息 / 工具结果 / 合计」。这一版同时含 f6a2abd 的 tok/s「钉住最后一帧」。
- 2.1.2：思考折叠 chunk `/out/renderer/assets/route-BKcp3psp.js`（359447 → 362699 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-CRF7GP33.js`（1312199 官方原版 → 1349482，含时间/用量/速度/统计 + 文件定位，+37283）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819112 → 819775（+663）；asar 176359724（官方）→ 176400977；`jsonLen` 2172835、`dataStart` 2172852 仍不变。**锚点零改动**：chunk 文件名变了，但 2.1.1 用的辅助函数名（`V`/`B`/`hP`/`G4.Item`/`p8`/`m8`）全部沿用，2.1.1 的脚本直接打完（19 项全绿）。演进过程：只加时间时 `main-CRF7GP33.js` 1312199 → 1321033（+8834）、asar 176371810；加 meta 行静态 tok/s 后 1321623 / 176372400；改成发送按钮旁实时速度后 1324000 / 176374777；加文件定位后 1329556 / 176381051（preload、main 各多一段）；参照 dsh 改成用量+统计面板后 1348522 / 176400017；tok/s 并入统计行并改用「只算正文步」的分母后 1349482 / 176400977。
