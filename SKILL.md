---
name: desktop-reasoning-patch
description: 给 opencode 桌面端（Electron）打四组补丁：①聊天「思考」块流式中展开、思考结束后不立刻折叠（后面最后一块是正文、整轮真结束才直接折，还在调工具/还有下一段思考时都等整块滚出视口上方；折叠时补偿滚动、下方内容不动）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合状态跨重挂载保留；②首页每个会话行悬停时显示垃圾桶删除按钮，点击走官方删除确认框，**按住 Shift 点击直接删（不弹确认框）**，另有「多选删除」模式（右下角悬浮条或会话右键菜单进入，勾选多行一次删完）；③时间与速度：每条助手回复末尾追加完成时间（如「· 14:32」），首页每个会话行右侧显示最后活跃时间（今天 HH:MM、跨天 MM/DD），输入框发送按钮左侧**实时显示当前输出速度**（如「142 tok/s」，流式时出现、结束后约 2 秒淡出）；④文件定位：在会话里 **Ctrl+左键点击文件路径**（正文里的路径、编辑/写入文件卡片上的文件名都行），用资源管理器打开所在目录并选中该文件。在老板升级 opencode 桌面端之后（补丁被覆盖），或老板说「思考折叠没了 / 首页删除按钮没了 / 删除太麻烦 / 看不到回复时间 / 看不到速度 / 点路径打不开目录 / 升级后要重新打补丁」时使用。
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
8. 每条助手回复末尾显示完成时间（2026-10-19 新增）：官方 meta 行「Build · 模型 · 耗时」后面追加「· 14:32」；流式进行中不显示，消息完成才出现
9. 首页每个会话行右侧显示最后活跃时间（2026-10-19 新增）：今天显示 `HH:MM`，跨天显示 `MM/DD`，跨年显示 `YYYY/MM/DD`；悬停时排在项目名和垃圾桶按钮之间，不重叠
10. 输入框发送按钮左侧**实时显示输出速度**（2026-10-21 新增，替代原来的「回复末尾静态 tok/s」）：订阅页面内 SSE（`/api/event`）统计 `session.text.delta` / `session.reasoning.delta` 的字符增量，按 2.5 秒滑动窗口 + token/字符 比例换算成 tok/s；流式时出现，最后一个 delta 后约 2 秒淡出
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

不想开调试口时用静态校验：`node verify.mjs --static`（自动找安装目录，也可 `--asar <path>` 指定某个 asar）——直接检查 asar 里四组补丁的 17 个标记（renderer chunk 14 个 + preload 1 个 + 主进程 2 个），全在才退出码 0。

删除/多选补丁的行为验证：`node verify.mjs --delete`（同样要桌面端带调试口）——检查首页行上有垃圾桶按钮、右下角悬浮条在、`__ocMultiEnter$`/`__ocRegRow$`/`__ocDeleteApi$` 三个全局钩子已注入。**需要先切到首页**（在会话视图里 `[data-session-id]` 为 0，会报失败）。它只做存在性检查，不会真删东西。

时间/速度补丁的行为验证：`node verify.mjs --time`——在首页检查每行 `[data-oc-home-time]` 有时间；在会话页检查 `[data-slot="text-part-meta"]` 后面有 `[data-oc-done-time]`；速度检查 `__ocSpeedBoot$` 为真、`[data-oc-live-tps]` 元素存在（数字只在流式时才有，静态检查看不到）。它等 2.5s 让 API 数据回来再判定；会话页要有已完成的回复。**当前正在流式输出的会话永远验证不了时间**（没有完成消息就没有 meta 行），要切到一个历史会话再跑；要看速度则必须趁它输出时用 `sample-speed.mjs` 这类采样脚本。

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

### 三、时间与速度显示（跟着 D1 一起注入 `T_TIME_JS` + `T_SPEED_JS`，全局 IIFE）

| 位置 | 做什么 |
|---|---|
| 回复完成时间 | 监听 DOM，对每个 `[data-slot="text-part-meta"]`（官方「Build · 模型 · 耗时」那行）在后面追加 `<span data-oc-done-time>· HH:MM</span>`。消息 id 取最近的 `[data-component="text-part"][data-timeline-part-id]` 前缀（`msg_xxx:text:0` → `msg_xxx`），兼容祖先 `[data-message-id]`；时间来自 `GET /api/session/<sid>/message` 的 `time.completed`，没有 `completed`（还在流式）就不显示 |
| 首页活跃时间 | 对每个 `[data-session-id]` 行，在 `[data-slot="home-session-labels"]` 末尾追加 `<span data-oc-home-time>`，值取 `__ocRowMap$` 里该会话的 `session.time.updated`；今天 `HH:MM`，跨天 `MM/DD`，跨年 `YYYY/MM/DD` |
| 实时速度（`T_SPEED_JS`） | 在 `[data-slot="composer-actions"]` 里 `insertBefore` 一个 `<span data-oc-live-tps>`（发送按钮左侧，11px、`opacity:.5`、`tabular-nums`）。`fetch(apiBase()+"/api/event")` 用 `getReader()` + `TextDecoder` 按 `\n\n` 分帧，取 `data: ` 行的 JSON；`session.text.delta` / `session.reasoning.delta` 的 `delta` 是**增量文本**，把 `{t: performance.now(), n: delta.length}` 推进 `D` |
| 速度算法 | `WIN=2500` 滑动窗口，`span = max(1000, min(WIN, now - 最老样本))`，`raw = sum(n)/span*1000*k`，`k` 是 token/字符 比；每 400ms 重绘，**不做指数平滑**（2.5s 窗口本身就是移动平均，再平滑会让响应变慢、结束回落拖沓）；最后一个 delta 超过 `IDLE=2000` 就清空并 `display:none`，这 2 秒里数字随样本滑出自然衰减 |
| `k` 怎么来（`kAdj()`） | 遍历 `__ocMsgTime$`，只收 `c >= 200` 且单条比值落在 `0.25 < n/c < 1.2` 的消息，累加后取**聚合比** `sum(n)/sum(c)`；样本总字符不足 2000 时回退常量 `K=0.6` |
| 消息数据 | `loadSid()` 把每条消息存成 `M.set(m.id, {t: m.time, k: m.tokens, c: ch})`（`ch` = content 里 text + reasoning 字符数）；`paintMsg()` 用 `M.get(pid) || M.get(rid)` 取回，只取 `rec.t.completed` 画 `· HH:MM`，并顺手 `remove()` 旧版本残留的 `[data-oc-tps]` |
| sid 怎么找 | DOM 上不暴露当前会话 id。先扫 `performance.getEntriesByType('resource')` 里的 `/api/session/<sid>/...`，再扫所有 `[data-tab-key]`（格式 `sidecar\n/server/<b64>/session/ses_xxx`，2.1.2 实测 13 个 tab 全在里面，**这条是主力**：2.1.2 的桌面端不再用 HTTP 拉消息，performance 里根本没有 `/api/session/.../message` 记录）；最多取 6 个 sid 并发拉，命中就缓存进 `__ocMsgTime$`（Map，实测一次能缓存 269 条消息时间） |
| 刷新 | `MutationObserver` 盯 `document.body`（120ms 节流）重绘；首页另有 15s 定时重绘兜底（`session.time.updated` 变化不一定触发 DOM 变更）；SSE 事件到达时立即 `paint()` |

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
- **速度窗口下限别给 500ms**：刚开口的第一秒窗口没填满，拿 500ms 当分母等于把速度乘二（实测飙到 296 tok/s）。下限至少 1000ms。
- **SSE 断了不会自动重连**：`connect()` 的 `catch` 只吞错误，用久了速度不显示就是这个原因。要修就加重连退避，别在 `paint` 里反复 `fetch`。
- **preload 是 `/out/preload/index.cjs`，不是 `.js`**：`extract-chunk.mjs 'out/preload/.*\.js$'` 会报 no match。`--static` 校验也必须单独读这个文件和 `/out/main/index.js`，只扫 `/out/renderer/assets` 是查不到文件定位那两项的。
- **`window.electron` 是 contextBridge 暴露的 frozen 对象**（`Object.isFrozen === true`），没法 monkey-patch `revealPath` 来记录调用。要验证「真的弹出资源管理器」，用 PowerShell COM 读窗口的选中项：`(New-Object -ComObject Shell.Application).Windows() | % { $_.Document.SelectedItems() }`，`showItemInFolder` 对已打开的窗口是**复用 + 改选中**，不会新增窗口，别拿窗口数量判断。
- **主进程补丁只能追加到 `/out/main/index.js` 末尾当独立语句**：那文件是 ESM，已经 `import` 了 `node:fs`、`electron`，但变量名全是压缩后的单字母（`p`/`d`/`o`），升级就变。追加的代码用 `import("electron").then(...)` + `process.getBuiltinModule("node:fs")` 自取，别引用任何现有标识符。
- **`fs.globSync` 要 Node 22+**（Electron 36 自带 Node 22，可用）。用它做「只给文件名」的兜底时，`cwd` 必须是**会话工作目录**，不是 `path.dirname(path)`——否则编辑卡片上的 `apply-patch.mjs` 会去会话目录以外的地方找，或者干脆找不到。所以 renderer 传给主进程的是 `{path, dir}` 而不是单个字符串。
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
- 2.1.2：思考折叠 chunk `/out/renderer/assets/route-BKcp3psp.js`（359447 → 362699 字节，+3252）；删除按钮 chunk `/out/renderer/assets/main-CRF7GP33.js`（1312199 官方原版 → 1329556，含时间 + 实时速度 + 文件定位，+17357）；`/out/preload/index.cjs` 838 → 893（+55）；`/out/main/index.js` 819112 → 819775（+663）；asar 176359724（官方）→ 176381051；`jsonLen` 2172835、`dataStart` 2172852 仍不变。**锚点零改动**：chunk 文件名变了，但 2.1.1 用的辅助函数名（`V`/`B`/`hP`/`G4.Item`/`p8`/`m8`）全部沿用，2.1.1 的脚本直接打完（17 项全绿）。演进过程：只加时间时 `main-CRF7GP33.js` 1312199 → 1321033（+8834）、asar 176371810；加 meta 行静态 tok/s 后 1321623 / 176372400；改成发送按钮旁实时速度后 1324000 / 176374777；加文件定位后 1329556 / 176381051（preload、main 各多一段）。
