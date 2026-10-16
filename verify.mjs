// verify.mjs — 通过 CDP 检查思考块补丁是否生效
//   前提：桌面端已用 restart.mjs 启动（带 --remote-debugging-port）
// 用法: node verify.mjs [--port 9222]           # CDP 行为验证
//       node verify.mjs --static [--asar <p>]   # 只做静态检查：不连桌面端，直接查 asar 里两组补丁的标记
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 ? process.argv[i + 1] : '9222';
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* 还没起来 */ }
    await sleep(1000);
  }
  throw new Error('连不上调试口 127.0.0.1:' + PORT + '，桌面端启动了吗？');
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
  const pick = () => [...document.querySelectorAll('[data-timeline-part-id]')].filter(h => h.querySelector('[data-reasoning-collapse]'));
  const els = pick();
  if (!els.length) return { err: '页面上没找到思考块（请先打开一个会话，且会话里要有已完成的思考）' };
  const el = els[els.length - 1];
  const pid = el.getAttribute('data-timeline-part-id');
  const stOf = (e) => {
    const f = e.querySelector('[data-reasoning-collapse]');
    return Math.round(e.getBoundingClientRect().height) + 'px/' + (f && f.style.display !== 'none' ? 'open' : 'closed');
  };
  const st = () => { const b = document.querySelector('[data-timeline-part-id="' + pid + '"]'); return b ? stOf(b) : 'GONE'; };
  const click = () => {
    const b = document.querySelector('[data-timeline-part-id="' + pid + '"]');
    b.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };
  // 第一个思考块（历史块，后面一定有正文）应该默认折叠
  const first = els[0] === el ? null : stOf(els[0]);
  const seq = [st()];
  click();
  return new Promise((res) => setTimeout(() => {
    seq.push(st()); click();
    setTimeout(() => { seq.push(st()); res({ pid, blocks: els.length, first, seq }); }, 600);
  }, 600));
})()`;

// ---- 静态校验（--static）：不连桌面端，直接查安装目录 asar 里两组补丁的标记 ----
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
  (function walk(node, prefix) {
    for (const k of Object.keys(node.files)) {
      const c = node.files[k];
      if (c.files) { walk(c, prefix + '/' + k); continue; }
      if (prefix === '/out/renderer/assets' && c.size <= 4 * 1024 * 1024) {
        const off = dataStart + Number(c.offset);
        chunks.push({ name: k, text: buf.subarray(off, off + c.size).toString('utf8') });
      }
    }
  })(header, '');
  const anyChunk = (s) => chunks.some((c) => c.text.includes(s));
  const checks = [
    ['思考折叠 · 全局状态 Map（_rx$）', anyChunk('_rx$=globalThis.__ocReasoningOpen')],
    ['思考折叠 · 收起按钮标记', anyChunk('data-reasoning-collapse')],
    ['首页删除按钮 · 删除动作 home-session-delete', anyChunk('home-session-delete')],
    ['首页删除按钮 · 垃圾桶图标 ZZ_TRASH_ICON', anyChunk('ZZ_TRASH_ICON')],
    ['首页删除按钮 · 归档动作已移除', !anyChunk('e.onArchiveSession(e.record.session)')],
    ['首页删除按钮 · 归档 data-action 已移除', !anyChunk('`home-session-archive`')],
  ];
  console.log('asar:', asarPath, '(' + buf.length + ' 字节)');
  for (const [label, ok] of checks) console.log((ok ? '✅ ' : '❌ ') + label);
  const allOk = checks.every(([, ok]) => ok);
  console.log(allOk ? '✅ 两组补丁标记齐全（结构静态校验通过）' : '❌ 有标记缺失：补丁没打上，或被打回了官方原版');
  process.exit(allOk ? 0 : 3);
}

const p = await page();
console.log('调试页:', p.url);
const out = await evalIn(p, PROBE);
console.log(JSON.stringify(out, null, 2));

if (out && out.err) { console.error('❌ ' + out.err); process.exit(2); }
const [a, b, c] = out.seq;
const okFlip = a !== b && b !== c && a !== 'GONE' && b !== 'GONE' && c !== 'GONE';
const okFirst = !out.first || out.first.endsWith('/closed');
const ok = okFlip && okFirst;
if (!ok) {
  console.log('❌ 行为不符合预期（见上面 seq）');
} else {
  console.log('✅ 补丁生效：点一下能收起/展开' + (out.first ? '，历史思考块默认折叠' : '（最后一段思考后面还没出正文，默认保持展开属正常）'));
}
process.exit(ok ? 0 : 3);
