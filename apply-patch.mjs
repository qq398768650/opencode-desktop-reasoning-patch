// apply-patch.mjs — 给 opencode 桌面端 app.asar 打两组补丁
//   [1] 思考折叠（route-*.js 里的思考组件）
//       目标行为：流式中展开 → 思考一结束不立刻折 → 下一段思考开始或正文结果出来时折成一行 →
//                 点标题/底部「收起 ▴」/双击空白都能收；手动开合状态跨重挂载保留。
//   [2] 首页会话行「删除」按钮（main-*.js 主 bundle）
//       把官方写死关掉的会话行按钮开关打开，并把该按钮从「归档」改造成「删除」
//       （内联 SVG 垃圾桶图标 + 复用官方删除确认框）。
// 用法：
//   node apply-patch.mjs            # dry-run，只报告会改什么
//   node apply-patch.mjs --write    # 真正写入 app.asar（写前请先完全退出桌面端）
//   node apply-patch.mjs --out x.asar  # 只把打好的 asar 写到 x.asar（不动安装目录、不关进程）
//   node apply-patch.mjs --restore  # 用官方备份 app.asar.bak-<版本> 还原 app.asar（撤销补丁）
// 备份约定：<install>/resources/app.asar.bak-<官方版本号> 保存官方原版（本脚本会按需自动创建）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawn } from 'node:child_process';

const WRITE = process.argv.includes('--write');
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : null; })();
const DEBUG_PORT = 9222;

function sleep(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { } }
function appRunning() {
  try { return execSync('tasklist /FI "IMAGENAME eq OpenCode.exe" /NH', { encoding: 'utf8' }).includes('OpenCode.exe'); } catch { return false; }
}
function stopApp() {
  if (!appRunning()) return false;
  console.log('关闭桌面端…');
  try { execSync('taskkill /IM OpenCode.exe /F', { stdio: 'ignore' }); } catch { }
  for (let i = 0; i < 60 && appRunning(); i++) sleep(500);
  if (appRunning()) throw new Error('桌面端没关掉，请手动退出后重试');
  console.log('已退出');
  return true;
}
function startApp(dir) {
  const exe = path.join(dir, 'OpenCode.exe');
  const p = spawn(exe, ['--remote-debugging-port=' + DEBUG_PORT], { detached: true, stdio: 'ignore' });
  p.unref();
  console.log('已启动 pid', p.pid, '调试口 127.0.0.1:' + DEBUG_PORT);
}

// ---------- 1) 找安装目录 ----------
function findInstall() {
  const programs = path.join(process.env.LOCALAPPDATA, 'Programs');
  const hits = [];
  if (fs.existsSync(programs)) {
    for (const d of fs.readdirSync(programs)) {
      const dir = path.join(programs, d);
      const res = path.join(dir, 'resources');
      // 认 opencode：目录里有 OpenCode.exe，且 resources 下有 app.asar
      if (fs.existsSync(path.join(dir, 'OpenCode.exe')) && fs.existsSync(path.join(res, 'app.asar'))) hits.push({ dir, res });
    }
  }
  if (!hits.length) throw new Error('没找到 opencode 桌面端安装目录（%LOCALAPPDATA%\\Programs\\*\\OpenCode.exe + resources\\app.asar）');
  if (hits.length > 1) console.log('注意：发现多个候选：', hits.map((h) => h.dir).join(' | '));
  return hits[0];
}

// ---------- 2) asar 读写 ----------
function parseAsar(buf) {
  const pickleSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const dataStart = 8 + pickleSize;
  const header = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8'));
  return { buf, jsonLen, dataStart, header, data: buf.subarray(dataStart) };
}
function walkFiles(node, cb, prefix = '') {
  for (const k of Object.keys(node.files)) {
    const c = node.files[k];
    const np = prefix + '/' + k;
    if (c.files) walkFiles(c, cb, np);
    else cb(np, c);
  }
}
function readEntry(a, p) {
  let hit = null;
  walkFiles(a.header, (np, c) => { if (np === p) hit = c; });
  if (!hit) throw new Error('asar 内找不到 ' + p);
  const off = a.dataStart + Number(hit.offset);
  return a.buf.subarray(off, off + hit.size);
}
function rebuildAsar(a, targetPath, newContent) {
  const entry = (() => { let hit = null; walkFiles(a.header, (np, c) => { if (np === targetPath) hit = c; }); return hit; })();
  const targetOffset = Number(entry.offset);
  const oldSize = entry.size;
  const delta = newContent.length - oldSize;

  entry.integrity.hash = crypto.createHash('sha256').update(newContent).digest('hex');
  const bs = entry.integrity.blockSize;
  const blocks = [];
  for (let o = 0; o < newContent.length; o += bs) blocks.push(crypto.createHash('sha256').update(newContent.subarray(o, Math.min(o + bs, newContent.length))).digest('hex'));
  entry.integrity.blocks = blocks;
  entry.size = newContent.length;

  let shifted = 0;
  walkFiles(a.header, (np, c) => {
    if (typeof c.offset === 'undefined') return;
    const o = Number(c.offset);
    if (o > targetOffset) { c.offset = String(o + delta); shifted++; }
  });

  const jsonStr = JSON.stringify(a.header);
  const jsonBytes = Buffer.byteLength(jsonStr);
  // 关键：header JSON 长度必须与原版一致（不足用空格补齐）。
  // 改短会让 dataStart 前移 → Electron 启动失败（进程直接退出，连日志目录都不建）。
  if (jsonBytes > a.jsonLen) throw new Error(`header JSON 变长了（${jsonBytes} > ${a.jsonLen}），需要人工处理`);
  const padded = jsonStr.padEnd(a.jsonLen, ' ');
  // 关键2：dataStart 必须与原版完全一致 —— 别自己按对齐公式重算。
  // 2.0.30 原版是 4 字节对齐（jsonLen 2172835 → dataStart 2172852，尾部 1 个 NUL），
  // 按 8 字节对齐重算会得到 2172856（+4）→ Electron 直接「加载应用程序时发生错误」。
  const dataStart = a.dataStart;
  const padLen = dataStart - 16 - a.jsonLen;
  if (padLen < 0) throw new Error(`原版 dataStart(${dataStart}) 容不下 jsonLen(${a.jsonLen})，需要人工处理`);
  const head = Buffer.alloc(dataStart);
  head.writeUInt32LE(4, 0);
  head.writeUInt32LE(dataStart - 8, 4);
  head.writeUInt32LE(dataStart - 12, 8);
  head.writeUInt32LE(a.jsonLen, 12);
  head.write(padded, 16, 'utf8');
  // 原版尾部 padding 字节照抄（通常是 NUL）
  a.buf.copy(head, 16 + a.jsonLen, 16 + a.jsonLen, dataStart);

  const newData = Buffer.concat([a.data.subarray(0, targetOffset), newContent, a.data.subarray(targetOffset + oldSize)]);
  console.log(`  target ${targetPath}: ${oldSize} → ${newContent.length} (delta ${delta})，平移 ${shifted} 个 offset`);
  return Buffer.concat([head, newData]);
}

// ---------- 3) 补丁内容 ----------
// 组1 = i 的名字，组2 = 第一个局部变量（2.0.29 里是 e，props），组3 = 第二个（n，本地 store）
const P1_FIND = /([A-Za-z_$][\w$]*)=\(\)=>([A-Za-z_$][\w$]*)\.open\?\?([A-Za-z_$][\w$]*)\.open\?\?\2\.defaultOpen\?\?!1/;
const P4_FIND = 'get open(){return e.disclosure.value(t().ref.partID)??(e.timelineDetail?e.timelineDetail().thinking.details===`expanded`:void 0)}';
const P4_REPL = 'get open(){return e.disclosure.value(t().ref.partID)}';
const P8_FIND = 'onOpenChange:t=>{r(`open`,t),e.onOpenChange?.(t),e.onContentRendered?.()}';
const P8_REPL = 'onOpenChange:t=>{if(!_stream$()||!t)_rx$.set(e.id,t);(_stream$()&&t)||r(`open`,t),e.onContentRendered?.()}';
const P2_FIND = 'x(()=>U(n,`data-timeline-part-id`,e.id)),n})()}';
const P2_REPL = 'x(()=>U(n,`data-timeline-part-id`,e.id)),(()=>{' +
  'var _foot$=document.createElement(`button`);' +
  '_foot$.setAttribute(`type`,`button`);' +
  '_foot$.setAttribute(`data-reasoning-collapse`,``);' +
  '_foot$.style.cssText=`display:block;width:100%;cursor:pointer;background:none;border:0;padding:2px 0 0;margin:0;font:inherit;color:inherit;opacity:.55;text-align:center;letter-spacing:.08em`;' +
  '_foot$.textContent=`收起 ▴`;' +
  // 折叠会让这个块瞬间变矮，上方内容整体位移 —— 用户正在翻历史时视口会被带偏。
  // 所以折叠前记下本块相对视口的位置，折叠后把滚动容器补偿回来（等价于浏览器的 scroll anchoring）。
  'var _findScroller$=function(){var p=n.parentElement;while(p){try{var s=getComputedStyle(p);if(/(auto|scroll)/.test(s.overflowY)&&p.scrollHeight>p.clientHeight+1)return p}catch(e){}p=p.parentElement}return document.scrollingElement||document.documentElement};' +
  'var _anchor$=function(fn){var sc=_findScroller$(),r0=n.getBoundingClientRect(),useB=r0.bottom<=0,meas=function(){var r=n.getBoundingClientRect();return useB?r.bottom:r.top},t0=meas();fn();var fix=function(){if(!sc||!n.isConnected)return;var d=meas()-t0;if(Math.abs(d)>1)sc.scrollTop+=d};fix();try{queueMicrotask(fix)}catch(e){}try{requestAnimationFrame(fix)}catch(e){}};' +
  'var _collapse$=()=>{if(_stream$())return;_anchor$(function(){_rx$.set(e.id,!1),r(`open`,!1),e.onOpenChange?.(!1),e.onContentRendered?.()})};' +
  // 折叠时机：思考结束后不按时间收；等「同一条消息里出现我之后的 part」（= 下一段思考开始，或正文结果出来了）再收一次。
  // 手动开合过的块（_rx$ 里有记录）不自动收。
  'var _pending$=!1;' +
  'var _mo$=new MutationObserver(()=>{if(!n.isConnected){_mo$.disconnect();return}if(_pending$)return;_pending$=!0;setTimeout(()=>{_pending$=!1;if(!n.isConnected){_mo$.disconnect();return}if(!_rx$.has(e.id)&&!_stream$()&&_later$()){_mo$.disconnect(),_collapse$()}},200)});' +
  // 必须在挂载后的 effect 里观察：IIFE 执行时 n 还没进 DOM，parentElement 是空的。
  'Y(()=>{if(!_rx$.has(e.id)&&!_stream$()&&_later$()){_collapse$();return}_mo$.observe(document.body,{childList:!0,subtree:!0})});' +
  '_foot$.addEventListener(`click`,t=>{t.preventDefault(),t.stopPropagation(),_collapse$()});' +
  'n.addEventListener(`dblclick`,t=>{if(t.target&&t.target.closest&&t.target.closest(`a,input,textarea,select,button`))return;_collapse$()});' +
  'x(()=>{_foot$.style.display=i()&&!_stream$()?``:`none`}),n.appendChild(_foot$)' +
  '})(),n})()}';

// ---------- 3b) 首页会话行「删除」按钮 ----------
// 官方代码里写死 SHOW_HOME_SESSION_ARCHIVE=false（编译后是 `bie=!1`），所以每行的操作按钮从不渲染。
// 本补丁把开关打开，并把它从「归档」改造成「删除」（归档后端已禁用；删除复用官方 onDeleteSession + 确认框）。
// 之所以改这个「被禁用的归档按钮」而不是自己造一个：它的 DOM 位置、悬停显隐、tooltip、无障碍标签都是现成的。
const D_ANCHOR = 'e.onArchiveSession(e.record.session)';   // 定位目标 chunk 用（同时也是 D6 的锚点）
// 官方图标集里没有 trash/delete，内联一个 SVG 垃圾桶
const D_TRASH_ICON = 'ZZ_TRASH_ICON=()=>{var s=document.createElementNS(`http://www.w3.org/2000/svg`,`svg`);return s.setAttribute(`viewBox`,`0 0 16 16`),s.setAttribute(`width`,`16`),s.setAttribute(`height`,`16`),s.setAttribute(`fill`,`currentColor`),s.innerHTML=`<path d="M6.4 1.8h3.2l.4 1H13v1.3H3V2.8h3l.4-1ZM3.4 5.4h9.2l-.7 8.1a1.4 1.4 0 0 1-1.4 1.3H5.5a1.4 1.4 0 0 1-1.4-1.3l-.7-8.1Zm3 1.4v5.9h1.2V6.8H6.4Zm2.9 0v5.9h1.2V6.8H9.3Z"/>`,s}';
// 官方的删除强制过一次确认框（showDelete → r.show(确认框)）。为了「一次删很多」方便，加两个口子：
//   1) 行按钮按住 Shift 点击 → 置 __ocSkipConfirm 后调 showDelete，showDelete 见到标志就直接走内部删除函数 v()
//   2) 多选模式：注入一个悬浮工具条，选中多行后一次批量删（内部同样借 __ocSkipConfirm 跳过逐个确认）
// v(server,session) 是官方内部删除函数（showDelete 的闭包里可见），data.session.remove(id) + 失效 home-sessions 查询。
const D_MULTI_JS = '(function(){try{' +
  'if(typeof document==="undefined"||globalThis.__ocMultiBoot$)return;' +
  'globalThis.__ocMultiBoot$=1;' +
  'var S=globalThis.__ocMultiState$={on:!1,sel:new Map(),armed:!1};' +
  'var ROW=globalThis.__ocRowMap$=new Map();' +
  'globalThis.__ocRegRow$=globalThis.__ocRegRow$||function(server,session){try{if(session&&session.id)ROW.set(session.id,{server:server,session:session})}catch(e){}};' +
  'var rowsNow=function(){return document.querySelectorAll("[data-session-id]")};' +
  'var paintRows=function(){var a=rowsNow(),i;for(i=0;i<a.length;i++){var id=a[i].getAttribute("data-session-id");if(S.on&&S.sel.has(id))a[i].classList.add("oc-multi-sel");else a[i].classList.remove("oc-multi-sel")}};' +
  'var paintBar=function(){' +
    'var n=S.sel.size;' +
    'bar.style.display=(S.on||rowsNow().length)?"flex":"none";' +
    'bar.textContent="";' +
    'if(!S.on){bar.appendChild(mk("多选删除","rgba(255,255,255,.14)",function(){S.on=!0;S.armed=!1;paintBar();paintRows()}));return}' +
    'var lab=document.createElement("span");lab.textContent="已选 "+n;lab.style.cssText="padding:0 4px;opacity:.85";bar.appendChild(lab);' +
    'bar.appendChild(mk("全选","rgba(255,255,255,.14)",function(){var a=rowsNow(),i;for(i=0;i<a.length;i++){var id=a[i].getAttribute("data-session-id"),r=ROW.get(id);if(id&&r)S.sel.set(id,r)}S.armed=!1;paintBar();paintRows()}));' +
    'bar.appendChild(mk(S.armed?("确认删除 "+n):(n?("删除 "+n):"删除"),"#e11d48",function(){if(!S.sel.size)return;if(!S.armed){S.armed=!0;paintBar();return}runDel()}));' +
    'bar.appendChild(mk("取消","rgba(255,255,255,.14)",function(){S.on=!1;S.sel.clear();S.armed=!1;paintBar();paintRows()}));' +
  '};' +
  'var runDel=function(){' +
    'var api=globalThis.__ocDeleteApi$,items=[];' +
    'S.sel.forEach(function(v){items.push(v)});' +
    'S.on=!1;S.sel.clear();S.armed=!1;paintBar();paintRows();' +
    'if(!api)return;' +
    'for(var it=0;it<items.length;it++){var _p=globalThis.__ocSkipConfirm;globalThis.__ocSkipConfirm=!0;try{api(items[it].server,items[it].session)}catch(e){}globalThis.__ocSkipConfirm=_p}' +
  '};' +
  'globalThis.__ocMultiEnter$=function(server,session){try{S.on=!0;S.armed=!1;if(session&&session.id){ROW.set(session.id,{server:server,session:session});S.sel.set(session.id,{server:server,session:session})}paintBar();paintRows()}catch(e){}};' +
  'var head=document.head||document.documentElement;' +
  'var sty=document.createElement("style");' +
  'sty.textContent="[data-session-id].oc-multi-sel{outline:2px solid #f43f5e;outline-offset:-2px;border-radius:8px}";' +
  'head&&head.appendChild(sty);' +
  'var bar=document.createElement("div");' +
  'bar.setAttribute("data-oc-multi","1");' +
  'bar.style.cssText="position:fixed;right:14px;bottom:14px;z-index:2147483000;display:none;align-items:center;gap:6px;padding:5px 6px;border-radius:10px;background:rgba(24,24,27,.94);color:#fafafa;box-shadow:0 8px 24px rgba(0,0,0,.4);font:12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif";' +
  '(document.body||document.documentElement).appendChild(bar);' +
  'var mk=function(label,bg,fn){var b=document.createElement("button");b.type="button";b.textContent=label;b.style.cssText="cursor:pointer;border:0;border-radius:7px;padding:5px 10px;font:inherit;color:#fafafa;background:"+bg;b.addEventListener("click",function(ev){ev.preventDefault();ev.stopPropagation();fn()},!0);return b};' +
  'document.addEventListener("click",function(ev){if(!S.on)return;var tn=ev.target;if(tn&&tn.closest&&tn.closest("[data-oc-multi]"))return;var el=tn&&tn.closest&&tn.closest("[data-session-id]");if(!el)return;ev.preventDefault();ev.stopPropagation();var id=el.getAttribute("data-session-id");if(S.sel.has(id))S.sel.delete(id);else{var r=ROW.get(id);if(r)S.sel.set(id,r)}S.armed=!1;paintBar();paintRows()},!0);' +
  'document.addEventListener("mousedown",function(ev){if(!S.on)return;var tn=ev.target;if(tn&&tn.closest&&tn.closest("[data-oc-multi]"))return;if(tn&&tn.closest&&tn.closest("[data-session-id]")){ev.preventDefault();ev.stopPropagation()}},!0);' +
  'try{var mo=new MutationObserver(function(){paintRows();var has=rowsNow().length?1:0;if(has!==globalThis.__ocMultiHas$){globalThis.__ocMultiHas$=has;paintBar()}});mo.observe(document.body||document.documentElement,{childList:!0,subtree:!0})}catch(e){}' +
'}catch(e){}})()';
const D_RULES = [
  ['D1 打开写死的按钮开关 + 垃圾桶图标 + 注入多选删除 UI', ',bie=!1,xie=500;', ',bie=!0,xie=500,' + D_TRASH_ICON + ';' + D_MULTI_JS + ';'],
  ['D2 tooltip 文案 归档→删除', 'get value(){return e.language.t(`common.archive`)}', 'get value(){return e.language.t(`common.delete`)}'],
  ['D3 动作标识 home-session-archive→delete', '`home-session-archive`', '`home-session-delete`'],
  ['D4 图标 归档→垃圾桶 + 注册行→会话映射', 'get icon(){return F(jP,{name:`archive`})}', 'get icon(){return globalThis.__ocRegRow$&&globalThis.__ocRegRow$(e.server,e.record.session),globalThis.__ocDeleteApi$=e.onDeleteSession,F(ZZ_TRASH_ICON,{})}'],
  ['D5 无障碍标签 归档→删除', 'get"aria-label"(){return e.language.t(`common.archive`)}', 'get"aria-label"(){return e.language.t(`common.delete`)}'],
  ['D6 点击动作 归档→删除 + Shift 免确认', D_ANCHOR, '(function(){var _p=globalThis.__ocSkipConfirm;globalThis.__ocSkipConfirm=!!t.shiftKey;try{e.onDeleteSession(e.server,e.record.session)}finally{globalThis.__ocSkipConfirm=_p}})()'],
  ['D7 showDelete 支持跳过确认框（走内部删除函数 v）', 'showDelete:(e,t)=>r.show(()=>F(y,{server:e,session:t}))', 'showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):r.show(()=>F(y,{server:e,session:t}))'],
  ['D8 会话右键菜单加「多选删除」入口', 'F(B3.Item,{onSelect:()=>e.onDeleteSession(e.server,e.record.session),get children(){return[z(()=>e.language.t(`common.delete`)),`…`]}})', 'F(B3.Item,{onSelect:()=>e.onDeleteSession(e.server,e.record.session),get children(){return[z(()=>e.language.t(`common.delete`)),`…`]}}),F(B3.Item,{onSelect:()=>globalThis.__ocMultiEnter$(e.server,e.record.session),get children(){return[z(()=>"多选删除"),`…`]}})'],
];

function replaceOnce(content, find, repl, label) {
  const s = content.toString('utf8');
  if (find instanceof RegExp) {
    const m = s.match(find);
    if (!m) throw new Error(label + '：锚点没找到（新版本代码结构可能变了，需要先看 bundle 再改锚点）');
    const out = s.replace(find, repl(m));
    console.log(`  ${label}: OK`);
    return Buffer.from(out, 'utf8');
  }
  const i = s.indexOf(find);
  if (i < 0) throw new Error(label + '：锚点没找到（新版本代码结构可能变了）');
  if (s.indexOf(find, i + 1) !== -1) throw new Error(label + '：锚点不唯一');
  const out = s.slice(0, i) + repl + s.slice(i + find.length);
  console.log(`  ${label}: OK`);
  return Buffer.from(out, 'utf8');
}

// ---------- 4) 主流程 ----------
const { dir, res } = findInstall();
const ASAR = path.join(res, 'app.asar');
console.log('安装目录:', dir);

const pkg = JSON.parse(readEntry(parseAsar(fs.readFileSync(ASAR)), '/package.json').toString('utf8'));
const ver = pkg.version;
const BAK = path.join(res, `app.asar.bak-${ver}`);
console.log('当前版本:', ver, '(' + pkg.name + ')');

// --restore：用官方备份还原（撤销补丁）。必须放在「补丁源」判定之前，否则会被判成「已打过补丁」而拒绝。
if (process.argv.includes('--restore')) {
  if (!fs.existsSync(BAK)) throw new Error('没找到官方备份 ' + BAK + '，无法还原（可以从 opencode 安装包或 updater 的 pending 包里取官方 app.asar）');
  const wasRunning = stopApp();          // 运行中覆盖会崩，必须先关
  fs.copyFileSync(BAK, ASAR);
  console.log('已还原官方原版:', ASAR, '(' + fs.statSync(ASAR).size + ' 字节，来源 ' + path.basename(BAK) + ')');
  if (wasRunning) startApp(dir);
  process.exit(0);
}

const cur = fs.readFileSync(ASAR);
const curParsed = parseAsar(cur);
let source, sourceLabel;
if (fs.existsSync(BAK)) {
  source = fs.readFileSync(BAK);
  sourceLabel = BAK;
} else {
  const marks = [];
  if (findChunk(curParsed, (t) => t.includes('_rx$=globalThis.__ocReasoningOpen')).length) marks.push('思考折叠');
  if (findChunk(curParsed, (t) => t.includes('home-session-delete')).length) marks.push('首页删除按钮');
  if (marks.length) throw new Error('当前 app.asar 看起来已经打过补丁（' + marks.join('、') + '），但没有官方备份 ' + BAK + '，请先手工还原官方版');
  source = cur;
  sourceLabel = ASAR + '（首次运行：将把它存为官方备份）';
}
console.log('补丁源:', sourceLabel);

function findChunk(a, test) {
  const hits = [];
  walkFiles(a.header, (np, c) => {
    if (!/^\/out\/renderer\/assets\/.*\.js$/.test(np)) return;
    if (!c.offset) return;
    const off = a.dataStart + Number(c.offset);
    const txt = a.buf.subarray(off, off + Math.min(c.size, 4_000_000)).toString('utf8');
    if (test(txt)) hits.push(np.slice('/out/renderer/assets/'.length));
  });
  return hits;
}
function findTargetChunk(a) {
  const hits = findChunk(a, (t) => P1_FIND.test(t));
  if (!hits.length) throw new Error('在所有 renderer chunk 里都没找到思考组件锚点');
  if (hits.length > 1) console.log('注意：思考组件锚点命中多个 chunk：' + hits.join(', '));
  return hits[0];
}
function findDeleteChunk(a) {
  const hits = findChunk(a, (t) => t.includes(D_ANCHOR));
  if (!hits.length) throw new Error('在所有 renderer chunk 里都没找到首页会话行锚点（' + D_ANCHOR + '）');
  if (hits.length > 1) console.log('注意：首页会话行锚点命中多个 chunk：' + hits.join(', '));
  return hits[0];
}

const srcParsed = parseAsar(source);
const chunk = findTargetChunk(srcParsed);
const targetPath = '/out/renderer/assets/' + chunk;
console.log('目标 chunk [思考折叠]:', targetPath);
const delChunk = findDeleteChunk(srcParsed);
const delPath = '/out/renderer/assets/' + delChunk;
console.log('目标 chunk [首页删除]:', delPath);

const jobs = [];

// ---- 补丁 1：思考折叠 ----
let content = Buffer.from(readEntry(srcParsed, targetPath));
// P1：i() 改成「流式中恒展开；非流式只看记账表（_rx$）」，并顺手把 _rx$ / _stream$ 声明进同一个 let 列表。
// 注意：必须一次替换搞定（之前分 P1/P1b 两步，P1b 的正则只有 2 个分组却按 3 个解构 → 写出了 `undefined.open`，直接让渲染进程崩）。
{
  const s = content.toString('utf8');
  const m = s.match(P1_FIND);
  if (!m) throw new Error('P1：锚点没找到（新版本代码结构可能变了，需要先看 bundle 再改锚点）');
  const name = m[1];        // i
  const propsVar = m[2];    // e（组件 props）
  const storeVar = m[3];    // n（本地 store）
  // props 变量名以紧邻的 memo 为准（`a=N(()=>e.streaming?...`），避免硬编码
  const after = s.slice(m.index, m.index + 240);
  const pv = (after.match(/([A-Za-z_$][\w$]*)\.streaming\?/) || [])[1] || propsVar;
  const decl = `_rx$=globalThis.__ocReasoningOpen||(globalThis.__ocReasoningOpen=new Map()),` +
    `_stream$=()=>!!(${pv}.streaming&&${pv}.content?.time?.completed===void 0),` +
    // 「我后面有没有出现下一段思考（带收起按钮的块）或正文块」—— 工具调用行（含 .tool-collapsible）不算，
    // 否则每轮思考完一调工具就立刻收起。定位「我」用 part id 比对，不依赖父节点（每个 part 的父节点都不同）。
    `_later$=()=>{var _a$=[...document.querySelectorAll(\`[data-timeline-part-id]\`)],_k$=-1,_j$;` +
    `for(_j$=0;_j$<_a$.length;_j$++)if(_a$[_j$].getAttribute(\`data-timeline-part-id\`)===${propsVar}.id)_k$=_j$;` +
    `for(_j$=_k$+1;_j$<_a$.length;_j$++){var _e$=_a$[_j$];` +
    `if(_e$.getAttribute(\`data-timeline-part-id\`)===${propsVar}.id)continue;` +
    `if(_e$.querySelector(\`[data-reasoning-collapse]\`))return!0;` +
    `if(_e$.querySelector(\`.tool-collapsible\`))continue;` +
    `if((_e$.textContent||\`\`).trim())return!0}return!1},`;
  // 默认值：流式中展开；用户手动开合过就听用户的；否则看「后面有没有下一段思考/正文」——
  // 有就折叠，没有就**保持展开**（这就是「思考结束后不立刻折」的关键：思考结束组件会重挂载，
  // 那时 _rx$ 里没有记录，必须靠 !_later$() 撑住展开，否则默认值 false 会立刻收）。
  const newI = `${name}=()=>_stream$()?!0:(${storeVar}.open!==void 0?!!${storeVar}.open:(_rx$.has(${propsVar}.id)?!!_rx$.get(${propsVar}.id):!_later$()))`;
  content = Buffer.from(s.slice(0, m.index) + decl + newI + s.slice(m.index + m[0].length), 'utf8');
  console.log('  P1 (i() + _rx$/_stream$ 声明): OK');
}
content = replaceOnce(content, P4_FIND, P4_REPL, 'P4 (去掉设置兜底)');
content = replaceOnce(content, P8_FIND, P8_REPL, 'P8 (open 状态记账)');
content = replaceOnce(content, P2_FIND, P2_REPL, 'P2+P3 (收起按钮/双击/结束时折叠)');

// 自检：产物里绝不能出现 undefined.xxx（变量名没接上），也不能缺声明
{
  const txt = content.toString('utf8');
  if (/undefined\.[A-Za-z_$]/.test(txt)) throw new Error('补丁自检失败：产物里出现 undefined.<prop>，变量名没接上');
  if (!txt.includes('_stream$=()=>!!(')) throw new Error('补丁自检失败：_stream$ 声明缺失');
  if (!txt.includes('_later$') || !txt.includes('MutationObserver')) throw new Error('补丁自检失败：折叠时机（下一段 part 出现才收）逻辑缺失');
  if (!txt.includes('!_later$()')) throw new Error('补丁自检失败：i() 缺少「后面没有下一段思考/正文时保持展开」的默认值');
  if (!txt.includes('_anchor$=function')) throw new Error('补丁自检失败：折叠时的滚动位置补偿（_anchor$）缺失');
  if (txt.includes('_graceTimer$')) throw new Error('补丁自检失败：还残留按时间折叠的 grace 逻辑');
  if (!txt.includes('data-reasoning-collapse')) throw new Error('补丁自检失败：收起按钮没生成');
}

jobs.push({ path: targetPath, content, label: '思考折叠' });

// ---- 补丁 2：首页会话行「删除」按钮 ----
let del = Buffer.from(readEntry(srcParsed, delPath));
for (const [label, find, repl] of D_RULES) del = replaceOnce(del, find, repl, label);
{
  const txt = del.toString('utf8');
  if (!txt.includes('ZZ_TRASH_ICON')) throw new Error('补丁自检失败：垃圾桶图标没定义');
  if (!txt.includes('home-session-delete')) throw new Error('补丁自检失败：删除按钮的 data-action 没换掉');
  if (!txt.includes('e.onDeleteSession(e.server,e.record.session)')) throw new Error('补丁自检失败：删除动作没接上');
  if (txt.includes('e.onArchiveSession(') || txt.includes('`home-session-archive`')) throw new Error('补丁自检失败：还残留归档动作');
  if (!txt.includes('showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):')) throw new Error('补丁自检失败：showDelete 没有接上跳过确认框的分支');
  if (!txt.includes('globalThis.__ocMultiEnter$')) throw new Error('补丁自检失败：多选删除入口没注入');
  if (!txt.includes('__ocRegRow$')) throw new Error('补丁自检失败：会话行→会话映射注册缺失');
  if (!txt.includes('data-oc-multi')) throw new Error('补丁自检失败：多选工具条没注入');
}
jobs.push({ path: delPath, content: del, label: '首页删除按钮' });

// ---- 重建 asar ----
// 两个目标必须串行：每替换一个文件都会平移它之后所有文件的 offset，第二次要在上一次的结果上继续。
let out = source;
for (const j of jobs) {
  console.log('重建 asar [' + j.label + '] …');
  out = rebuildAsar(parseAsar(out), j.path, j.content);
}
console.log('新 app.asar 大小:', out.length, '(原', source.length, ')');

if (WRITE) {
  const wasRunning = stopApp();          // 必须先关：运行中覆盖 asar 会把当前实例搞崩
  if (!fs.existsSync(BAK)) { fs.copyFileSync(ASAR, BAK); console.log('已保存官方备份:', BAK); }
  fs.writeFileSync(ASAR, out);
  console.log('已写入:', ASAR);
  if (wasRunning) startApp(dir);         // 关过就自动开回来（带调试口，供 verify.mjs 用）
} else if (OUT) {
  // --out <file>：只把打好的 asar 写到指定位置，不碰安装目录、不关进程（便于先离线检查产物）
  fs.writeFileSync(OUT, out);
  console.log('已写出补丁版 asar:', OUT);
} else {
  console.log('dry-run（加 --write 才真正写入）');
}
