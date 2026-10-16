// verify.mjs — 通过 CDP 检查思考块补丁是否生效
//   前提：桌面端已用 restart.mjs 启动（带 --remote-debugging-port）
// 用法: node verify.mjs [--port 9222]
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
