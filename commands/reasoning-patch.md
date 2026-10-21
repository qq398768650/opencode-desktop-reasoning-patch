---
description: 重打桌面端补丁（思考折叠 + 首页删除按钮 + 时间/速度，升级 opencode 后执行）
---

给 opencode 桌面端重打三组补丁：

1. 聊天「思考」块：流式中展开、思考结束不立刻折叠（后面是正文才直接折，还在调工具就等滚出视口）、点标题/底部「收起 ▴」/双击空白都能收起、手动开合跨重挂载保留
2. 首页会话行垃圾桶删除按钮：普通点击走官方确认框，**Shift 点击直接删**，另有「多选删除」模式
3. 时间与速度：每条回复末尾完成时间、首页行最后活跃时间、发送按钮旁实时 tok/s

先加载 `desktop-reasoning-patch` 技能，然后严格按它的流程走：

1. 第 0 步先拉最新：`cd ~/.config/opencode/skills/desktop-reasoning-patch && git pull --ff-only`（直连 GitHub 超时就加 `-c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897`）
2. `node apply-patch.mjs`（dry-run，确认锚点全 OK、不动文件不动进程）
3. `node apply-patch.mjs --write`（会自动：关掉桌面端 → 备份官方版为 `app.asar.bak-<版本号>` → 写补丁 → 带调试口开回来；会话不会断）
4. 等约 20 秒后 `node verify.mjs --static`（期望 14 项全绿）和 `node verify.mjs`（思考折叠行为；需要先点开一个有已完成思考的会话）
5. 锚点找不到或验证失败时，按技能里「升级后锚点找不到怎么办」和「坑」两节排查；改好锚点后把结论写回 `apply-patch.mjs` 与 `SKILL.md`

最后用中文简短汇报：目标 chunk 与字节数变化、asar 大小变化、verify 结果。$ARGUMENTS
