// verify.mjs — 通过 CDP 检查思考块补丁是否生效
//   前提：桌面端已用 restart.mjs 启动（带 --remote-debugging-port）
// 用法: node verify.mjs [--port 9333]           # CDP 行为验证（不传就自动扫 9222-9400）
//       node verify.mjs --static [--asar <p>]   # 只做静态检查：不连桌面端，直接查 asar 里三组补丁的标记
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 不传 --port 时自动扫：9222 常落在 Windows 的 TCP 保留端口区间里（Hyper-V/WSL/Docker），
// Electron 绑不上会静默失败，写死 9222 就只会报「连不上调试口」。
const ASKED = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page() {
  const ports = ASKED ? [ASKED] : Array.from({ length: 179 }, (_, i) => String(9222 + i));
  for (let i = 0; i < 40; i++) {
    // 并发探测：9222/9223 这类端口可能被 Windows 保留区间或残留监听占住，TCP 能握手但永远不回 HTTP，
    // 串行 + 无超时的 fetch 会把整个 verify 卡死（实测 curl 也要 2s 才判定无响应）
    const groups = await Promise.all(ports.map(async (port) => {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(900) })).json();
        return list.map((t) => ({ port, t }));
      } catch { /* 还没起来 / 端口假活 */ return []; }
    }));
    const all = groups.flat();
    // 同一调试口下可能还有别的 Electron 页面（比如本地服务管理器 http://127.0.0.1:7900），必须挑 OpenCode 自己的 oc:// 页面
    const hit = all.find(({ t }) => t.type === 'page' && /^oc:\/\//.test(t.url)) || all.find(({ t }) => t.type === 'page');
    if (hit) {
      if (!ASKED) console.log('调试口:', hit.port);
      return hit.t;
    }
    await sleep(1000);
  }
  throw new Error('连不上调试口 ' + (ASKED || '9222-9400') + '，桌面端启动了吗？');
}

async function evalIn(page, expr) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params) => {
    const myId = ++id;
    ws.send(JSON.stringify({ id: myId, method, params }));
    return new Promise((res) => pending.set(myId, res));
  };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((res) => ws.addEventListener('open', res));
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  ws.close();
  if (r.result?.exceptionDetails) throw new Error('页面里报错: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

const PROBE = `(() => {
  const els = [...document.querySelectorAll('[data-component=reasoning-part]')];
  return {
    blocks: els.length,
    heights: els.slice(-3).map((e) => Math.round(e.getBoundingClientRect().height)),
    foldAll: !!document.querySelector('[data-oc-fold-all]'),
    collapseBtn: !!document.querySelector('[data-reasoning-collapse]'),
    rxBoot: typeof globalThis.__ocReasoningOpen,
    foldAllBoot: typeof globalThis.__ocFoldAllBoot$
  };
})()`;

// ---- 静态校验（--static）：不连桌面端，直接查安装目录 asar 里三组补丁的标记 ----
if (process.argv.includes('--static')) {
  const argAsar = (() => { const i = process.argv.indexOf('--asar'); return i >= 0 ? process.argv[i + 1] : null; })();
  const findInstallAsar = () => {
    const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');
    if (!fs.existsSync(base)) return null;
    for (const d of fs.readdirSync(base)) {
      const dir = path.join(base, d);
      if (fs.existsSync(path.join(dir, 'OpenCode.exe')) && fs.existsSync(path.join(dir, 'resources', 'app.asar'))) {
        return path.join(dir, 'resources', 'app.asar');
      }
    }
    return null;
  };
  const asarPath = argAsar || findInstallAsar();
  if (!asarPath || !fs.existsSync(asarPath)) { console.error('❌ 找不到 app.asar（可用 --asar <path> 指定）'); process.exit(2); }
  const buf = fs.readFileSync(asarPath);
  const dataStart = 8 + buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(16, 16 + buf.readUInt32LE(12)).toString('utf8'));
  const chunks = [];
  const others = {};
  (function walk(node, prefix) {
    for (const k of Object.keys(node.files)) {
      const c = node.files[k];
      if (c.files) { walk(c, prefix + '/' + k); continue; }
      const np = prefix + '/' + k;
      if (prefix === '/out/renderer/assets' && c.size <= 4 * 1024 * 1024) {
        const off = dataStart + Number(c.offset);
        chunks.push({ name: k, text: buf.subarray(off, off + c.size).toString('utf8') });
      } else if (np === '/out/preload/index.cjs' || np === '/out/main/index.js') {
        const off = dataStart + Number(c.offset);
        others[np] = buf.subarray(off, off + c.size).toString('utf8');
      }
    }
  })(header, '');
  const anyChunk = (s) => chunks.some((c) => c.text.includes(s));
  const anyOther = (s) => Object.values(others).some((t) => t.includes(s));
  const checks = [
    ['思考折叠 · 单块折叠逻辑已移除（无 _rx$）', !anyChunk('_rx$=globalThis.__ocReasoningOpen')],
    ['思考折叠 · 收起全部按钮已移除', !anyChunk('data-oc-fold-all')],
    ['首页删除按钮 · 删除动作 home-session-delete', anyChunk('home-session-delete')],
    ['首页删除按钮 · 垃圾桶图标 ZZ_TRASH_ICON', anyChunk('ZZ_TRASH_ICON')],
    // 开关关掉时要能退回官方归档，所以归档动作现在带着 __ocFeatOn$ guard 故意留着；
    // 这里改成检查「没有不带 guard 的裸归档调用」。
    ['首页删除按钮 · 归档动作只剩开关退路', !anyChunk('e.onArchiveSession(e.record.session)') || anyChunk('`home-delete`))return e.onArchiveSession(e.record.session)')],
    ['首页删除按钮 · 归档 data-action 已移除', !anyChunk('`home-session-archive`')],
    ['首页删除按钮 · 多选工具条 data-oc-multi', anyChunk('data-oc-multi')],
    ['首页删除按钮 · 多选入口 __ocMultiEnter$', anyChunk('__ocMultiEnter$')],
    ['首页删除按钮 · 会话映射 __ocRegRow$', anyChunk('__ocRegRow$')],
    ['时间显示 · 启动标记 __ocTimeBoot$', anyChunk('__ocTimeBoot$')],
    ['时间显示 · 回复完成时间 data-oc-done-time', anyChunk('data-oc-done-time')],
    ['时间显示 · 实时速度启动标记 __ocSpeedBoot$', anyChunk('__ocSpeedBoot$')],
    ['时间显示 · 实时速度元素 data-oc-live-tps', anyChunk('data-oc-live-tps')],
    ['时间显示 · 消息用量 data-oc-usage', anyChunk('data-oc-usage')],
    ['时间显示 · 会话统计条 data-oc-stats', anyChunk('data-oc-stats')],
    ['时间显示 · 首页活跃时间 data-oc-home-time', anyChunk('data-oc-home-time')],
    ['时间显示 · 上下文上限按 model id 缓存 __ocCtxLimits$', anyChunk('__ocCtxLimits$')],
    ['文件定位 · 启动标记 __ocFileBoot$', anyChunk('__ocFileBoot$')],
    ['工作中展开/收起 · 启动标记 __ocWorkFoldBoot$', anyChunk('__ocWorkFoldBoot$')],
    ['工作中展开/收起 · 按钮 data-oc-work-fold', anyChunk('data-oc-work-fold')],
    ['功能开关条 · 容器 data-oc-feat-bar', anyChunk('data-oc-feat-bar')],
    ['功能开关条 · 读取函数 __ocFeatOn$', anyChunk('__ocFeatOn$')],
    ['功能开关条 · 五个开关 key', anyChunk('oc-feat:') || anyChunk("'oc-feat:'")],
    ['速度按会话隔离 · LIVE_BY 按 sid 分桶', anyChunk('LIVE_BY')],
    ['速度口径 · 每轮实测平均 ST.lastTurn', anyChunk('ST.lastTurn')],
    ['速度口径 · 本轮累计字符 dL.ch', anyChunk('dL.ch')],
    ['速度口径 · 纯生成窗口 genMs（排除 TTFT）', anyChunk('var genMs = outFirst')],
    ['正文宽度 · 拖拽手柄 data-oc-width-grip', anyChunk('data-oc-width-grip')],
    ['正文宽度 · 常驻竖线 data-oc-grip-line', anyChunk('data-oc-grip-line')],
    ['正文宽度 · 宽度气泡 data-oc-grip-chip', anyChunk('data-oc-grip-chip')],
    ['正文宽度 · 持久化键 oc-read-width', anyChunk('oc-read-width')],
    ['正文宽度 · 跟随审查面板（ResizeObserver + rAF）', anyChunk('__ocRwRo$') && anyChunk('rwTrackUntil')],
    ['文件定位 · preload 暴露 revealPath', (others['/out/preload/index.cjs'] || '').includes('oc:reveal-path')],
    ['文件定位 · 主进程 IPC oc:reveal-path', (others['/out/main/index.js'] || '').includes('oc:reveal-path')],
  ];
  console.log('asar:', asarPath, '(' + buf.length + ' 字节)');
  for (const [label, ok] of checks) console.log((ok ? '✅ ' : '❌ ') + label);
  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? '✅ 四组补丁标记齐全（结构静态校验通过）' : '❌ 有标记缺失：补丁没打上，或被打回了官方原版');
  process.exit(allOk ? 0 : 3);
}

// ---- 行为验证（--delete）：连桌面端检查首页删除 + 多选补丁是否注入 ----
if (process.argv.includes('--delete')) {
  const p = await page();
  console.log('调试页:', p.url);
  const out = await evalIn(p, `(() => {
    const rows = [...document.querySelectorAll('[data-session-id]')];
    const bar = document.querySelector('[data-oc-multi]');
    return {
      multiEnter: typeof globalThis.__ocMultiEnter$,
      regRow: typeof globalThis.__ocRegRow$,
      deleteApi: typeof globalThis.__ocDeleteApi$,
      bar: !!bar, barText: bar ? bar.textContent.trim() : null, barDisplay: bar ? bar.style.display : null,
      rows: rows.length,
      deleteButtons: document.querySelectorAll('[data-action="home-session-delete"]').length,
      firstRowHasButton: rows.length ? !!rows[0].querySelector('[data-action="home-session-delete"]') : null,
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  const ok = out.multiEnter === 'function' && out.regRow === 'function' && out.deleteApi === 'function'
    && out.bar && out.rows > 0 && out.firstRowHasButton;
  console.log(ok ? '✅ 删除/多选补丁已注入（行按钮 + 悬浮工具条 + 全局钩子都在）' : '❌ 删除补丁没生效（见上面字段）');
  process.exit(ok ? 0 : 3);
}

// ---- 行为验证（--time）：连桌面端检查时间补丁（首页活跃时间 + 回复完成时间）----
if (process.argv.includes('--time')) {
  const p = await page();
  console.log('调试页:', p.url);
  const out = await evalIn(p, `(async () => {
    await new Promise(r => setTimeout(r, 2500));
    return {
      boot: !!globalThis.__ocTimeBoot$,
      cache: globalThis.__ocMsgTime$ ? globalThis.__ocMsgTime$.size : -1,
      rows: document.querySelectorAll('[data-session-id]').length,
      homeTimes: [...document.querySelectorAll('[data-oc-home-time]')].map(e => e.textContent).slice(0, 6),
      metas: document.querySelectorAll('[data-slot="text-part-meta"]').length,
      msgLines: document.querySelectorAll('[data-oc-msg-line]').length,
      doneTimes: [...document.querySelectorAll('[data-oc-done-time]')].map(e => e.textContent).slice(-6),
      speedBoot: !!globalThis.__ocSpeedBoot$,
      speedEl: document.querySelectorAll('[data-oc-live-tps]').length,
      speedText: (document.querySelector('[data-oc-live-tps]') || {}).textContent || '',
      tpsWrap: !!document.querySelector('[data-oc-tps-wrap]'),
      tpsTitle: (document.querySelector('[data-oc-tps-wrap]') || {}).title || '',
      statsText: (document.querySelector('[data-oc-stats]') || {}).innerText || '',
      statsLayout: (() => {
        const el = document.querySelector('[data-oc-stats]');
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const kids = [...el.querySelectorAll('[data-oc-stat]')].map(k => k.getBoundingClientRect()).filter(b => b.width > 0);
        const gaps = kids.slice(1).map((b, i) => Math.round(b.x - kids[i].right));
        const left = kids.length ? Math.round(kids[0].x - r.x) : 0;
        const right = kids.length ? Math.round(r.right - kids[kids.length - 1].right) : 0;
        return { display: cs.display, gap: cs.gap, gaps, leftPad: left, rightPad: right, centered: Math.abs(left - right) <= 2 };
      })(),
      usageCount: document.querySelectorAll('[data-oc-usage]').length,
      ctxLimits: globalThis.__ocCtxLimits$ ? Object.entries(globalThis.__ocCtxLimits$).slice(-6) : null,
      ctxNow: (() => {
        const el = document.querySelector('[data-oc-stat="ctx"]');
        return el ? el.textContent.trim() : '';
      })(),
    };
  })()`);
  console.log(JSON.stringify(out, null, 2));
  const okHome = out.rows > 0 ? out.homeTimes.length > 0 : true;
  // 2.2.0：折叠工具组时 text-part-meta 是 0（正文 part 不渲染），补丁改按 turn 行挂 [data-oc-msg-line]，
  // 两种宿主任意一种有就不算失败
  const okMsg = (out.metas > 0 || out.msgLines > 0) ? out.doneTimes.length > 0 : true;
  // 首页没有输入框也没有统计行，速度/tok-s 布局只存在于会话页 —— 在首页时这两项按「不适用」处理，
  // 否则切到首页验首页活跃时间会永远报失败（2026-10-24 实测）
  const onHome = out.rows > 0 && !out.statsLayout;
  const okTps = onHome ? true : (out.speedBoot && out.speedEl > 0 && out.tpsWrap);
  const sl = out.statsLayout;
  const okLayout = onHome ? true : (!!sl && sl.display === 'flex' && sl.centered && sl.gaps.length >= 2 && sl.gaps.every((g) => g >= 16));
  // 速度口径必须是「每轮实测平均」（title 里带「本轮 XXX tok / Y 秒」），不能回退成会话累计
  const okTurn = onHome ? true : (!out.tpsTitle ? true : /本轮/.test(out.tpsTitle));
  const ok = out.boot && okHome && okMsg && okTps && okLayout && okTurn;
  if (sl) console.log(`统计行布局: display=${sl.display} gap=${sl.gap} 实际间距=[${sl.gaps}] 左/右留白=${sl.leftPad}/${sl.rightPad} 居中=${sl.centered}`);
  console.log(`速度口径: ${out.speedText.trim()} | ${out.tpsTitle}`);
  console.log(ok ? '✅ 时间/速度补丁已生效（首页活跃时间 / 回复完成时间 / 统计行 tok/s 且间距居中）' : '❌ 时间/速度补丁没生效（见上面字段）');
  process.exit(ok ? 0 : 3);
}

const p = await page();
console.log('调试页:', p.url);
const out = await evalIn(p, PROBE);
console.log(JSON.stringify(out, null, 2));

if (out && out.err) { console.error('❌ ' + out.err); process.exit(2); }
const ok = !out.foldAll && !out.collapseBtn && out.rxBoot === 'undefined' && out.foldAllBoot === 'undefined';
if (!ok) {
  console.log('❌ 还残留思考折叠补丁：' + JSON.stringify({ foldAll: out.foldAll, collapseBtn: out.collapseBtn, rxBoot: out.rxBoot, foldAllBoot: out.foldAllBoot }));
} else {
  console.log('✅ 思考折叠补丁已完全移除：无收起按钮、无全局状态、官方折叠行为已恢复（当前 ' + out.blocks + ' 个思考块，高度 ' + JSON.stringify(out.heights) + '）');
}
process.exit(ok ? 0 : 3);
