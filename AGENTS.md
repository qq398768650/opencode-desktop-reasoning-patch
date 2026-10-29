# AGENTS.md

给**要改这个仓库的人/agent**看的操作约定。想知道补丁做了什么、踩过哪些坑，看 `SKILL.md`；想给普通用户看，看 `使用说明.md`。

## 这是什么

一个零依赖的 Node 脚本集合：直接改写 opencode 桌面端（Electron）的 `resources/app.asar`，给界面加四组官方没有的交互。

- 思考折叠：流式展开 → 思考结束先摊着 → 整轮结束（最后一块是正文）才直接折，还在调工具/还有下一段思考就等整块滚出视口上方（折叠时补偿滚动，下方内容不动）
- 首页会话删除：会话行悬停出垃圾桶，点击走官方确认框；Shift 点击免确认；另有「多选删除」模式批量删
- 时间 / 用量 / 速度（参照 dsh）：助手回复的操作按钮行右侧显示 `用量 33.2K tok` + 完成时间（今天 `14:32`、同年 `10月16日 14:34`、跨年带年份），点用量弹本轮明细；输入框下方一行三块统计 `⟳ 2 轮 37 步 · 97 tok/s` / `▤ 1.6M tok · 缓存命中 95%` / `◑ 1%`，三块都能点开面板；发送按钮左侧实时显示输出速度（`142 tok/s`，流式时出现，结束后约 2 秒淡出）；首页会话行右侧显示最后活跃时间
- 文件定位：会话里 Ctrl+左键点文件路径（正文路径、编辑/写入文件卡片上的文件名都行）→ 资源管理器打开所在目录并选中该文件
- 工作中展开/收起：底部「工作中」这行正中放一个胶囊按钮，一键展开/收起本轮全部思考与工具组（`inject/work-fold.js`）

**目标文件是打包产物，不是源码。** 所有改动都是对 minified chunk 做字符串替换，opencode 一升级锚点就会失效。

## 文件分工

| 文件 | 职责 |
|---|---|
| `apply-patch.mjs` | 唯一的主脚本：找安装目录 → 定位两个 renderer chunk（+ preload、主进程）→ 打四组补丁 → 串行重建 asar。支持 dry-run / `--out` / `--write` / `--restore` |
| `inject/file-reveal.js` | 文件定位补丁的 renderer 注入源码，`apply-patch.mjs` 读进来内联进 chunk（不单独部署） |
| `commands/reasoning-patch.md` | `/reasoning-patch` 斜杠命令源文件；`--write` 会自动装到 `~/.config/opencode/commands/` |
| `verify.mjs` | 校验。无参数 = CDP 行为验证（思考折叠）；`--delete` = CDP 查删除/多选补丁注入；`--time` = CDP 查时间/速度；`--static` = 只查 asar 内 20 个标记（renderer 17 + preload 1 + 主进程 2）|
| `restart.mjs` | 单独重启桌面端并开 `--remote-debugging-port=<自动挑的端口>` |
| `debug-port.mjs` | 挑调试口：避开 Windows TCP 保留区间（Hyper-V/WSL/Docker）与已占用端口 |
| `SKILL.md` | 补丁细节、P1/P2/P4/P8 与 D1–D8 每处改什么、坑、升级后怎么重新定位锚点 |
| `README.md` / `使用说明.md` | 面向人的说明 |

## 铁律

0. **动手前先同步远端。** 本目录就是仓库 clone，执行任何补丁命令前先 `git pull --ff-only`（`Already up to date.` 就继续）。拉失败说明有本地未提交改动：先 `git stash -u` 备份再拉，别强拉、别 `reset --hard` 掉老板的东西。
1. **改脚本先用 dry-run 或 `--out`，别直接 `--write`。** `--write` 会 `taskkill` 真实桌面端、覆盖安装目录。离线验证用假安装目录：
   ```bash
   LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
   ```
2. **产物必须过语法检查**：从 asar 里抽出目标 chunk，`node --check` 一遍。压缩后整个 bundle 只有几行，报错行号毫无意义——看到 `Unexpected token` 先怀疑替换点的**上下文结构**（尤其是不是插进了 `var`/`let` 的逗号声明列表，那里只接受 `name=expr`）。
3. **每个锚点必须唯一。** `replaceOnce()` 会校验命中次数；新增规则时保持这个约束，别退化成「找到第一个就换」。
4. **不改 `jsonLen` / `dataStart`。** header 长度不足用空格补齐，`dataStart` 沿用原版（2.0.30 起是 `jsonLen` 2172835 → `dataStart` 2172852，4 字节对齐 + 尾部 1 个 NUL）。改短或按 8 字节重算都会让 Electron 直接启动失败。
5. **所有目标文件串行重建**：每替换一个文件都会平移其后所有 offset，下一个必须基于上一个的结果继续（`for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。现在是 4 个：route chunk、main chunk、`/out/preload/index.cjs`、`/out/main/index.js`。
6. **自检不能省。** 每次替换后要断言「新标记存在 + 旧标记消失」，产物里出现 `undefined.<prop>` 直接抛错。
7. **不做超出补丁范围的重构。** 这个仓库的价值是可重放、可回滚、每条改动都能对着官方 bundle 说清出处。
8. **preload / 主进程补丁也要一起打。** 文件定位功能横跨 renderer、preload、主进程三处，只打 renderer 会「有启动标记但点了没反应」。preload 文件是 `/out/preload/index.cjs`（`.cjs` 不是 `.js`）；主进程代码只能追加到 `/out/main/index.js` 末尾当独立语句，用 `import("electron")` + `process.getBuiltinModule(...)` 自取模块，别引用压缩后的单字母变量。
9. **调试口不写死。** 一律走 `debug-port.mjs` 的 `pickPort()`；`verify.mjs` 保持「不传 `--port` 就扫 9222–9400」的能力。9222 可能被 Windows 保留端口区间占掉，Electron 绑不上不报错，只会让 verify 假失败。

## 验证顺序

```bash
node apply-patch.mjs            # dry-run：全部锚点 OK 才继续
node apply-patch.mjs --write    # 装（自动关→备份 app.asar.bak-<版本号>→写→开回来）
node verify.mjs --static        # 20 个标记全绿
node verify.mjs --delete        # 先切到首页；只查注入，不真删
node verify.mjs --time          # 时间/速度补丁：首页行时间 + 会话页完成时间 + 速度启动标记
node sample-speed.mjs           # 趁助手输出时采样实时速度（每 500ms 一次）
node verify.mjs                 # 思考折叠行为（需要会话里有已完成的思考块）
```

`--delete` 在会话视图里会失败（`[data-session-id]` 为 0），这是预期，不是补丁坏了。

## 升级后锚点失效

脚本会明确报「锚点没找到」。按 `SKILL.md` 的「升级后锚点找不到怎么办」重新抽 chunk、看新版写法、更新 `P1_FIND / P4_FIND / P8_FIND / P2_FIND` 和 `D_RULES`，再走一遍验证顺序。

**别拿旧版本备份重放**：曾出现备份是 2.0.29、安装目录已升到 2.0.30，重放把 renderer 降级。判断版本要比对 asar 内 `/package.json` 的 `version`，不是看备份文件名。

## 提交约定

- commit message 用中文，首行说清「改了什么 + 为什么」，需要时在正文列要点
- 一次提交只做一件事；锚点随版本更新时，在 commit 正文写明新版本号和新的 chunk 文件名 / 大小
- 文档和代码同步改：新增规则要同时更新 `SKILL.md` 的 D/P 表、`README.md` 的「原理」、`使用说明.md` 的效果列表

## 发布约定

**tag / GitHub Release 的版本号 = 适配的 opencode 桌面端版本号**，不带自己的语义化补丁号（历史遗留的 `v2.0.30.1` / `v2.0.30.2` 不再沿用）。

```bash
cd ~/.config/opencode/skills/desktop-reasoning-patch
git tag v2.1.3                      # 与 opencode 桌面端 FileVersion 完全一致
git push origin v2.1.3
gh release create v2.1.3 --title "v2.1.3 — 适配 opencode 桌面端 2.1.3" --notes "..."
```

发布前确认三件事：① 本机桌面端版本 = tag 版本；② `node apply-patch.mjs` dry-run 全 OK、`node verify.mjs --static` 20 项全绿；③ README 的「支持版本」与「历史版本对照」表已加该行。补丁自身的修复（不涉及新锚点）直接进 `main`，不另开 tag。
