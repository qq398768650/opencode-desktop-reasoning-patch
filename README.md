# opencode 桌面端补丁（思考折叠 + 首页会话删除按钮）

给 [opencode](https://opencode.ai) 桌面端（Electron）加两组官方没有的交互，脚本一次全部打上。

## 一、思考折叠

**边想边展开 → 想完先摊着 → 下一段思考开始（或正文结果出来）时自动折成一行 → 点开还能看**

## 二、首页会话删除按钮

**首页每个会话行悬停时显示垃圾桶按钮 → 点击弹官方删除确认框 → 确认后删掉该会话**

**一次删很多**：按住 **Shift** 点垃圾桶 = 跳过确认框直接删；或进**多选删除**模式（右下角悬浮条点「多选删除」，或会话右键菜单选「多选删除」），点行勾选（可「全选」），按「删除 N」→「确认删除 N」一次删完。

---

## 效果

### 思考折叠

| # | 行为 |
|---|---|
| 1 | 思考**流式输出时展开**，正文实时可见 |
| 2 | 思考结束后**不立刻折叠**：一直摊着，直到「后面出现下一段思考」或「正文结果出来了」才收 |
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

官方 2.0.x 只有「默认展开」和「默认折叠」两种静态行为，没有上面第一套；首页也只有一个「归档」入口，没有删除按钮。

---

## 环境要求

- Windows
- Node.js 18+
- opencode 桌面端（Electron 版，安装目录下有 `resources\app.asar`）

支持版本：**2.0.32**（2.0.29 的思考折叠锚点相同，但 2.0.29 里没有首页删除按钮的那段代码，会报找不到目标）。opencode 升级后 minified 代码会变，锚点失效时脚本会明确报错，需要按下面「升级后锚点找不到」更新。

两组补丁是**同一次运行里全部打上**的：任一目标的锚点对不上，脚本会报错并**不写文件**（不会出现只打一半的情况）。

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

# 3b. 不想开调试口时，可以先做静态校验（直接查 asar 里两组补丁的标记）
node verify.mjs --static

# 3c. 只查删除/多选补丁有没有注入（要先切到首页；只查存在性，不会真删）
node verify.mjs --delete

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
| `apply-patch.mjs` | 主脚本：找安装目录 → 定位两个 renderer chunk → 打两组补丁 → 重建 asar（含 dry-run / `--out` / `--write`） |
| `restart.mjs` | 关掉再带 `--remote-debugging-port=9222` 重开桌面端 |
| `verify.mjs` | 走 CDP 检查折叠行为（`--delete` 查删除/多选补丁，`--static` 只查 asar 标记），PASS 时退出码 0 |
| `SKILL.md` | 给 opencode agent 当技能用的说明（含补丁细节、坑、锚点定位法） |
| `使用说明.md` | 面向人的使用说明 |

---

## 原理

桌面端界面打包在 `<安装目录>\resources\app.asar`，真正渲染界面的组件在 `/out/renderer/assets/*.js` 里。脚本自动定位两个目标 chunk 并改写：

### 思考折叠（目标 chunk：含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的那个 `route-*.js`）

| 标记 | 改什么 |
|---|---|
| **P1** | `i()`（思考块是否展开）：流式中恒 `true`；否则优先本地 store，其次全局 Map（跨重挂载记忆），都没有时回退到 `!_later$()`（后面还没下一段思考/正文 → 保持展开） |
| **P4** | 摘掉 `get open()` 里 `?? (thinking.details === 'expanded' ? true : void 0)` 的兜底——就是它让每个思考块默认恒展开 |
| **P8** | `onOpenChange` 把用户的开合状态记进全局 Map，并写本地 store 做即时反馈 |
| **P2** | 底部加「收起 ▴」按钮、根节点加双击空白收起；折叠时机用 `_later$()`（后面出现下一段思考或正文块时收一次），工具调用行不算「出结果」；用 `MutationObserver` 盯 `document.body`（200ms 节流，收一次就 disconnect）；折叠时做滚动锚定（`_anchor$`）：按折叠前后本块在视口里的位移补偿 `scrollTop`，块滚到视口上方时改用底边做锚点，避免翻历史被带偏；补偿在 `queueMicrotask` 里再跑一次（渲染前完成，不会闪一帧） |

关键点：思考结束时组件会**卸载重挂载**，所以「不主动收」是撑不住的——必须让新实例挂载时自己判断「我后面还有没有内容」，没有就保持展开。

### 首页会话删除按钮（目标 chunk：含 `e.onArchiveSession(e.record.session)` 的那个 `main-*.js`）

官方代码里删除按钮其实**已经写好**，只是开关被写死成关闭。脚本做 8 处替换：

| 标记 | 改什么 |
|---|---|
| **D1** | 把开关 `,bie=!1,xie=500;` 改成 `,bie=!0,xie=500,` + 内联 16×16 垃圾桶图标组件（`ZZ_TRASH_ICON`）；多选删除 UI 的 IIFE（`D_MULTI_JS`）接在声明**结尾 `;` 之后**当独立语句（不能塞进那个逗号列表，见「已知坑」） |
| **D2** | 按钮文案 `common.archive` → `common.delete`（"归档"→"删除"） |
| **D3** | 按钮 `data-action` `home-session-archive` → `home-session-delete` |
| **D4** | 图标 `archive` → 垃圾桶；顺手注册行→会话映射（`__ocRegRow$`）、把官方 `onDeleteSession` 存进 `__ocDeleteApi$` |
| **D5** | `aria-label` `common.archive` → `common.delete` |
| **D6** | 点击动作 `e.onArchiveSession(e.record.session)` → 包一层 try/finally 设 `__ocSkipConfirm = !!t.shiftKey` 再调 `e.onDeleteSession(...)`（Shift 免确认） |
| **D7** | `showDelete` 加旁路 `globalThis.__ocSkipConfirm ? v(e,t) : r.show(确认框)`（`v` 是官方内部删除函数，`onDeleteSession` 就是 `showDelete`） |
| **D8** | 会话右键菜单「删除」项后追加「多选删除」项，`onSelect` 调 `__ocMultiEnter$` 进多选模式 |

两个目标 chunk 必须**串行**重建：每替换一个文件都会平移它之后所有文件的 offset，第二个要在第一个的结果上继续。

---

## 已知坑（踩过的）

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → Electron 启动失败，进程直接退出，连日志目录都不建。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 报「加载应用程序时发生错误」。
- 字符串替换**必须自检**：曾因正则分组数对不上，写出 `undefined.open` 让渲染进程崩。
- **往 minified 的 `var`/`let` 声明列表里插东西，只能插 `name=expr`**：D1 那个锚点 `…,yie=B(…),bie=!1,xie=500;` 就是一条 `var` 声明，直接用逗号接 IIFE（`,(function(){…})()`）会 `SyntaxError: Unexpected token '('`——而且压缩后整个 bundle 就几行，`node --check` 只会把错误扣在整行上，行号完全没用。要么给 IIFE 赋值目标，要么放到声明结尾 `;` 之后当独立语句。
- 验证产物时注意：asar 里 `node_modules/@lydell/node-pty-win32-x64/*` 这类文件是 `app.asar.unpacked` 的，它们的 `offset` 指向外部文件，用 asar 内的数据去比对 integrity **必然 mismatch**——原版也一样，别误判成补丁打坏了。
- 启动失败时看 `%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的堆栈 `行:列` 直接指向出错 chunk 的哪一处替换。
- 改 asar **必须完全退出桌面端**，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已变）。
- 官方原版备份命名 `app.asar.bak-<版本号>`；脚本发现已打过补丁又没有备份时会拒绝执行。撤销补丁用 `node apply-patch.mjs --restore`（同样自动关/开桌面端）。
- 测试脚本改动时不要直接 `--write`：`--write` 会 `taskkill` 掉真实桌面端。用假安装目录跑 dry-run / `--out`：
  ```bash
  LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
  # %LOCALAPPDATA%/Programs/@opencode-aidesktop/{OpenCode.exe, resources/app.asar}
  ```

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
| 2.0.32 | `/out/renderer/assets/route-BYzALZ62.js`（357215 → 359029 B） | `/out/renderer/assets/main-CZyBNj5O.js`（官方 1321183 → 1326572 B） | 176346919 → 176353638 |

---

## 免责声明

非官方补丁，直接改的是 opencode 桌面端的打包文件（`app.asar`）。**每次 opencode 升级都会覆盖掉，需要重新打一次**。脚本会先把官方原版备份成 `app.asar.bak-<版本号>`，出问题可以用它还原。
