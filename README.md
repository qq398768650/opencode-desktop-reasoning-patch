# opencode 桌面端「思考折叠」补丁

给 [opencode](https://opencode.ai) 桌面端（Electron）的聊天「思考」块加一套官方没有的交互：

**边想边展开 → 想完先摊着 → 下一段思考开始（或正文结果出来）时自动折成一行 → 点开还能看**

---

## 效果

| # | 行为 |
|---|---|
| 1 | 思考**流式输出时展开**，正文实时可见 |
| 2 | 思考结束后**不立刻折叠**：一直摊着，直到「后面出现下一段思考」或「正文结果出来了」才收 |
| 3 | 折起后点**标题**可重新展开 |
| 4 | 展开状态下，点底部 **「收起 ▴」**、**双击空白处**、或再点标题，都能收起 |
| 5 | 手动开合过的块**不会被自动折叠**，状态在滚动/重渲染后也不丢 |

官方 2.0.x 只有「默认展开」和「默认折叠」两种静态行为，没有上面这套。

---

## 环境要求

- Windows
- Node.js 18+
- opencode 桌面端（Electron 版，安装目录下有 `resources\app.asar`）

支持版本：**2.0.30**（2.0.29 也能用，锚点相同）。opencode 升级后 minified 代码会变，锚点失效时脚本会明确报错，需要按下面「升级后锚点找不到」更新。

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
```

`--write` 会自动完成关/开桌面端，**不会断会话**——agent 跑在后端进程 `opencode-cli.exe serve --service` 里，和桌面窗口是两个进程。

只想单独重启桌面端：`node restart.mjs`。

---

## 文件

| 文件 | 作用 |
|---|---|
| `apply-patch.mjs` | 主脚本：找安装目录 → 定位 renderer chunk → 打 5 处补丁 → 重建 asar（含 dry-run / `--write`） |
| `restart.mjs` | 关掉再带 `--remote-debugging-port=9222` 重开桌面端 |
| `verify.mjs` | 走 CDP 检查折叠行为，PASS 时退出码 0 |
| `SKILL.md` | 给 opencode agent 当技能用的说明（含补丁细节、坑、锚点定位法） |
| `使用说明.md` | 面向人的使用说明 |

---

## 原理

桌面端界面打包在 `<安装目录>\resources\app.asar`，真正渲染思考块的组件在某个 `/out/renderer/assets/*.js` chunk 里。脚本自动找含 `i=()=>e.open??n.open??e.defaultOpen??!1` 的那个 chunk，做 5 处替换：

| 标记 | 改什么 |
|---|---|
| **P1** | `i()`（思考块是否展开）：流式中恒 `true`；否则优先本地 store，其次全局 Map（跨重挂载记忆），都没有时回退到 `!_later$()`（后面还没下一段思考/正文 → 保持展开） |
| **P4** | 摘掉 `get open()` 里 `?? (thinking.details === 'expanded' ? true : void 0)` 的兜底——就是它让每个思考块默认恒展开 |
| **P8** | `onOpenChange` 把用户的开合状态记进全局 Map，并写本地 store 做即时反馈 |
| **P2+P3** | 底部加「收起 ▴」按钮、根节点加双击空白收起；折叠时机用 `_later$()`（后面出现下一段思考或正文块时收一次），工具调用行不算「出结果」；用 `MutationObserver` 盯 `document.body`（200ms 节流，收一次就 disconnect） |

关键点：思考结束时组件会**卸载重挂载**，所以「不主动收」是撑不住的——必须让新实例挂载时自己判断「我后面还有没有内容」，没有就保持展开。

---

## 已知坑（踩过的）

- **asar header 的 JSON 长度必须和原版一模一样**（不足用空格补齐）。改短会让 `dataStart` 前移 → Electron 启动失败，进程直接退出，连日志目录都不建。
- **`dataStart` 也必须和原版完全一致**，别按对齐公式重算。2.0.30 原版是 4 字节对齐（`jsonLen` 2172835 → `dataStart` 2172852，尾部 1 个 NUL）；按 8 字节对齐重算会得到 2172856（+4），Electron 报「加载应用程序时发生错误」。
- 字符串替换**必须自检**：曾因正则分组数对不上，写出 `undefined.open` 让渲染进程崩。
- 启动失败时看 `%APPDATA%\ai.opencode.desktop\logs\<最新时间戳>\renderer.log`，里面 `fatal renderer error` 的堆栈 `行:列` 直接指向出错 chunk 的哪一处替换。
- 改 asar **必须完全退出桌面端**，热重载（Ctrl+R）会白屏（主进程缓存了旧 asar 头，偏移已变）。
- 官方原版备份命名 `app.asar.bak-<版本号>`；脚本发现已打过补丁又没有备份时会拒绝执行。

## 升级后锚点找不到

opencode 升级后 minified 代码会变，脚本会报「锚点没找到」。此时：

1. 从 asar 抽出所有 `/out/renderer/assets/*.js`，搜 `defaultOpen`、`data-timeline-part-id`、`ui.message.thought` 定位思考组件所在 chunk。
2. 看新版 `i=()=>...`、`get open(){...}`、`onOpenChange:t=>{...}` 三处的实际写法，更新 `apply-patch.mjs` 里的 `P1_FIND / P4_FIND / P8_FIND / P2_FIND`。
3. 重跑 dry-run，确认 5 处都 OK 再 `--write`。

## 历史版本对照

| opencode | 目标 chunk | asar 大小 |
|---|---|---|
| 2.0.29 | `/out/renderer/assets/route-4O9GzN5h.js`（350831 B） | 176333529 → ~176334560 |
| 2.0.30 | `/out/renderer/assets/route-CPNDqx0F.js`（355075 → 356889 B） | 176341661 → 176343475 |

---

## 免责声明

非官方补丁，直接改的是 opencode 桌面端的打包文件（`app.asar`）。**每次 opencode 升级都会覆盖掉，需要重新打一次**。脚本会先把官方原版备份成 `app.asar.bak-<版本号>`，出问题可以用它还原。
