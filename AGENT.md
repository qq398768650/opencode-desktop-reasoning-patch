# AGENT.md

给**要改这个仓库的人/agent**看的操作约定。想知道补丁做了什么、踩过哪些坑，看 `SKILL.md`；想给普通用户看，看 `使用说明.md`。

## 这是什么

一个零依赖的 Node 脚本集合：直接改写 opencode 桌面端（Electron）的 `resources/app.asar`，给界面加两组官方没有的交互。

- 思考折叠：流式展开 → 思考结束先摊着 → 下一段思考开始或正文出结果时才折成一行
- 首页会话删除：会话行悬停出垃圾桶，点击走官方确认框；Shift 点击免确认；另有「多选删除」模式批量删

**目标文件是打包产物，不是源码。** 所有改动都是对 minified chunk 做字符串替换，opencode 一升级锚点就会失效。

## 文件分工

| 文件 | 职责 |
|---|---|
| `apply-patch.mjs` | 唯一的主脚本：找安装目录 → 定位两个 renderer chunk → 打补丁 → 串行重建 asar。支持 dry-run / `--out` / `--write` / `--restore` |
| `verify.mjs` | 校验。无参数 = CDP 行为验证（思考折叠）；`--delete` = CDP 查删除/多选补丁注入；`--static` = 只查 asar 内标记 |
| `restart.mjs` | 单独重启桌面端并开 `--remote-debugging-port=9222` |
| `SKILL.md` | 补丁细节、P1–P2/D1–D8 每处改什么、坑、升级后怎么重新定位锚点 |
| `README.md` / `使用说明.md` | 面向人的说明 |

## 铁律

1. **改脚本先用 dry-run 或 `--out`，别直接 `--write`。** `--write` 会 `taskkill` 真实桌面端、覆盖安装目录。离线验证用假安装目录：
   ```bash
   LOCALAPPDATA=/tmp/fakelocal node apply-patch.mjs --out /tmp/patched.asar
   ```
2. **产物必须过语法检查**：从 asar 里抽出目标 chunk，`node --check` 一遍。压缩后整个 bundle 只有几行，报错行号毫无意义——看到 `Unexpected token` 先怀疑替换点的**上下文结构**（尤其是不是插进了 `var`/`let` 的逗号声明列表，那里只接受 `name=expr`）。
3. **每个锚点必须唯一。** `replaceOnce()` 会校验命中次数；新增规则时保持这个约束，别退化成「找到第一个就换」。
4. **不改 `jsonLen` / `dataStart`。** header 长度不足用空格补齐，`dataStart` 沿用原版（2.0.30 起是 `jsonLen` 2172835 → `dataStart` 2172852，4 字节对齐 + 尾部 1 个 NUL）。改短或按 8 字节重算都会让 Electron 直接启动失败。
5. **两个目标 chunk 串行重建**：每替换一个文件都会平移其后所有 offset，第二个必须基于第一个的结果继续（`for (const j of jobs) out = rebuildAsar(parseAsar(out), …)`）。
6. **自检不能省。** 每次替换后要断言「新标记存在 + 旧标记消失」，产物里出现 `undefined.<prop>` 直接抛错。
7. **不做超出补丁范围的重构。** 这个仓库的价值是可重放、可回滚、每条改动都能对着官方 bundle 说清出处。

## 验证顺序

```bash
node apply-patch.mjs            # dry-run：全部锚点 OK 才继续
node apply-patch.mjs --write    # 装（自动关→备份 app.asar.bak-<版本号>→写→开回来）
node verify.mjs --static        # 9 个标记全绿
node verify.mjs --delete        # 先切到首页；只查注入，不真删
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
