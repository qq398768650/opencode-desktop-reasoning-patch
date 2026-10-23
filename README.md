# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮 + 时间/速度显示 + 文件定位）

给 [opencode](https://opencode.ai) 桌面端（Electron）加四组官方没有的交互，脚本一次全部打上。

## 一、思考折叠

**边想边展开 → 想完先摊着 → 整轮结束（最后是正文）才直接折，还在调工具就等滚出屏幕（下方内容不动）→ 点开还能看**

## 二、首页会话删除按钮

**首页每个会话行悬停时显示垃圾桶按钮 → 点击弹官方删除确认框 → 确认后删掉该会话**

**一次删很多**：按住 **Shift** 点垃圾桶 = 跳过确认框直接删；或进**多选删除**模式（右下角悬浮条点「多选删除」，或会话右键菜单选「多选删除」），点行勾选（可「全选」），按「删除 N」→「确认删除 N」一次删完。

## 三、时间 / 用量 / 速度（布局参照 dsh）

**每条助手回复的操作按钮行右侧补上 `用量 33.2K tok   10月16日 14:34`（点用量弹本轮明细）→ 输入框下方一行三块统计 `⟳ 2 轮 37 步 · 97 tok/s` / `▤ 1.6M tok · 缓存命中 95%` / 圆环 1%，三块都能点开面板 → tok/s 就在第一块里：只有助手真正在输出时才出现，取 2 秒滑窗的实时值（叠一层指数平滑 0.4），输出结束后固定停在最后一帧的值上，不消失也不换成平均值 → 首页每个会话行右侧显示最后活跃时间（今天 `14:32`，跨天 `10/16`）**

## 四、文件定位

**在会话里 `Ctrl + 左键`点文件路径 → 资源管理器打开所在目录并选中该文件**

正文里的磁盘路径（`C:\a\b.ts`、`src/index.ts`、`apply-patch.mjs`，带 `:12` 行号也认）、编辑/写入文件卡片上的文件名都能点。Ctrl 按住悬停在路径上会变成手型；相对路径按当前会话的工作目录解析，目录里没有同名文件时再递归找一次。`http://` 之类的网页链接不接管。

---

## 效果

### 思考折叠

| # | 行为 |
|---|---|
| 1 | 思考**流式输出时展开**，正文实时可见 |
| 2 | 思考结束后**不立刻折叠**：后面**最后一块是正文**（整轮结束）就直接收；还在调工具（工作中）或只有下一段思考时，才等这块**整块滚出视口上方**再收。收起时补偿滚动，下方内容原地不动 |
| 3 | 折起后点**标题**可重新展开 |
| 4 | 展开状态下，点底部 **「收起 ▴」**、**双击空白处**、或再点标题，都能收起 |
| 5 | 手动开合过的块**不会被自动折叠**，状态在滚动/重渲染后也不丢 |

### 首页会话删除按钮

| # | 行为 |
|---|---|
| 1 | 首页会话行**悬停**时右侧出现垃圾桶按钮（默认隐藏，鼠标移开消失） |
| 2 | 点击弹**官方删除确认框**，确认后会话被删除 |
| 3 | **Shift + 点击**垃圾桶 = 跳过确认框，直接删 |
| 4 | 右下角悬浮条「多选删除」（或会话右键菜单「多选删除」）进多选模式：点行勾选、可「全选」，「删除 N」按一次变「确认删除 N」，再按就批量删完 |
| 5 | 复用官方写死关闭的删除开关 + 官方 `onDeleteSession`，不自己实现删除逻辑；只影响首页会话行，会话页里的归档按钮不动 |

### 时间 / 用量 / 速度

| # | 行为 |
|---|---|
| 1 | 每条助手回复的操作按钮行右侧显示 **`用量 33.2K tok`** 和完成时间 **`10月16日 14:34`**（今天只显示 `14:32`，跨年带年份），靠右对齐 |
| 2 | 点「用量」弹 **本轮用量** 面板：总量、提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理 |
| 3 | 消息还在流式输出时**不显示**，回复完成才出现 |
| 4 | 输入框下方一行三块统计：**`⟳ 2 轮 37 步 · 97 tok/s`**、**`▤ 1.6M tok · 缓存命中 95%`**、**圆环 1%**（圆环按百分比填充） |
| 5 | 三块都能点开：**会话统计**（模型用时 / 工具调用用时 / 单步平均耗时 / 输出速度 TPS）、**Token 用量**（总量、缓存命中、未缓存输入、缓存读取、输出、其中推理）、**上下文已用**（百分比、`~12K / 1M`、进度条、对话消息占用） |
| 6 | **tok/s 只出现在统计行第一块**（`⟳ 2 轮 37 步 · 84 tok/s`）：流式中订阅页面内 SSE 的 `session.text.delta` / `session.reasoning.delta`，按 2 秒滑动窗口统计字符增量、乘 token/字符 比得到实时值，再叠一层指数平滑（新值权重 0.4）压住跳动 |
| 7 | 最后一个 delta 后约 **2 秒**停止刷新，把最后一帧的实时值**钉住显示**（不消失、也不换平均值）；整段均速看第一块面板里的「输出速度（TPS）」（`Σoutput / Σ(completed - created)`，只算正文 ≥50 字符的模型步） |
| 8 | 首页每个会话行右侧显示**最后活跃时间**：今天 `HH:MM`、跨天 `MM/DD`、跨年 `YYYY/MM/DD`；悬停时排在项目名和垃圾桶之间，不重叠 |
| 9 | 数据从后端 `/api/session/<sid>/message`（`time` / `tokens` / `model`）、`/api/session/<sid>`（会话累计 `tokens`）、`/api/model`（`limit.context`）取；速度走页面内 SSE，不轮询接口、不改数据结构、不额外存盘 |

官方 2.0.x 只有「默认展开」和「默认折叠」两种静态行为，没有上面第一套；首页也只有一个「归档」入口，没有删除按钮；消息末尾只有「模型 · 耗时」，没有绝对时间；输入框也没有任何速度显示；点路径只会选中文本，不会打开目录。

### 文件定位

| # | 行为 |
|---|---|
| 1 | 会话正文里出现文件路径时，**Ctrl+左键点击** → 资源管理器打开所在目录并选中该文件 |
| 2 | 认这些写法：`C:\a\b.ts`、`\\server\share\x`、`src/index.ts`、`apply-patch.mjs`，带 `:12` / `:12:3` 行号也能剥掉 |
| 3 | 编辑/写入文件卡片上的文件名也能点（只显示文件名时，主进程会在会话目录里递归找同名文件） |
| 4 | Ctrl 按住悬停在路径上，光标变手型；点中的链接不会被浏览器/应用拦走（`preventDefault`） |
| 5 | `http://` 之类的网页链接不接管，照旧是链接 |
| 6 | 实现：preload 暴露 `revealPath` → 主进程 `ipcMain.handle("oc:reveal-path")` → `shell.showItemInFolder`；不改官方任何逻辑 |

---

## 环境要求

- Windows
- Node.js 18+
- opencode 桌面端（Electron 版，安装目录下有 `resources\app.asar`）

支持版本：**2.1.4**（2.1.3 / 2.1.2 / 2.1.1 / 2.0.32 / 2.0.29 的锚点写法不同，见文末版本对照表）。opencode 升级后 minified 代码会变，锚点失效时脚本会明确报错，需要按下面「升级后锚点找不到」更新。

**发布约定：本仓库的 tag / GitHub Release 版本号 = 适配的 opencode 桌面端版本号**（如 `v2.1.3`）。补丁修复本身不单独升版本，发到同一个 tag 上——版本号只表示「这份脚本能直接打的 opencode 版本」。

四组补丁是**同一次运行里全部打上**的：任一目标的锚点对不上，脚本会报错并**不写文件**（不会出现只打一半的情况）。

### 斜杠命令 `/reasoning-patch`（`--write` 时自动安装）

仓库里的 `commands/reasoning-patch.md` 是一条 OpenCode 斜杠命令，装上以后在输入框敲 `/reasoning-patch` 就能让 agent 按流程重打补丁（拉最新 → dry-run → `--write` → 验证）。

`node apply-patch.mjs --write` 会顺手把它复制到 `~/.config/opencode/commands/reasoning-patch.md`，内容有变化才覆盖，输出里会打印「已安装斜杠命令」或「斜杠命令已是最新」。命令文件是热加载的，不用重启 OpenCode。

> 补丁本身（asar 里的 chunk）和斜杠命令是两套机制：前者改桌面端，后者只是 OpenCode 读的 markdown。脚本已经帮你把两者串起来，不需要手动复制。

---

## 快速开始

```bash
git clone https://github.com/qq398768650/opencode-desktop-reasoning-patch.git
cd opencode-desktop-reasoning-patch

# 1. 先看会改什么（dry-run，不动文件、不动进程）
node apply-patch.mjs

# 2. 真正写入（自动：关桌面端 → 备份官方版 → 写补丁 → 再开回来）
node apply-patch.mjs --write

# 3. 验证：历史思考块默认折叠，点一下能开、再点能收
node verify.mjs

# 3b. 不想开调试口时，可以先做静态校验（直接查 asar 里四组补丁的 20 个标记）
node verify.mjs --static

# 3c. 只查删除/多选补丁有没有注入（要先切到首页；只查存在性，不会真删）
node verify.mjs --delete

# 3d. 只查时间/速度补丁（首页看行时间、会话页看回复完成时间、检查实时速度的启动标记；要在有已完成回复的历史会话里跑）
node verify.mjs --time

# 3e. 采样实时速度（趁助手正在输出时跑，每 500ms 读一次发送按钮旁的 tok/s）
node sample-speed.mjs

# 4. 想撤销补丁、回到官方原版（自动：关桌面端 → 盖回备份 → 再开回来）
node apply-patch.mjs --restore
```

只想先把产物打出来看/手动部署（不碰安装目录、不关桌面端）：

```bash
node apply-patch.mjs --out patched.asar
```

`--write` 会自动完成关/开桌面端，**不会断会话**——agent 跑在后端进程 `opencode-cli.exe serve --service` 里，和桌面窗口是两个进程。

只想单独重启桌面端：`node restart.mjs`。

---

## 文件

| 文件 | 作用 |
|---|---|
| `apply-patch.mjs` | 主脚本：找安装目录 → 定位两个 renderer chunk（+ preload、主进程）→ 打四组补丁 → 重建 asar（含 dry-run / `--out` / `--write`） |
| `inject/file-reveal.js` | 文件定位补丁的 renderer 注入源码（`apply-patch.mjs` 读进来内联，不单独部署） |
| `restart.mjs` | 关掉再带 `--remote-debugging-port=<自动挑的端口>` 重开桌面端 |
| `debug-port.mjs` | 挑调试口：读 Windows 的 TCP 保留端口区间 + `netstat` 占用，从 9222 往后找第一个可用的（`--port` / `OC_DEBUG_PORT` 可覆盖） |
| `verify.mjs` | 走 CDP 检查折叠行为（`--delete` 查删除/多选补丁，`--time` 查时间补丁，`--static` 只查 asar 标记），PASS 时退出码 0 |
| `SKILL.md` | 给 opencode agent 当技能用的说明（含补丁细节、坑、锚点定位法） |
| `使用说明.md` | 面向人的使用说明 |

---

## 原理

桌面端界面打包在 `<安装目录>\resources\app.asar`，真正渲染界面的组件在 `/out/renderer/assets/*.js` 里。脚本自动定位两个目标 chunk 并改写：

### 思考折叠（目标 chunk：含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的那个 `route-*.js`）

| 标记 | 改什么 |
|---|---|
| **P1** | `i()`（思考块是否展开）：流式中恒 `true`；否则优先本地 store，其次全局 Map（跨重挂载记忆），都没有时回退到 `!_later$()`（最后一块是工具调用或下一段思考、且本块还没整块滚出视口上方 → 保持展开） |
| **P4** | 摘掉 `get open()` 里 `?? (thinking.details === 'expanded' ? true : void 0)` 的兜底——就是它让每个思考块默认恒展开 |
| **P8** | `onOpenChange` 把用户的开合状态记进全局 Map，并写本地 store 做即时反馈 |
| **P2** | 底部加「收起 ▴」按钮、根节点加双击空白收起；折叠时机用 `_later$()`（扫到最后一个 part：最后是正文块就直接收；最后是工具调用或下一段思考时，还要求本块**整块滚出视口上方**），工具调用行不算「出结果」；触发源两个：`MutationObserver` 盯 `document.body`（200ms 节流，收一次就 disconnect）+ 全局 `scroll` 捕获监听（`capture:true`，120ms 节流）扫描 `globalThis.__ocFoldQ$`；折叠时做滚动锚定（`_anchor$`）：按折叠前后本块在视口里的位移补偿 `scrollTop`，块滚到视口上方时改用底边做锚点，避免翻历史被带偏；补偿在 `queueMicrotask` 里再跑一次（渲染前完成，不会闪一帧） |

关键点：思考结束时组件会**卸载重挂载**，所以「不主动收」是撑不住的——必须让新实例挂载时自己判断「我后面还有没有内容」，没有就保持展开。

### 首页会话删除按钮（目标 chunk：含 `e.onArchiveSession(e.record.session)` 的那个 `main-*.js`）

官方代码里删除按钮其实**已经写好**，只是开关被写死成关闭。脚本做 8 处替换：

| 标记 | 改什么 |
|---|---|
| **D1** | 把开关 `,p8=!1,m8=500;` 改成 `,p8=!0,m8=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）；多选删除 UI 的 IIFE（`D_MULTI_JS`）、时间 IIFE（`T_TIME_JS`）、实时速度 IIFE（`T_SPEED_JS`）、文件定位 IIFE（`T_FILE_JS`）接在声明**结尾 `;` 之后**当独立语句（不能塞进那个逗号列表，见「已知坑」） |
| **D2** | 按钮文案 `common.archive` → `common.delete`（"归档"→"删除"） |
| **D3** | 按钮 `data-action` `home-session-archive` → `home-session-delete` |
| **D4** | 图标 `archive` → 垃圾桶；顺手注册行→会话映射（`__ocRegRow$`）、把官方 `onDeleteSession` 存进 `__ocDeleteApi$` |
| **D5** | `aria-label` `common.archive` → `common.delete` |
| **D6** | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层 try/finally 设 `__ocSkipConfirm = !!t.shiftKey` 再调 `e.onDeleteSession(...)`（Shift 免确认） |
| **D7** | `showDelete` 加旁路 `globalThis.__ocSkipConfirm ? v(e,t) : r.show(确认框)`（`v` 是官方内部删除函数，`onDeleteSession` 就是 `showDelete`） |
| **D8** | 会话右键菜单「删除」项后追加「多选删除」项，`onSelect` 调 `__ocMultiEnter$` 进多选模式 |

### 时间 / 用量 / 速度（不新增锚点，IIFE 跟着 D1 注入）

纯 DOM 注入，不改官方组件逻辑：

| 标记 | 做什么 |
|---|---|
| **T0 消息行用量 + 时间** | 官方 `[data-slot="text-part-meta"]` 的父级就是 dsh 的 `MessageIconActions` 位置（`display:flex`，第一个子是「复制回复」按钮）。往同级末尾追加 `<span data-oc-usage>用量 33.2K tok</span>`（`margin-left:auto` 靠右）和 `<span data-oc-done-time>10月16日 14:34</span>`；消息 id 取最近的 `[data-timeline-part-id="msg_xxx:text:0"]` 前缀，`time.completed` 存在才显示 |
| **T1 用量面板** | 点 `[data-oc-usage]` 弹 `[data-oc-usage-panel]`（fixed、跟随锚点、点外部/滚动关闭）：本轮用量、提供方/模型、缓存命中、未缓存输入、缓存读取、输出、其中推理 |
| **T1b 底部统计条** | `ensureStats()` 在 `form[data-component="composer"]` 的父级、`form.nextSibling` 插 `[data-oc-stats]`（`pointer-events:auto`），三个 pill `[data-oc-stat=rounds|usage|ctx]`：轮数/步数/TPS、累计 token/缓存命中、上下文百分比 |
| **T1c 三个统计面板** | `rounds` → 会话统计（模型用时 `Σ(completed-created)`、工具用时 `span-decMs`、TTFT、TPS）；`usage` → Token 用量（`session.tokens` 累计）；`ctx` → 上下文已用（`lastCtx/limit.context` + 进度条） |
| **T2 实时速度** | 在 `[data-slot="composer-actions"]` 里发送按钮左侧插 `<span data-oc-live-tps>`。`fetch(apiBase()+"/api/event")` 读 SSE 流（`getReader()` + `TextDecoder`，按 `\n\n` 分帧），`session.text.delta` / `session.reasoning.delta` 的 `delta` 是增量文本，把长度记进数组 `D` |
| **T3 速度算法** | `WIN=2500` 滑动窗口，`span=max(1000, min(WIN, now-最老样本))`，`raw=sum(n)/span*1000*k`，400ms 重绘；最后一个 delta 超过 `IDLE=2000` 清空并隐藏（窗口滑出时数字自然衰减，不需要额外平滑） |
| **T4 比例 `k`** | 从 `__ocMsgTime$` 反推：只收 `c>=200` 且 `0.25<n/c<1.2` 的消息（过滤纯工具调用和 reasoning 被摘要的异常样本），取聚合比 `sum(n)/sum(c)`；样本不足 2000 字符时用常量 `0.6` |
| **T5 首页活跃时间** | 扫首页 `[data-session-id]` 行，从 `__ocRowMap$` 取 `session.time.updated`，在 `[data-slot="home-session-labels"]` 末尾追加 `<span data-oc-home-time>`（`flex:0 0 auto`，右对齐） |
| **T6 数据来源** | 后端 API base 从 `performance.getEntriesByType('resource')` 里最近的 `http://127.0.0.1:<port>/api/` 取（端口每次重启都变，不能写死）；会话 id 从 URL 和 `[data-tab-key]` 里收集（2.1.2 的桌面端不再用 HTTP 拉消息，`performance` 里没有 `/api/session/.../message`，`[data-tab-key]` 才是主力），`GET /api/session/<sid>/message` 命中消息 id 后缓存 `{time, tokens, chars}` 进 `__ocMsgTime$` |
| **T7 重绘** | `MutationObserver` 盯 `document.body`（120ms 节流）+ 首页 15s 定时兜底（`time.updated` 变化不必然触发 DOM 变更）；SSE delta 到达时立即重绘 |

两个目标 chunk 必须**串行**重建：每替换一个文件都会平移它之后所有文件的 offset，第二个要在第一个的结果上继续。

### 文件定位（Ctrl+左键点路径 → 资源管理器选中文件）

renderer 没有打开目录的能力（`window.electron` 只有 `windowID / bootstrap / storageSnapshot / extensions / getPathForFile`），所以要三层配合：

| 标记 | 改什么 |
|---|---|
| **F1 preload** | `/out/preload/index.cjs` 的 `exposeInMainWorld('electron', {…})` 里加 `revealPath: t => e.ipcRenderer.invoke("oc:reveal-path", t)`。preload 跑在沙箱里（`sandbox:!0`），拿不到 `shell` |
| **F2 主进程** | `/out/main/index.js` 末尾追加 `import("electron").then(m => m.ipcMain.handle("oc:reveal-path", (e, t) => …))`：`t` 可以是字符串或 `{path, dir}`；文件不存在时用 `fs.globSync("**/"+basename, {cwd: dir || dirname(path)})` 找同名文件，还找不到返回 `false`；找到就 `shell.showItemInFolder(p)`（打开目录 + 选中）。用 `process.getBuiltinModule("node:fs")` 自取内置模块，不引用压缩后的单字母变量，升级不易失效 |
| **F3 renderer** | `inject/file-reveal.js`（`T_FILE_JS`，跟着 D1 注入）。`mousemove`（capture）在 Ctrl 按住且指到路径上时给 `cursor:pointer`；`click`（capture）在 `ctrlKey && button===0` 时按优先级取路径：①`[data-slot="apply-patch-filename"]` ②`caretRangeFromPoint` + 正则取点击位置那个 token ③整块 `<code>` 文本；再 `absPath()`（去行号、认盘符/UNC/Unix、相对路径拼会话目录）后调 `revealPath({path, dir})` |

会话目录来自 `ensureDir()`：先查 `__ocRowMap$`，没有再页面内 `fetch(/api/session/<sid>)` 取 `location.directory`（sid 从 `localStorage` 的 `last-active-url` 抠）。

---

## 已知坑（踩过的）

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → Electron 启动失败，进程直接退出，连日志目录都不建。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 报「加载应用程序时发生错误」。
- 字符串替换**必须自检**：曾因正则分组数对不上，写出 `undefined.open` 让渲染进程崩。
- **往 minified 的 `var`/`let` 声明列表里插东西，只能插 `name=expr`**：D1 那个锚点 `…,f8=B(…),p8=!1,m8=500;` 就是一条 `var` 声明，直接用逗号接 IIFE（`,(function(){…})()`）会 `SyntaxError: Unexpected token '('`——而且压缩后整个 bundle 就几行，`node --check` 只会把错误扣在整行上，行号完全没用。要么给 IIFE 赋值目标，要么放到声明结尾 `;` 之后当独立语句。
- 验证产物时注意：asar 里 `node_modules/@lydell/node-pty-win32-x64/*` 这类文件是 `app.asar.unpacked` 的，它们的 `offset` 指向外部文件，用 asar 内的数据去比对 integrity **必然 mismatch**——原版也一样，别误判成补丁打坏了。
- 启动失败时看 `%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的堆栈 `行:列` 直接指向出错 chunk 的哪一处替换。
- 改 asar **必须完全退出桌面端**，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已变）。
- 官方原版备份命名 `app.asar.bak-<版本号>`；脚本发现已打过补丁又没有备份时会拒绝执行。撤销补丁用 `node apply-patch.mjs --restore`（同样自动关/开桌面端）。
- 测试脚本改动时不要直接 `--write`：`--write` 会 `taskkill` 掉真实桌面端。用假安装目录跑 dry-run / `--out`：
  ```bash
  LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
  # %LOCALAPPDATA%/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
  ```
- **调试口也不能写死 9222**：Windows 上 Hyper-V / WSL / Docker 会占掉一段 TCP 保留端口（本机实测有 `[1114,1613]`、`[9611,9710]`、`[50000,50059]`），9222 落进去时 Electron 绑不上也不报错，verify 只会说「连不上调试口」。现在由 `debug-port.mjs` 挑端口，verify 反向扫 9222–9400。
- **后端 API 端口不固定**（每次重启都变，实测 45278），时间补丁从 `performance` 里取 base；`/json/list` 里也不止一个页面（还有「本地服务管理器」），CDP 要挑 `oc://renderer/index.html`。
- **会话页里查不到 `[data-session-id]`**（那是首页行专用），当前会话 id 只能从 `/api/session/<sid>/message` 的请求记录和 `[data-tab-key]` 反推，不能信「最近一次请求的 sid」。
- 时间 IIFE **不能塞进 `p8=!0,m8=500,` 那条逗号声明**（同 D1 的坑），只能接在 `;` 后面。
- 回复时间的 meta 行**只在消息完成后才渲染**，「流式中不显示」是天然行为；`verify.mjs --time` 因此要等 2.5s 让 `/message` 回来，否则误报。
- **流式中的消息在 DOM 里没有 `data-message-id`**：第一版按 DOM 消息 id 白名单过滤 SSE delta，`hit: 0`——`data-message-id` 只挂在已结束的 `[data-timeline-row="AssistantPart"]` 上。别做白名单，直接统计窗口内全部 delta。
- **`/api/event` 在 Node 里直连是 401**（`{"_tag":"UnauthorizedError"}`），只有页面内 `fetch` 带得上认证。调试速度只能在页面上下文跑（CDP `Runtime.evaluate`）。
- **token/字符 比要「先过滤再聚合」**：中位数会被纯工具调用消息带偏（比值到 5.96，中位数 0.794）；纯聚合比也会被少数异常拉高（0.732 vs 真实 0.62）。正确做法是 `c>=200` 且 `0.25<n/c<1.2` 过滤后取 `sum(n)/sum(c)`。
- **速度窗口下限别给 500ms**：刚开口第一秒窗口没填满，500ms 当分母等于乘二（实测 296 tok/s），下限至少 1000ms。
- **SSE 断了不会自动重连**：`connect()` 的 `catch` 只吞错误；用久了速度不显示就是这个原因，要修就加重连退避。
- **preload 是 `/out/preload/index.cjs` 不是 `.js`**：只扫 `/out/renderer/assets` 查不到文件定位的标记，`--static` 要单独读 preload 和 `/out/main/index.js`。
- **`window.electron` 是 contextBridge 的 frozen 对象**，没法 monkey-patch `revealPath` 记录调用。验证「真弹资源管理器」要读窗口选中项：`(New-Object -ComObject Shell.Application).Windows() | % { $_.Document.SelectedItems() }`；`showItemInFolder` 对已打开的窗口是复用+改选中，**不新增窗口**，别拿窗口数量判断。
- **主进程补丁只能追加到 `/out/main/index.js` 末尾当独立语句**（ESM，变量名全是压缩后的单字母），用 `import("electron")` + `process.getBuiltinModule(...)` 自取，别引用现有标识符。
- **`fs.globSync` 要 Node 22+**；「只给文件名」的兜底必须用**会话工作目录**当 `cwd`，所以 renderer 传的是 `{path, dir}` 而不是单个字符串。
- **别用 `^https?://` 判断网页链接**：正则从 `http://x` 里抠出来的 token 是 `p://x`，前缀判断会漏，要用 `indexOf("://") >= 0`。

## 升级后锚点找不到

opencode 升级后 minified 代码会变，脚本会报「锚点没找到」。此时：

1. 从 asar 抽出所有 `/out/renderer/assets/*.js`，搜 `defaultOpen`、`data-timeline-part-id`、`ui.message.thought` 定位思考组件所在 chunk；搜 `onArchiveSession`、`home-session-archive` 定位首页会话行组件所在 chunk。
2. 看新版 `i=()=>...`、`get open(){...}`、`onOpenChange:t=>{...}` 以及 8 处删除按钮锚点的实际写法，更新 `apply-patch.mjs` 里的 `P1_FIND / P4_FIND / P8_FIND / P2_FIND` 和 `D_RULES`。
3. 重跑 dry-run，确认全部 OK 再 `--write`。

## 历史版本对照

| opencode | 思考折叠 chunk | 删除按钮 chunk | asar 大小 |
|---|---|---|---|
| 2.0.29 | `/out/renderer/assets/route-4O9GzN5h.js`（350831 B） | 无此代码 | 176333529 → ~176334560 |
| 2.0.30 | `/out/renderer/assets/route-CPNDqx0F.js`（355075 → 356889 B） | `/out/renderer/assets/main-CfL8Gr4d.js`（1321365 → 1321786 B） | 176341661 → 176343896 |
| 2.0.32 | `/out/renderer/assets/route-BYzALZ62.js`（357215 → 360467 B） | `/out/renderer/assets/main-CZyBNj5O.js`（官方 1321667 → 1330501 B，含多选删除 + 时间） | 176346919 → 176359005 |
| 2.1.1 | `/out/renderer/assets/route-B8ouoQvI.js`（357032 → 360284 B） | `/out/renderer/assets/main-ptWBkiKT.js`（官方 1311929 → 1320763 B） | 176355995 → 176368081 |
| 2.1.2 | `/out/renderer/assets/route-BKcp3psp.js`（359447 → 362699 B） | `/out/renderer/assets/main-CRF7GP33.js`（官方 1312199 → 1329556 B，含时间 + 实时速度 + 文件定位）；preload 838 → 893 B；main 819112 → 819775 B | 176359724 → 176381051 |
| 2.1.3 | `/out/renderer/assets/route-D__rI7PP.js`（369421 → 372673 B） | `/out/renderer/assets/main-DomFRUsy.js`（官方 1312668 → 1351743 B，含时间 + 实时速度 + 文件定位）；preload 838 → 893 B；main 819130 → 819793 B | 178044242 → 178087287 |
| 2.1.4 | `/out/renderer/assets/route-BCLDih8W.js`（380688 → 383940 B） | `/out/renderer/assets/main-BCYk92jp.js`（官方 1314097 → 1356046 B，含时间 + 实时速度 + 文件定位）；preload 838 → 893 B；main 819139 → 819802 B | 178068364 → 178114283 |

---

## 免责声明

非官方补丁，直接改的是 opencode 桌面端的打包文件（`app.asar`）。**每次 opencode 升级都会覆盖掉，需要重新打一次**。脚本会先把官方原版备份成 `app.asar.bak-<版本号>`，出问题可以用它还原。
