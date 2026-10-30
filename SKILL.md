---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）打十余组补丁：①聊天「思考」块流式中展开、思考结束后不立刻折叠（后面最后一块是正文、整轮真结束才直接折，还在调工具/还有下一段思考时都等整块滚出视口上方；折叠时补偿滚动、下方内容不动）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留；②首页每个会话行悬停时显示垃圾桶删除按钮，点击走官方删除确认框，**按住 Shift 点击直接删（不弹确认框）**，另有「多选删除」模式（右下角悬浮条或会话右键菜单进入，勾选多行一次删完）；③时间与用量（参照 dsh 布局）：每条助手回复的操作按钮行右侧显示「用量 33.2K tok」和完成时间（今天 `14:32`、同年 `10月16日 14:34`、跨年带年份），点用量弹「本轮用量」明细；输入框下方一行三块统计「⟳ 2 轮 37 步 · 97 tok/s」「▤ 1.6M tok · 缓存命中 95%」「◑ 1%」，三块都能点开对应面板（会话统计 / Token 用量 / 上下文已用）；tok/s 只显示在统计行第一块里（参考 pi 的「生成速度」口径：流式中是本轮累计的实时估算、带「约」，结束后落回该轮 tokens ÷ **纯生成时间**——不含 TTFT/网络等待/工具执行；title 里写明 tok 数与秒数）；首页每个会话行右侧显示最后活跃时间；④文件定位：在会话里 **Ctrl+左键点击文件路径**（正文里的路径、编辑/写入文件卡片上的文件名都行），用资源管理器打开所在目录并选中该文件；⑤「工作中」这一行中间有「展开 ▾ / 收起 ▴」按钮，一键展开或收起本轮全部思考与工具组；⑥双击思考块（标题行或正文都行）= 折叠/展开一次，开关条上的「双击思考」可关；⑦关掉最后一个文件标签页时自动收起右侧审查栏；⑧首页会话右键菜单顶部加「置顶 / 取消置顶」（CSS order 排序，不搬 DOM）；⑨兜底修 2.2.2 的「点击丢失」（审查栏的 x、折叠按钮只有 pointerdown 没有 click，是上游 bug）；⑩修官方 2.2.2 打包坏掉的 `pane-*.js`（顶层 `const n`/`var n` 重名，导致 45 个 browser 工具和内置浏览器整套消失，与 GitHub issue 60369 同因）；⑪「执行 / Shell」工具卡默认折叠，且「使用了 N 个…」汇总组手动展开后保持展开、点开时组内子项一律是折叠的（不连带全展开）。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了 / 首页删除按钮没了 / 删除太麻烦 / 看不到回复时间 / 看不到速度 / 点路径打不开目录 / 工作中那行没有展开按钮 / 双击思考块不能折叠 / 点 x 关不掉标签页 / 关完标签页审查栏不收 / 右键会话没有置顶 / browser 工具和内置浏览器没了 / 点开汇总组里面的思考全展开了 / 执行卡片没有默认收起 / 升级后要重新打补丁」时使用。
---

# opencode 桌面端补丁（删除按钮 + 时间/速度 + 文件定位 + 工作中展开 + 空页折叠 + 会话置顶 + 点击修复 + browser pane 修复）

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
- 直连 GitHub 超时就加代理：`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 pull --ff-only`。
- 拉失败一般是本地有未提交改动：先 `git stash -u` 备份再拉，别强拉、别 `reset --hard`。

```bash
# 1. 先看会改什么（dry-run，不动文件、不动进程）
node apply-patch.mjs

# 2. 真正写入（会自动：关掉桌面端 → 备份官方版为 app.asar.bak-<版本号> → 写补丁 → 再开回来）
node apply-patch.mjs --write

# 3. 等它起来后验证：静态标记 + 首页删除 / 时间用量（思考折叠已移除，verify 不再做行为验证）
node verify.mjs --static

# 4. 想撤销补丁、回到官方原版（自动关桌面端 → 用 app.asar.bak-<版本号> 盖回 → 再开回来）
node apply-patch.mjs --restore
```

只把产物打出来、不动安装目录也不关进程（离线检查 / 手动部署用）：

```bash
node apply-patch.mjs --out patched.asar
```

一条 `--write` 就够（关/开桌面端都自动做了，不会断会话：agent 跑在后端 `opencode-cli.exe serve --service` 里）。它还会顺手把 `commands/reasoning-patch.md` 装到 `~/.config/opencode/commands/`，让 `/reasoning-patch` 可用（内容没变时只打印「已是最新」）。`restart.mjs` 只在想单独重启时用。

**第 0.5 步：查官方日志，确认没有功能被官方做掉了（必做）**

`apply-patch.mjs` 每次运行都会自动调 `check-upstream.mjs`：读官方 release notes，范围是「安装目录里最旧的 `app.asar.bak-<版本>` → 当前版本」（跨版本升级也覆盖），拿每个功能的关键词去匹配。命中时打印原文，交互终端里逐条问「跳过这个补丁？(y/N)」，答 y 就把该功能当成 `--skip` 处理——注入的代码里真的不塞这个模块，顶部开关条也不再列它（不会留下按了没反应的死开关）。

也可以单独跑：

```bash
node check-upstream.mjs                 # 只查当前版本
node check-upstream.mjs --since 2.2.0   # 查 2.2.0 之后所有版本
node check-upstream.mjs --strict        # 有命中就退出码 1
```

`--skip` 的功能名：`home-delete` / `time-stats` / `file-reveal` / `work-fold` / `reason-dbl` / `feature-panel` / `pane-fold` / `session-pin` / `click-fix` / `browser-pane`。例：`node apply-patch.mjs --skip=work-fold --write`。不想查日志加 `--no-check`。

注意它只做提示、不做判断：命中关键词 ≠ 官方做了同一件事（官方说 activity pill 能展开 shell 输出，不等于我们的「工作中」行折叠该删），报告会给原文，由人拍板。


调试口不用管：`apply-patch.mjs` / `restart.mjs` 会调 `debug-port.mjs` 自动挑一个没被 Windows 保留、也没被占用的端口（`--port` 或环境变量 `OC_DEBUG_PORT` 可指定）；`verify.mjs` 不传 `--port` 时自己扫 9222–9400，连上后会打印 `调试口: <port>`。

`verify.mjs` 需要页面上有一个会话、且思考块已经长出来（2.2.2 里思考块默认裹在「使用了 N 个工具」的折叠组里，点一下 `[data-component=collapsed-tool-group] button` 就会渲染出来）。它现在检查的是「逐块折叠补丁确实不在了」：不应有 `[data-oc-fold-all]`、不应有 `__ocFoldQ$`，官方折叠行为（`[data-component=reasoning-part]` 标题行 `aria-expanded`）保持原样。

不想开调试口时用静态校验：`node verify.mjs --static`（自动找安装目录，也可 `--asar <path>` 指定某个 asar）——直接检查 asar 里各组补丁的 38 个标记（renderer chunk 34 个 + preload 1 个 + 主进程 2 个 + 开关条/双击思考若干），全在才退出码 0。

双击思考块的行为验证：`node verify.mjs --reason-dbl` —— 找不到思考块时会先点开一个折叠工具组，然后对第一个可视标题行派发 `click`+`click`+`dblclick`，断言 `aria-expanded` 翻转一次（`flipped=true`）；再往正文（`[data-component=markdown]`/`p`）派发一次 `dblclick`，断言 `bodyDblFlipped=true`（整块都能双击折叠）。需要桌面端带调试口。

删除/多选补丁的行为验证：`node verify.mjs --delete`（同样要桌面端带调试口）——检查首页行上有垃圾桶按钮、右下角悬浮条在、`__ocMultiEnter$`/`__ocRegRow$`/`__ocDeleteApi$` 三个全局钩子已注入。**判断首页要用 `[data-component=home-session-row]`，别用 `[data-session-id]`**（2.2.2 的侧栏 tab 也带这个属性，会话页同样有 19 个）。它只做存在性检查，不会真删东西。

时间/速度补丁的行为验证：`node verify.mjs --time`——在首页检查每行 `[data-oc-home-time]` 有时间；在会话页检查 `[data-slot="text-part-meta"]` 后面有 `[data-oc-done-time]`；速度检查 `__ocSpeedBoot$` 为真、`[data-oc-live-tps]` 和 `[data-oc-tps-wrap]` 存在（静止时也该有数字，流式时是实时值）。它等 2.5s 让 API 数据回来再判定；会话页要有已完成的回复。**当前正在流式输出的会话永远验证不了时间**（没有完成消息就没有 meta 行），要切到一个历史会话再跑；要看速度则必须趁它输出时用 `sample-speed.mjs` 这类采样脚本。

**测试脚本改动时不要直接 `--write`**（它会 `taskkill` 掉真实桌面端）。用假安装目录跑 dry-run / `--out`：

```bash
LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
# /tmp/fakelocal/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
```

## 补丁做了什么

三组补丁在同一次运行里全部打上，**任一目标锚点对不上就整体报错、不写文件**。

### 一、思考折叠（已移除，2026-10-28）

老板反馈这套折叠逻辑影响客户端稳定性、用起来明显变卡，要求整块删掉，恢复官方默认行为。所以：

- `apply-patch.mjs` 不再定位、不再改写思考组件所在的 `route-*.js`（那个 chunk 一个字节都不动）；P1 / P4 / P8 三条规则已删，相关常量也删了；
- `inject/fold-all.js`（右下角「收起全部」悬浮按钮）已删，D1 里不再注入；
- `verify.mjs --static` 反过来断言「产物里没有 `_rx$=globalThis.__ocReasoningOpen`、没有 `data-oc-fold-all`」；`node verify.mjs` 断言页面上没有收起按钮、没有 `__ocReasoningOpen` / `__ocFoldAllBoot$`。

如果以后又要做折叠，从 git 历史翻：`4434dcc`（单块恒展开 + 组级按钮）及其之前 `1b9d69a` / `8ddc75d`（整轮一次收）、更早的 P2 版本（单块 28px 折叠 + 底部「收起 ▴」+ 双击空白）。坑都留在下面「坑」一节的折叠条目里。

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
| `/out/main/index.js` 末尾追加（F2） | `import("electron").then(m => m.ipcMain.handle("oc:reveal-path", (e, t) => …))`：参数 `t` 支持字符串或 `{path, dir, rel, dirs}`。四级兜底（2026-10-28 加强）：①原文路径存在 → 直接选中；②`rel` 相对路径依次在 `dir` + `dirs`（首页各会话项目目录）下 `path.join` + `existsSync`（不做递归，快）；③只有文件名（编辑卡片）→ 在 `dir` 里 `fs.globSync("**/"+basename, {cwd})`；④仍找不到 → `shell.openPath(最接近的目录)` 打开目录当反馈，再返回 `false`（旧版直接 `false`，用户看到的就是「点了没反应」）。找到就 `m.shell.showItemInFolder(p)`——正好是「打开所在目录 + 选中文件」。**不写死打包后的压缩变量名**，内置模块走 `process.getBuiltinModule("node:fs")`，升级后也基本不会失效 |
| renderer 注入 `inject/file-reveal.js`（跟着 D1，`T_FILE_JS`） | 全局 IIFE，`__ocFileBoot$` 防重入。`mousemove`（capture）在 Ctrl 按住且指到路径上时把 `cursor` 设为 `pointer`；`click`（capture）在 `ctrlKey && button===0` 时按优先级取路径：①`[data-slot="apply-patch-filename"]` 的文本（2.2.0 官方包里仍有这个 slot，搜得到 3 处）②`document.caretRangeFromPoint(x,y)` 拿到文本节点，用正则取**点击位置那个 token** ③兜底整块 `<code>` 文本；然后 `absPath()` 归一化（去 `:12`/`:12:3` 行号、认盘符/UNC/Unix 绝对路径、相对路径拼会话目录）、`revealPath({path, dir, rel, dirs})` |

- 会话目录怎么来：`ensureDir()` 只认**当前 sid**——先 `__ocRowMap$.get(sid)`（首页渲染过才有），没有再页面内 `fetch(/api/session/<sid>)` 取 `location.directory`（Node 直连 401，页面内 fetch 带得上认证）；sid 从 `localStorage` 的 `last-active-url` 里抠。**绝不要「随便取首页第一条」当目录**（2026-10-28 踩过：首页 5 条全是别的项目，DIR 被固定成 `H:\GitWork2026\workbuddy-manager`，点相对路径就拼到错误项目 → 主进程找不到 → 表现为「定位失效」）；`DIR` 缓存必须与 `DIR_SID` 绑定，切会话自动重取。
- 主进程兜底顺序见上表 F2；找不到时至少 `openPath` 打开目录，别静默 `false`（否则完全看不出是哪一环断了）。
- 点击时**必须** `preventDefault()` + `stopPropagation()`，否则 markdown 里的链接/选中行为会抢先。
- 含 `://` 的 token 一律不接管（`http://127.0.0.1:45278/...` 这类会被正则匹配成 `p://127.0.0.1:...`，要按子串判断而不是 `^https?:`）。

两个目标 chunk 必须**串行**重建：每替换一个文件会平移其后所有文件的 offset，第二个要在第一个的结果上继续（脚本里就是 `let out = source; for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。

### 五、「工作中」行中间的展开/收起按钮（`inject/work-fold.js`，跟着 D1，`T_WORK_JS`）

2.2.x 把每个助手轮的思考、工具调用都收进 `[data-component="collapsed-tool-group"]`（默认折叠），看细节要一个个点开。这里在 timeline 底部「工作中」状态行中间放一个按钮，一键展开/收起**本轮**全部组。

| 位置 | 改什么 |
|---|---|
| renderer 注入 `inject/work-fold.js` | 全局 IIFE，`__ocWorkFoldBoot$` 防重入 |
| 行怎么找 | `[data-timeline-row="bottom-spacer"]` 内、**有子节点**的 `div.flex.h-9.items-center`。官方空的那行（子节点数 0）不插，所以不在工作时按钮不出现 |
| 「本轮」怎么定 | 从最后一个 `[data-slot="session-turn-message-container"]` 往前找，第一个含 `collapsed-tool-group` 的 turn（多轮之间不会互相影响） |
| 展开/收起怎么实现 | 点官方 `button[data-slot="collapsible-trigger"]`，**不自己改 React state**。全开时按钮显示「收起 ▴」，否则「展开 ▾」；点击时按当前状态决定对哪些组 click |
| 摆放 | `row.appendChild(btn)` + 行 `position:relative`，按钮 `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)`，实测中心偏移 0.0px |
| 样式 | 胶囊边框 `1px solid rgba(127,127,127,.35)`（中性灰，深浅主题都看得见）+ `opacity:.72`，hover 提亮；`<style id="oc-work-fold-css">` 注入 |
| 重渲染兜底 | React 会清掉注入节点：`MutationObserver`（120ms 节流）+ `setInterval(paint, 800)`（句柄存 `globalThis.__ocWorkFoldTimer$`，方便调试时 clearInterval） |

**为什么不用 `aria-expanded` 之外的状态源**：官方 trigger 的 `aria-expanded` 是唯一可靠的开合真相，自己的 map 会和 React 打架。

### 六、双击思考块标题行 = 折叠/展开一次（`inject/reason-dbl.js`，跟着 D1，`T_REASON_JS`）

背景：逐块折叠引擎被上游整组删除后，思考块只剩官方原生折叠（单击标题行切换）。老板要「双击也能折叠」，这里做最小补充。

| 位置 | 改什么 |
|---|---|
| renderer 注入 `inject/reason-dbl.js` | 全局 IIFE，`__ocReasonDblBoot$` 防重入，html 上打 `data-oc-reason-dbl="1"` |
| 监听 | `document.addEventListener('dblclick', …, true)`（capture，先于 React 的冒泡处理） |
| 命中条件 | `ev.target.closest('[data-component="reasoning-part"]')` —— **整块都算**（标题行、正文、代码块），老板 2026-10-30 明确要「双击正文也折叠」。代价是正文双击选词被 `preventDefault` 吃掉，这是刻意的 |
| 动作 | `part.querySelector('[data-slot="collapsible-trigger"]').click()` 补一次；`ev.preventDefault()` 防选中 |
| 为什么补一次 | 真实双击 = `click` + `click` + `dblclick`，官方那两次 click 在 `aria-expanded` 上互相抵消（实测 `false → true → false`），第三下正好净切换一次；不需要读当前状态 |
| 开关 | `localStorage['oc-feat:reason-dbl']`，默认开；关掉后 `__ocReasonDblBoot$` 不设、监听不挂 |

验证：`node verify.mjs --reason-dbl`（标题行、正文各双击一次，两次都要翻转；详见上面「怎么做」节）。

### 七、顶部功能开关条（`inject/feature-panel.js`，跟着 D1，`T_FEAT_JS`，**必须第一个注入**）

标题栏 `[data-slot="titlebar-v2"]` 是官方窗口拖动区（子元素带 `[app-region:no-drag]`），开关条用 `position:absolute;left:50%;top:0;height:100%;transform:translateX(-50%)` 挂在它上面，自身加 `-webkit-app-region:no-drag`，所以能拖动窗口也能点按钮。实测 6 项时侧栏布局下宽 585px（5 项时 487px），在标题栏里居中。Top tabs 布局下改贴左侧竖排（`data-oc-feat-vert`，见「坑」节）。

| 项 | 说明 |
|---|---|
| 存储 | `localStorage['oc-feat:<key>']`，**缺省 = 开**，只有显式 `'0'` 才关（保证没动过的人行为不变） |
| key | `home-delete`（删除按钮+多选）、`time`（时间用量速度统计）、`reveal`（文件定位）、`workfold`（工作中展开）、`reason-dbl`（双击思考块折叠）、`pane-fold`（空页折叠）、`session-pin`（会话置顶）、`click-fix`（点击修复）、`width`（正文宽度拖拽） |
| 读取 | 统一 `globalThis.__ocFeatOn$(key)`，内部 try/catch，localStorage 被禁时返回 true |
| 生效方式 | 点击 → 写值 → 90ms 后 `location.reload()`。**不做热插拔**：React 那几处（图标/文案/点击）只在渲染时读值，逐模块拆卸不可靠 |
| 兜底 | `setInterval(build, 1500)`，标题栏被 React 重建时补回节点并同步 `aria-checked` |
| 自绘样式 | `<style id="oc-feat-bar-css">`：26×14 轨道 + 10px 白点（开时 `translateX(12px)`、轨道 `#6366f1`），常态 `opacity:.62`、hover 1 |

各模块的判断点：

- `inject/work-fold.js` / `inject/file-reveal.js`：IIFE 顶部 `if (globalThis.__ocFeatOn$ && !__ocFeatOn$(key)) return;`
- `inject/time-stats.js`：定义 `ON_TIME` / `ON_WIDTH`，`paintMsg` / `paintHome` / `paintStats` 与 `ensureStats`（速度共用这个容器，不加会留下 `data-oc-stats` 空壳）各自开头 return，`rwBoot` 开头关掉并摘掉 `rwState.grip` / `rwState.chip`
- `D2` / `D5` 文案、`D4` 图标：在 getter 里就地判断，关时回落 `e.language.t(\`common.archive\`)` / `M(wG,{name:\`archive\`})`
- `D6` 点击：关时 `return e.onArchiveSession(e.record.session)`
- `D_MULTI_JS`：开头 `if (globalThis.__ocFeatOn$ && !__ocFeatOn$(\`home-delete\`)) return;`
- **注意**：`D3` 把 `data-action` 字面量换成 `home-session-delete` 是静态字符串，开关管不到；行为由 D6 兜住（关掉点击就是归档），只是 DOM 标记名不变，属于内部标识，不影响使用。

### 八、让会话默认展开（改的是设置，不是代码）

老板要求「会话默认展开」时不用动 chunk——官方 2.2.x 自带的「时间线详情」设置就是干这个的。

| 项 | 值 |
|---|---|
| 存储 | `C:\Users\JS\AppData\Roaming\ai.opencode.desktop\drafts.sqlite` → 表 `state`，`name='default.dat'`，`key='settings.v3'` |
| 字段 | JSON 里的 `general.timelineDetail.{shell,edit,thinking,subagents,notices,tools,commentary}` |
| `placement` | `separate`（不归组、独立铺开）/ `grouped`（塞进 `collapsed-tool-group`，整体折叠）/ `hidden` |
| `details` | `collapsed` / `expanded` |

**默认全展开 = 七项全 `placement:'separate'`**（`shell`/`edit`/`thinking` 再加 `details:'expanded'`），等同于设置面板里的「everything」预设。默认的 `grouped` 就是「思考折成一行、点开才看得到」的根因，跟 `details:'expanded'` 无关——`details` 只管组内条目，组本身由 `placement` 决定。

**改法**：先 `taskkill /IM OpenCode.exe /F` 等它退干净 → 用 `node:sqlite` 的 `DatabaseSync` 读改写 → 再启动。进程退出时会把内存里的旧设置回写，所以顺序不能反。

**验证**：会话里 `[data-component="collapsed-tool-group"]` 数量为 **0**，`[data-component="reasoning-part"]` 里 `button[aria-expanded="true"]`，且 reasoning 区块高度是全文高度（几百上千 px）而不是一行。

**注意**：这是运行时数据不是补丁，`--restore` 不会动它；桌面端重置设置或换机后要重做一遍。**当前状态（2026-10-29）：老板试过全展开后主动要求改回官方默认 `grouped`，所以现在保持 grouped，本节只作为需要时的操作手册。**

### 九、关掉最后一个标签页 → 自动收起审查栏（`inject/pane-fold.js`，跟着 D1，`T_PANEFOLD_JS`）

- 观察 `body`（subtree），`touchesPane()` 只认 `#review-panel` / `[role=tablist]` / `[role=tab]` 的增删，其他 DOM 抖动直接 return。
- **判定必须是「上一轮 > 0，这一轮 === 0」**：首次 `last = -1` 只记录不动作，否则「点开审查栏」那一刻 tab 数从无到有/从有到无会把刚打开的栏又关掉。节流 120ms。
- 折叠动作一律走 `document.querySelector('[aria-label="切换审查"]').click()`（别自己改 style，官方有 `--panel-hold-width` 动画锁）。

### 十、首页会话右键「置顶 / 取消置顶」（`inject/session-pin.js` + `P1`）

排序用 CSS `order`，**不搬 DOM**（Solid 用节点引用做 diff，搬节点会乱）：

- 存储 `localStorage['oc-pin-sessions']` = `[{id,title}]`，下标就是置顶顺序。
- `apply()` 遍历 `[data-slot="sidebar-inbox-item"]`，按 `titleOf()`（第二行 `span[dir="auto"]` 的文本）匹配，设 `style.order = -1000 + idx`，加 `data-oc-pinned`（`box-shadow: inset 2px 0 0 #6366f1`）。Solid 会清掉 inline style，所以挂 MutationObserver + 150ms 节流持续补。

**两个大坑（都是实测踩出来的）：**

1. **2.2.2 有两套会话菜单**。b) 首页会话列表的 ContextMenu 才是老板日常用的那个，它的 props 只有 `{archived,onArchive,onUnarchive,onDelete}`，**拿不到 session.id**。所以 `session-pin.js` 用 `document.addEventListener('contextmenu', …, true)` 把「这次右键的是哪一行」记进 `globalThis.__ocPinCurrent$`，菜单项无参调用 `__ocPinToggle$()` / `__ocPinLabel$()`，用 `targetTitle()` 兜底。
2. **`P1` 的锚点整段替换 `get fallback(){…}`，不能只替换里面那一项**。原来写 `P1_CTX_ITEM + CTX_MENU_ANCHOR` 拼出来是 `return A,B`，逗号运算符只返回 `B`，置顶项被静默吃掉（菜单只剩「归档|删除」，构建却报 OK）。正确写法是 `get fallback(){return[A,B]}`，见 `P1_CTX_FIND` / `P1_CTX_REPL`。

菜单项文案用 `get children(){return globalThis.__ocPinLabel$?__ocPinLabel$():'置顶'}` 直接返回字符串（不要套 `Zt`/`Jt`，也别拼 `'…'`，置顶不是要弹窗的项）。

### 十一、点击丢失兜底（`inject/click-fix.js`，跟着 D1，`T_CLICKFIX_JS`）

- 症状：审查栏的 x、折叠按钮「点了没反应」，但 JS `.click()` 有效。
- 根因（2.2.2 上游 bug，与我们补丁无关）：CDP 事件日志只有 `pointerdown → pointerup`，**没有 mousedown/mouseup/click**；`pointerdown` 的 target（按钮内 `<svg><use>`）在 `pointerup` 时 `isConnected === false` —— 按下瞬间 Solid 重建了节点，Chromium 因此不合成 click。同排的「添加标签页」序列完整，可作对照。
- 兜底逻辑：capture `pointerdown` 记坐标 + `got=false`；capture `click` 置 `got=true`；capture `pointerup` 后 `setTimeout(0)` 里若还没 `got`、位移 ≤8px、1500ms 内，则 `document.elementFromPoint()` → `closest('button,[role="button"],a[href]')` → `.click()`。跳过 `disabled` / `aria-disabled="true"`。
- 标记 `__ocClickFixBoot$` / `<html data-oc-click-fix="1">`。已验证：真实鼠标点折叠按钮 480→0、真实点非活跃 tab 的 x 能关。

### 十二、browser 工具全丢（`P2`，`--skip=browser-pane` 可跳）

- 官方 2.2.2 的 `/out/main/pane-CwHDCUMq.js` **本身语法错误**：同一 ESM 顶层 `const n=e.createRequire(import.meta.url);`（offset 76，死变量）与 `var n=ct(…)`（offset 1849，真正在用的）撞名 → `Identifier 'n' has already been declared`，与 GitHub #60369 一字不差。该文件 MD5 与官方备份相同，**不是本地补丁造成**。
- 因果链：pane 动态 `import()` 必然 reject → 报 `browser.pane.unavailable` → 45 个 `browser.*` 工具（定义就在 pane.js 里）从未注册 → UI 无 Browser 入口、agent 无 browser 工具。日志里看不到这条错，因为动态 import 失败被 Electron 吞了。
- 修法：只删那 41 个字符（`84183 → 84142`），锚点 `const n=e.createRequire(import.meta.url);` + 校验 `var n=ct(` 存在。
- 验证：catalog 出现 `browser (45 tools)`、`tabs.open`/`snapshot`/`tabs.focus` 均可用。`browser.screenshot` 需要窗口可见（最小化/后台时必失败，是 Chromium 限制，不是补丁问题）。

### 十三、功能开关搬进「设置 → 桌面端补丁」（`settings-page`）

- 顶部那排小开关改成**默认关闭**（`oc-feat:bar` 缺省即关），所有开关统一收到设置的独立页里；想要快捷条可以在这页最下面再打开。
- 实现是纯 DOM 注入，不碰上游组件树：往 `.settings-sidebar` 末尾插一个 `button[role=tab][data-oc-settings-tab]`（文字「桌面端补丁」），面板自己建成 `div[data-oc-settings-panel]` 挂到 `.settings` 下，点我们的 tab 时给 `.settings-content` 加 `data-oc-hide-native` 把原生内容藏掉，点任意原生 tab 就收起。
- 10 行开关复用 `__ocFeatOn$`/`__ocFeatSet$`，键：`home-delete` `time` `reveal` `workfold` `reason-dbl` `pane-fold` `session-pin` `click-fix` `width` `bar`；每行一句人话说明，底部「重载界面」按钮。
- 按用途分成 4 组、可折叠：`home` 首页与会话（会话删除按钮、会话置顶）、`read` 阅读与消息（时间与用量、工作中展开、双击折叠思考、正文宽度）、`fix` 点击与文件（点击丢失兜底、文件定位）、`ui` 界面（空页自动折叠、顶部快捷条）。组标题是 `<button class="grp-hd">`（`▶` 旋转 90° 当展开态），折叠态记在 `localStorage['oc-set-fold:<group>']`（`'1'`=收起、`'0'`=展开），**缺省全部收起**（没记录就当收起，老板要求打开先看到四个标题）。
- 点开我们的页面时给 `.settings-sidebar` 加 `data-oc-ours="1"`，CSS 把 `[data-slot="tabs-v2-trigger-wrapper"]` 的背景压成透明 —— 原生 tab 的选中底纹画在 wrapper 上（`rgb(58,58,58)`），光清 `aria-selected` 不够。
- 入口：首页（左侧栏「主页」）→ 正文区左下角「设置」（实测中心 `442,655`）。
- 已验证：设置页 tabs 13 → 14，我们的面板 `[619,45,720,886]`、10 行开关、点开关 localStorage 与 `aria-checked` 同步、顶部条消失。

### 十四、执行/Shell 卡默认折叠 + 汇总组「点开就是全折的」（`inject/reason-fold.js`，跟着 D1，`T_REASONFOLD_JS`）

老板最终确认的需求（m02305 选 C + m02443 追加）：

- **A**：「执行 / Shell」这类工具卡默认收起来，点开才看参数和 Output；**思考块本身不动**（上游默认就是折的）。
- **B**：「使用了 N 个…」汇总组手动展开后要**保持展开**（上游约 4–6 秒会自己折回）；而且**点开后组里的子项必须是折叠的**，不许连带全展开。

实现要点：

- 单选器：`button[data-slot="collapsible-trigger"]`；标题 `[data-slot="basic-tool-tool-title"]`；汇总组 trigger 里是 `[data-component="context-tool-group-trigger"]`。
- **子项的标记是 `data-slot="context-tool-group-item"`，不是 `data-component`**（`querySelectorAll('[data-component=context-tool-group-item]')` 永远是 0）。
- `foldItems(grp)`：组展开时把组内所有 `aria-expanded="true"` 的子 trigger（跳过组自己那个）逐个 `.click()` 收起来。
- 三张表：`KEEP`（老板手动展开过，别再折）、`SHUT`（老板手动折过，别再开）、`LAST`（600ms 去重，click-fix 会补发一次）。
- 归因用 **pointerdown 那一刻**的 `aria-expanded` 判定方向，不要延时读状态（延时窗口里自己的 fold 会先动手，永远读错）。
- `triggerAt()` 兜底：点在组标题空白处时 `ev.target` 不在 button 内（实测 `closest` 为空），要依次用「最近的 collapsed-tool-group → 它的第一个 trigger」和 `elementsFromPoint` 元素栈找回来。
- **key 必须给组和子项分命名空间**（`g|` / `p|`）。实测组的 fallback key 和组内第一个子项撞成同一个 `rid#0`，于是「点组」的 KEEP 把第一个子项也豁免了 —— 症状正是「点开后第一个『思考』永远折不上，其它 70 个都折了」。
- 调度：MutationObserver(120ms 节流) + `setInterval(fold, 300)`。300ms 是因为上游折回后要尽快顶开，慢了能看见闪一下。
- 实测（pid 20776 / 9222 / 71 个 trigger）：展开后 6 秒内只有组标题 open；点收起后 6 秒保持收起。

## 坑（务必记住）

- **`window.electron` 是 contextBridge 冻结对象，hook 不了（2026-10-28 实测）**：想验证 ctrl+click 有没有调到主进程，别写 `window.electron.revealPath = ...` 记录日志——`Object.isFrozen(window.electron) === true`，赋值静默失效，`String(window.electron.revealPath)` 永远是 `function () { [native code] }`，最后会误判成「handler 没跑」。直接测 `window.electron.revealPath({path, dir, rel, dirs}).then(r=>r)` 的返回值（`true` = 找到并已选中，`false` = 没找到、此时主进程会打开目录）。
- **`--write` 重启后调试口不一定是 9222（2026-10-28 实测）**：9222 落进 Windows 保留区间或被残留进程占着时，`debug-port.mjs` 会挑 9223/9224……`verify.mjs` 自己会扫 9222–9400，但**手写 CDP 脚本别把端口写死**；`go-home-fast.mjs` 已改成自动扫。
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
- **2.2.2：切会话后 part 是渐进长出来的，别在 3 秒内判「没思考块」（2026-10-30 实测）**：用真实点击打开历史会话后，`[data-timeline-part-id]` 先是 1 个、`[data-reasoning-collapse]` 是 0，5~6 秒后才长到 19 个 part / 9 个思考块；这时直接跑 `verify.mjs` 会报「页面上没找到思考块」。等 6 秒（或轮询 part 数 > 0）再跑，不用滚轮。
- **2.2.2：`el.click()` 打不开会话、也切不动 tab，必须用 CDP 真实鼠标事件**：对 `a[data-slot=tab-link]` 调 `.click()` 或 `history.pushState` 都没反应（`data-active` 不变、body 不变），要 `Input.dispatchMouseEvent` 依次发 `mouseMoved` + `mousePressed` + `mouseReleased`（同一坐标、`button:'left'`）。坐标要先 `scrollIntoView({block:'center'})` 再取 `getBoundingClientRect()`，中间别隔太久（列表会重排）。打开会话后要等 10 秒左右正文才长出来，别急着判失败。
- **2.2.2：侧栏 tab 也带 `data-session-id`，判断「在不在首页」必须用 `[data-component=home-session-row]`（2026-10-30 实测，最坑的一条）**：会话页上 `document.querySelectorAll('[data-session-id]').length` 也是 19（来自 `data-slot=tab-link` 的垂直标签栏），于是 `verify.mjs --time` 会把会话页当首页，报 `homeTimes=[]` 假 ❌；`--delete` 更会因为会话页没有行按钮而假失败。已修：`--time` 新增 `homeRows` 字段并以它判 `okHome`/`onHome`，`--delete` 的 `rows` 改成数 `[data-component=home-session-row]`。手动排查同理，别再用 `[data-session-id]` 当「首页」的判据。
- **2.2.2：删除按钮是行的兄弟节点，不在行内部**：首页行是 `<button data-component="home-session-row">`，垃圾桶 `<button data-action="home-session-delete">` 挂在行的**父 DIV** 里，所以 `row.querySelector('[data-action=home-session-delete]')` 永远是 null，要用 `row.parentElement.querySelector(...)`。`verify.mjs --delete` 已按这个改。
- **2.2.2：`localStorage['oc-feat:home-delete']==='0'` 时整段删除补丁早退，`__ocMultiBoot$`/`__ocRowMap$`/`__ocMultiEnter$` 全都不存在**（2026-10-30 实测）：`D_MULTI_JS` 第一句就是 `if (globalThis.__ocFeatOn$ && !__ocFeatOn$('home-delete')) return;`，早退发生在设置任何全局之前。现象很像「补丁没打进去」（页面里其余 `__ocTimeBoot$`/`__ocFileBoot$` 都在，只有 delete 那组全无）。排查顺序：先看 `Object.keys(localStorage).filter(k=>k.startsWith('oc-feat'))`，把它设回 `'1'` 再 `location.reload()`。功能开关条是低透明度的可点元素，用坐标点「主页」时容易误触把某项关掉。
- **2.2.2：首页活跃时间是 MutationObserver + 15 秒定时器补的，回首页后立刻跑 `verify.mjs --time` 会假报 `homeTimes=[]`（2026-10-30 实测）**：`paintHome()`（`inject/time-stats.js:426`）遍历 `[data-session-id]`，从 `__ocRowMap$.get(id).session.time.updated` 取时间戳 —— 数据一直在（实测 17 行时 `__ocRowMap$` size=17、`feat time=true`、`[data-slot=home-session-labels]` 宿主也在，`[data-oc-home-time]` 稍后就有 17 个），只是渲染完到补绘制之间有空档。`verify.mjs` 已改成最多轮询 8 秒（`[data-oc-home-time]` 出现即返回）；手动排查时先确认元素数 > 0 再下结论，别信一次快照。
- **2.2.2：界面模式（Top tabs / Side tabs / Inbox）不存在任何本地存储里，只能按 DOM 判**（2026-10-30 实测）：`%APPDATA%\ai.opencode.desktop\opencode.settings` 只有 `tauriMigrated`/`pinchZoomEnabled`/`oldLayoutEligible`/`windowIds`/`firstLaunchOnboardingComplete`/`defaultServerUrl`/`backgroundColor`；localStorage 里没有 interfaceMode 之类的键、`IndexedDB` 目录是空的、`/config` 返回 404。功能开关条因此按 DOM 判：**Top tabs → `[data-slot=titlebar-v2] [data-slot=tab-link]` 有 N 个（实测 9）、`[data-slot=vertical-tabs-sidebar]` 为 null；Side tabs → 标题栏内 0 个、sidebar 存在**（层级是 `titlebar-v2 > titlebar-tabs > titlebar-tab-item > tab-link`）。切换后 1.5 秒内 `applyLayout()` 自动换位，实测 Top tabs 开关条 **106×110 @ (8,415)** 竖排在左侧垂直居中（`data-oc-feat-vert`，5 项时），Side tabs 横排在标题栏中间（5 项 487×44 @ (365,0)，6 项 585×44 @ (316,0)）。Top tabs 下左侧没有会话列表（消息区居中留白 ~180px），竖排不会压正文；设置页左侧导航从 x≈180 起，也不重叠。
- **2.2.2：双击思考块折叠是「整块」生效（标题行 + 正文），正文双击不再选词**（2026-10-30 实现，老板先要标题行、看完改成整块）：真实双击 = `click` + `click` + `dblclick`，官方那两次 click 在 `aria-expanded` 上互相抵消（实测序列 `false → true → false`），所以在 `dblclick`（capture）里补一次 `trigger.click()` 就净切换一次，不需要判断前后状态。正文上双击时官方 click 为 0 次，补一次同样等于切换一次 —— 两种情况共用一套逻辑。实测：正文双击 `true → false`、标题行双击 `false → true`。思考块默认裹在「使用了 N 个工具」折叠组里，`[data-component=reasoning-part]` 一开始是 0；`[data-slot=context-tool-group-trigger]` 在 2.2.2 已经不存在，点开用 `[data-component=collapsed-tool-group] button`（`.click()` 有效，实测 0 → 40 个 part）。
- **2.2.2：设置页能用 CDP 打开并切布局（验证主题判定时很省事）**：向页面发 `Ctrl+,`（`Input.dispatchKeyEvent` 依次 `rawKeyDown` + `char` + `keyUp`，`modifiers:2`、`key:','`、`code:'Comma'`、`windowsVirtualKeyCode:188`、`nativeVirtualKeyCode:188`）就能打开设置；它不改 URL、没有 `role=dialog`，只能靠 `[data-slot=settings-row-title]` 出现来判定。「偏好设置」页顶部就是三张布局卡片（Top tabs / Side tabs / Inbox），用 `textContent.trim()==='Side tabs'` 找到文本节点、取中心坐标后发真实鼠标三连（`mouseMoved`/`mousePressed`/`mouseReleased`）点一下即可切换，`Escape` 退回应用。**别去改 `opencode.settings` 文件**，那里没有这个键（改了也没用）。
- **2.2.2：`Ctrl+,` 打不开设置页，真正的入口是首页正文区底部那两个按钮（2026-10-30 实测）**：首页（点左侧栏「主页」后）正文区左下角有 `设置` 和 `帮助` 两个 268×28 的按钮（实测 `设置@308,641`，中心 `(442,655)`），点它设置页才以覆盖层铺在主区域；顶部「OpenCode 菜单 → 文件 → 设置」那条路在本机点不开（子菜单 SubTrigger 一直 `data-closed`）。设置页 DOM：`DIV.settings-screen > DIV.settings[data-component=tabs-v2][data-variant=settings] > (.settings-mobile-nav + ASIDE.settings-sidebar + DIV.settings-content)`，导航项是 `button[role=tab][data-slot=tabs-v2-trigger][data-value=<key>]`，内容区只渲染当前选中的 `DIV[role=tabpanel].settings-panel`。`document.title` 不变，`location.href` 一直是 `oc://renderer/index.html`（内存路由），**别 `history.pushState` 到 `/settings`**——既不生效，之后一 reload 还会渲染成 `Not found`（只能 `location.href='oc://renderer/index.html'` 救回来）。
- **往设置页塞自定义面板：`.settings` 没有 `position:relative`，`position:absolute;left:260px` 的包含块是外层，会把左侧导航整块盖住（2026-10-30 实测）**：实测 `.settings=[291,45,1048,886]`、`.settings-sidebar=[291,45,328,886]`、`.settings-content=[619,45,720,886]`，而 panel 落在 `[276,44,1078,895]`。修法是运行期给 `.settings` 补 `style.position='relative'`，再按 `.settings-sidebar` 的实宽写 `panel.style.left`（不要写死 260）。
- **`TypeError: Jt is not a function` 会把整个渲染器打成「出了点问题」，根因是 D8 注入里写成了 `Jt(`（2026-10-30 踩了）**：同一个 children 数组里原生删除项用的是 `Zt(()=>e.language.t(\`common.delete\`))`，注入的多选删除也必须是 `Zt(()=>"多选删除")`。写成 `Jt` 时编译能过、静态自检也能过（只查 `__ocMultiEnter$` 在不在），但首页一渲染就抛，页面上只剩错误页。抽出来的 chunk 里对着报错 `行:列` 定位最快（`main-new.js:2905:3506` 正好落在 `Jt(()=>"多选删除")` 上）。

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
- 2.2.2：删除按钮+时间 chunk `/out/renderer/assets/main-DApoQvPT.js`（2493582 官方原版 → 2577153，+83571，fc46058 口径：单块折叠整组废除 + 工作中行折叠 + 标题栏功能开关条；2026-10-30 依次加了「Top tabs 时开关条竖排到左侧」+2179（2572811 → 2574990）、「双击思考块折叠」+2163 → 2577153，再把命中范围放宽到整块 +186 → 2577339）；`/out/preload/index.cjs` 832 → 887（+55）；`/out/main/index.js` 55622 → 56795（+1173）；asar 235090929（官方，已存为 `app.asar.bak-2.2.2`）→ **235175914**（+84985，含竖排开关条 + 整块双击思考）。静态 **38 项**全绿，`--delete` / `--time`（会话页 + 首页）/ `--reason-dbl` / `verify` 行为验证通过；**同一版不再改 `route-*.js`**（思考折叠由 `1969f87`/`4434dcc` 整组删除，改看 `__ocWorkFoldBoot$` + `data-oc-work-fold` 的工作中行折叠）。**失效的锚点 4 处**（都在 main chunk，`route-*.js` 已彻底不打）：① D1 —— 开关 `,WKt=!1,GKt=500,KKt=250,qKt=200,JKt=[56,38,66,46,30,52];`（结构同上版，变量名全新）；② D4 —— 归档图标 `M(wG,{name:\`archive\`})`（2.2.1 的 `N(AG,…)` → 现在 `M` + `wG`）；③ D7 —— `showDelete:(e,t)=>r.show(()=>M(y,{server:e,session:t}))`；④ D8 —— `M(U$.Item,…)`（SDK 菜单别名 `K$`→`U$`，文案渲染仍是 `Zt(`）。D2/D3/D5/D6/F1/F2 原样可用。**这一版 asar 里带 `main-*.js.map`（12MB），改锚点可直接读源码，比 grep minified 快得多。**
- 2.2.1：思考折叠 chunk `/out/renderer/assets/route-Cf4rFCmg.js`（443522 → 443590 字节，+68 —— 单块折叠整套删掉后只剩 `i()=()=>!0` 与两个声明）；删除按钮+时间 chunk `/out/renderer/assets/main-DwDHTs01.js`（2447622 官方原版 → 2518522，+70900，含「收起全部」组级按钮）；`/out/preload/index.cjs` 832 → 887（+55）；`/out/main/index.js` 55623 → 56796（+1173）；asar 233357959（官方，已存为 `app.asar.bak-2.2.1`）→ 233430155（2026-10-28 实测）。静态 33 项全绿。**失效的锚点 5 处**：① P2 —— effect 从 `k(` 变成 `d(`（`X(()=>d(n,\`data-timeline-part-id\`,e.id)),n})()}`，P2_FIND 前缀与内部两处一起改）；② D1 —— 开关 `,YBt=!1,XBt=500,ZBt=250,QBt=200,$Bt=[56,38,66,46,30,52];`（只有 `!1` 变 `!0` 这一处不同，其余变量名全新）；③ D4 —— 归档图标 `M(VG,{name:\`archive\`})` → 新增图标组件走 `N(AG,...)`（挂载函数 M→N，图标组件 VG→AG）；④ D7 —— `M(` → `N(`；⑤ D8 —— `W4.Item` 的 SDK 别名 `J$`→`K$`、委托函数 `Jt(`→`Zt(`。P1/P4/P8/D2/D3/D5/D6/F1/F2 原样可用。
- 2.2.0：思考折叠 chunk `/out/renderer/assets/route-B6j9WPw6.js`（424406 → 427658 字节，+3252）；删除按钮+时间 chunk `/out/renderer/assets/main-Cs-Uxtxi.js`（2433134 官方原版 → 2498310，+65176（2026-10-28 实测，含 df2082f 统计行跟随会话、d063400 会话页 meta 行回退、tok/s 按会话分桶、平均速度回退、正文宽度拖拽、速度改 pi 的纯生成窗口口径））；`/out/preload/index.cjs` 832 → 887（+55）；`/out/main/index.js` 56505 → 57168（+663）；asar 233258702（官方，已存为 `app.asar.bak-2.2.0`）→ 233327466（2026-10-28 实测，同一套补丁内容，含手柄跟随审查面板）；静态 30 项全绿。**失效的锚点 5 处**：① P2 —— route 里 effect=`X`、prop setter=`k`（实测 `V(()=>` 0 处、`X(()=>k(` 39 处、`H(()=>` 123 处；`V` 已降级成挂载子节点 `V(parent,child)`，`H` 是 memo），原文变成 `X(()=>k(n,`data-timeline-part-id`,e.id)),n})()}`，P2_FIND / P2_REPL 前缀与内部两处 effect 调用一起改；② D1 —— 开关声明 `,f8=!1,p8=500;` 变成 `,fBt=!1,pBt=500,mBt=250,hBt=200,gBt=[56,38,66,46,30,52];`（开关 f8→fBt，且 500 后面还有三个常量，D1_REPL 要保留整段到 `gBt` 数组再追加注入代码）；③ D4 —— 归档图标 `F(VP,{name:`archive`})`→`M(VG,{name:`archive`})`（组件挂载 F→M）；④ D7 —— `F(y,{server…})`→`M(y,{server…})`；⑤ D8 —— `W4.Item`→`J$.Item`、文案渲染 `z`→`Jt`。P1/P4/P8/D2/D3/D5/D6/F1/F2 原样可用。
- 2.1.4：思考折叠 chunk `/out/renderer/assets/route-BCLDih8W.js`（380688 → 383940 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-BCYk92jp.js`（1314097 官方原版 → 1361573，+47476，2026-10-27 实测）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819139 → 819802（+663）；asar 178068364（官方，已存为 `app.asar.bak-2.1.4`）→ 178119810（2026-10-27 实测）。**失效的锚点 4 处**：① P2 —— effect/prop setter 又从 2.1.3 的 `H`/`V` 换回 2.1.1 的 `V`/`B`，原文变成 `V(()=>B(n,`data-timeline-part-id`,e.id))`，P2_FIND / P2_REPL 前缀与内部两处 effect 调用一起改（实测 `V(()=>` 44 处、`V(()=>B(` 28 处、`H(()=>` 0 处）；② D1 —— 首页按钮开关声明 `,p8=!1,m8=500;` 变成 `,f8=!1,p8=500;`（开关 p8→f8，常量 m8→p8）；③ D4 —— 归档图标组件 `hP`→`VP`；④ D8 —— 右键菜单组件 `G4.Item`→`W4.Item`。P1/P4/P8/D2/D3/D5/D6/D7/F1/F2 原样可用，静态标记 20 项全绿。
- 2.1.3：思考折叠 chunk `/out/renderer/assets/route-D__rI7PP.js`（369421 → 372673 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-DomFRUsy.js`（1312668 官方原版 → 1354617，+41949）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819130 → 819793（+663）；asar 178044242（官方，已存为 `app.asar.bak-2.1.3`）→ 178090161。**唯一失效的锚点是 P2**：route 里 effect 函数名从 `V` 换成了 `H`，原来的 `V(()=>B(n,...))` 现在写成 `H(()=>V(n,...))`（即 2.1.1 的 `V`=effect 在 2.1.3 里降级成 prop setter `V`，effect 挪到 `H`）。改 3 处即可：`P2_FIND` 与 `P2_REPL` 的开头前缀，以及 `P2_REPL` 内部两处 `'V(()=>{...})'` 的 effect 调用。P1/P4/P8/D1–D8/F1/F2 全部沿用，静态标记 19 → 20 项。补丁自身修复（2026-10-23，不动锚点）：① 上下文上限从单值 `__ocCtxLimit$` 改成按 model id 缓存 `__ocCtxLimits$[mid]`；② 上下文面板拆出「对话消息 / 工具结果 / 合计」。这一版同时含 f6a2abd 的 tok/s「钉住最后一帧」。
- 2.1.2：思考折叠 chunk `/out/renderer/assets/route-BKcp3psp.js`（359447 → 362699 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-CRF7GP33.js`（1312199 官方原版 → 1349482，含时间/用量/速度/统计 + 文件定位，+37283）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819112 → 819775（+663）；asar 176359724（官方）→ 176400977；`jsonLen` 2172835、`dataStart` 2172852 仍不变。**锚点零改动**：chunk 文件名变了，但 2.1.1 用的辅助函数名（`V`/`B`/`hP`/`G4.Item`/`p8`/`m8`）全部沿用，2.1.1 的脚本直接打完（19 项全绿）。演进过程：只加时间时 `main-CRF7GP33.js` 1312199 → 1321033（+8834）、asar 176371810；加 meta 行静态 tok/s 后 1321623 / 176372400；改成发送按钮旁实时速度后 1324000 / 176374777；加文件定位后 1329556 / 176381051（preload、main 各多一段）；参照 dsh 改成用量+统计面板后 1348522 / 176400017；tok/s 并入统计行并改用「只算正文步」的分母后 1349482 / 176400977。
