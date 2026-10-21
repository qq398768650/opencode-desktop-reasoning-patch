// 采样发送按钮旁的速度文字
const PORTS = Array.from({ length: 179 }, (_, i) => 9222 + i);
async function findPage() {
  for (const port of PORTS) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && /^oc:\/\//.test(t.url)) || list.find((t) => t.type === 'page');
      if (p) return { port, page: p };
    } catch { }
  }
  throw new Error('no debug port');
}
const { port, page } = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params) => { const myId = ++id; ws.send(JSON.stringify({ id: myId, method, params })); return new Promise((res) => pending.set(myId, res)); };
ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
await new Promise((res) => ws.addEventListener('open', res));
const evalIn = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
console.log('port', port);
for (let i = 0; i < 90; i++) {
  const r = await evalIn(`(() => {
    const s = document.querySelector('[data-oc-live-tps]');
    const b = document.querySelector('[data-action="composer-submit"]');
    return {
      t: Date.now() % 100000,
      txt: s ? s.textContent : null,
      disp: s ? s.style.display : null,
      btn: b ? b.getAttribute('aria-label') : null,
      boot: !!globalThis.__ocSpeedBoot$,
    };
  })()`);
  console.log(JSON.stringify(r));
  await new Promise((res) => setTimeout(res, 500));
}
ws.close();
