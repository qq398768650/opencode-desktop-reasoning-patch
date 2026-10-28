// 点「主页」后立刻退出，给紧随其后的 verify --delete 抢 3 秒窗口。
// 端口不写死：依次扫 9222–9400（9222 可能被 Windows 保留区间或别的进程占掉）。
let page = null;
for (let port = 9222; port <= 9400 && !page; port++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(400) })).json();
    const p = list.find((t) => t.type === 'page' && /^oc:\/\//.test(t.url));
    if (p) { page = p; console.log('调试口:', port); }
  } catch { /* 没在监听 */ }
}
if (!page) { console.error('没找到 oc:// 调试页，桌面端是不是没带 --remote-debugging-port 启动？'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };
const ev = async (expr) => { const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return m.result?.result?.value; };
console.log('home btn:', await ev(`(() => { const b = document.querySelector('[data-action="vertical-tabs-home"]'); if (!b) return 'none'; b.click(); return 'clicked'; })()`));
await new Promise((r) => setTimeout(r, 250));
console.log('rows:', await ev(`document.querySelectorAll('[data-session-id]').length`));
ws.close();
