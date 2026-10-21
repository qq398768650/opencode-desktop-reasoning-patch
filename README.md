# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮 + 时间/速度显示）

给 [opencode](https://opencode.ai) 桌面端（Electron）加三组官方没有的交互，脚本一次全部打上。

## 一、思考折叠

**边想边展开 → 想完先摊着 → 整轮结束（最后是正文）才直接折，还在调工具就等滚出屏幕（下方内容不动）→ 点开还能看**

## 二、首页会话删除按钮

**首页每个会话行悬停时显示垃圾桶按钮 → 点击弹官方删除确认框 → 确认后删掉该会话**

**一次删很多**：按住 **Shift** 点垃圾桶 = 跳过确认框直接删；或进**多选删除**模式（右下角悬浮条点「多选删除」，或会话右键菜单选「多选删除」），点行勾选（可「全选」），按「删除 N」→「确认删除 N」一次删完。

## 三、时间与速度显示

**每条助手回复末尾补上完成时间（`· 14:32`）→ 首页每个会话行右侧显示最后活跃时间（今天 `14:32`，跨天 `10/16`）→ 输入框发送按钮左侧实时显示当前输出速度（`142 tok/s`，流式时出现，结束后约 2 秒淡出）**

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

### 时间与速度显示

| # | 行为 |
|---|---|
| 1 | 每条助手回复末尾（官方「Build · 模型 · 耗时」那行）追加 **`· 14:32`** 完成时间 |
| 2 | 消息还在流式输出时**不显示**，回复完成才出现 |
| 3 | 输入框**发送按钮左侧实时显示输出速度** `142 tok/s`：订阅页面内 SSE 的 `session.text.delta` / `session.reasoning.delta`，按 2.5 秒滑动窗口统计字符增量，再乘 token/字符 比换算成 tok/s；数字带指数平滑，不会乱跳 |
| 4 | 流式时出现，最后一个 delta 后约 **2 秒**淡出；空闲时不占位 |
| 5 | 首页每个会话行右侧显示**最后活跃时间**：今天 `HH:MM`、跨天 `MM/DD`、跨年 `YYYY/MM/DD`；悬停时排在项目名和垃圾桶之间，不重叠 |
| 6 | 时间数据从后端 `/api/session/<sid>/message` 的 `time.completed` 和 `session.time.updated` 取；速度走页面内 SSE，不轮询接口、不改数据结构、不额外存盘 |

官方 2.0.x 只有「默认展开」和「默认折叠」两种静态行为，没有上面第一套；首页也只有一个「归档」入口，没有删除按钮；消息末尾只有「模型 · 耗时」，没有绝对时间；输入框也没有任何速度显示。

---

## 环境要求

- Windows
- Node.js 18+
- opencode 桌面端（Electron 版，安装目录下有 `resources\app.asar`）

支持版本：**2.1.2**（2.1.1 / 2.0.32 / 2.0.29 的锚点写法不同，见文末版本对照表）。opencode 升级后 minified 代码会变，锚点失效时脚本会明确报错，需要按下面「升级后锚点找不到」更新。

三组补丁是**同一次运行里全部打上**的：任一目标的锚点对不上，脚本会报错并**不写文件**（不会出现只打一半的情况）。

### 可选：装成斜杠命令

仓库里的 `commands/reasoning-patch.md` 是一条 OpenCode 斜杠命令，装上以后在输入框敲 `/reasoning-patch` 就能让 agent 按流程重打补丁（拉最新 → dry-run → `--write` → 验证）。

**它和补丁是两回事**：补丁改的是桌面端 `app.asar`，斜杠命令只是 OpenCode 读的 markdown 文件，跑 `apply-patch.mjs` 不会自动装它。想用就手动复制一份：

```bash
mkdir -p ~/.config/opencode/commands
cp commands/reasoning-patch.md ~/.config/opencode/commands/
```

命令文件是热加载的，不用重启，复制完直接敲 `/reasoning-patch`。

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

# 3b. 不想开调试口时，可以先做静态校验（直接查 asar 里三组补丁的 14 个标记）
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
| `apply-patch.mjs` | 主脚本：找安装目录 → 定位两个 renderer chunk → 打三组补丁 → 重建 asar（含 dry-run / `--out` / `--write`） |
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
| **D1** | 把开关 `,p8=!1,m8=500;` 改成 `,p8=!0,m8=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）；多选删除 UI 的 IIFE（`D_MULTI_JS`）、时间 IIFE（`T_TIME_JS`）、实时速度 IIFE（`T_SPEED_JS`）接在声明**结尾 `;` 之后**当独立语句（不能塞进那个逗号列表，见「已知坑」） |
| **D2** | 按钮文案 `common.archive` → `common.delete`（"归档"→"删除"） |
| **D3** | 按钮 `data-action` `home-session-archive` → `home-session-delete` |
| **D4** | 图标 `archive` → 垃圾桶；顺手注册行→会话映射（`__ocRegRow$`）、把官方 `onDeleteSession` 存进 `__ocDeleteApi$` |
| **D5** | `aria-label` `common.archive` → `common.delete` |
| **D6** | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层 try/finally 设 `__ocSkipConfirm = !!t.shiftKey` 再调 `e.onDeleteSession(...)`（Shift 免确认） |
| **D7** | `showDelete` 加旁路 `globalThis.__ocSkipConfirm ? v(e,t) : r.show(确认框)`（`v` 是官方内部删除函数，`onDeleteSession` 就是 `showDelete`） |
| **D8** | 会话右键菜单「删除」项后追加「多选删除」项，`onSelect` 调 `__ocMultiEnter$` 进多选模式 |

### 时间与速度显示（不新增锚点，IIFE 跟着 D1 注入）

纯 DOM 注入，不改官方组件逻辑：

| 标记 | 做什么 |
|---|---|
| **T1 回复完成时间** | 扫 `[data-slot="text-part-meta"]`（官方「Build · 模型 · 耗时」行），从最近的 `[data-timeline-part-id="msg_xxx:text:0"]` 取消息 id，在 `time.completed` 存在时往同级追加 `<span data-oc-done-time>· HH:MM</span>` |
| **T2 实时速度** | 在 `[data-slot="composer-actions"]` 里发送按钮左侧插 `<span data-oc-live-tps>`。`fetch(apiBase()+"/api/event")` 读 SSE 流（`getReader()` + `TextDecoder`，按 `\n\n` 分帧），`session.text.delta` / `session.reasoning.delta` 的 `delta` 是增量文本，把长度记进数组 `D` |
| **T3 速度算法** | `WIN=2500` 滑动窗口，`span=max(1000, min(WIN, now-最老样本))`，`raw=sum(n)/span*1000*k`，`SHOWN=SHOWN*0.65+raw*0.35` 平滑，400ms 重绘；最后一个 delta 超过 `IDLE=2000` 清空并隐藏 |
| **T4 比例 `k`** | 从 `__ocMsgTime$` 反推：只收 `c>=200` 且 `0.25<n/c<1.2` 的消息（过滤纯工具调用和 reasoning 被摘要的异常样本），取聚合比 `sum(n)/sum(c)`；样本不足 2000 字符时用常量 `0.6` |
| **T5 首页活跃时间** | 扫首页 `[data-session-id]` 行，从 `__ocRowMap$` 取 `session.time.updated`，在 `[data-slot="home-session-labels"]` 末尾追加 `<span data-oc-home-time>`（`flex:0 0 auto`，右对齐） |
| **T6 数据来源** | 后端 API base 从 `performance.getEntriesByType('resource')` 里最近的 `http://127.0.0.1:<port>/api/` 取（端口每次重启都变，不能写死）；会话 id 从 URL 和 `[data-tab-key]` 里收集（2.1.2 的桌面端不再用 HTTP 拉消息，`performance` 里没有 `/api/session/.../message`，`[data-tab-key]` 才是主力），`GET /api/session/<sid>/message` 命中消息 id 后缓存 `{time, tokens, chars}` 进 `__ocMsgTime$` |
| **T7 重绘** | `MutationObserver` 盯 `document.body`（120ms 节流）+ 首页 15s 定时兜底（`time.updated` 变化不必然触发 DOM 变更）；SSE delta 到达时立即重绘 |

两个目标 chunk 必须**串行**重建：每替换一个文件都会平移它之后所有文件的 offset，第二个要在第一个的结果上继续。

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
| 2.1.2 | `/out/renderer/assets/route-BKcp3psp.js`（359447 → 362699 B） | `/out/renderer/assets/main-CRF7GP33.js`（官方 1312199 → 1324054 B，含时间 + 实时速度） | 176359724 → 176374831 |

---

## 免责声明

非官方补丁，直接改的是 opencode 桌面端的打包文件（`app.asar`）。**每次 opencode 升级都会覆盖掉，需要重新打一次**。脚本会先把官方原版备份成 `app.asar.bak-<版本号>`，出问题可以用它还原。
