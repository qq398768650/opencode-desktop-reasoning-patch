// apply-patch.mjs — 给 opencode 桌面端 app.asar 打三组补丁
//   [1] 首页会话行「删除」按钮（main-*.js 主 bundle）
//       把官方写死关掉的会话行按钮开关打开，并把该按钮从「归档」改造成「删除」
//       （内联 SVG 垃圾桶图标 + 复用官方删除确认框）。
//   [2] 时间 / 用量 / 速度显示（同一 bundle 内注入）
//   [3] Ctrl+左键点文件路径定位（preload + 主进程 IPC）
// 注：思考折叠补丁（P1/P4/P8 + fold-all）已于 2026-10-28 全部移除 —— 老板反馈
//     该逻辑影响客户端稳定性、明显变卡，改回官方默认行为。
// 用法：
//   node apply-patch.mjs            # dry-run，只报告会改什么
//   node apply-patch.mjs --write    # 真正写入 app.asar（写前请先完全退出桌面端）
//   node apply-patch.mjs --out x.asar  # 只把打好的 asar 写到 x.asar（不动安装目录、不关进程）
//   node apply-patch.mjs --restore  # 用官方备份 app.asar.bak-<版本> 还原 app.asar（撤销补丁）
// 备份约定：<install>/resources/app.asar.bak-<官方版本号> 保存官方原版（本脚本会按需自动创建）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { pickPort } from './debug-port.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const WRITE = process.argv.includes('--write');
const OUT = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : null; })();
const DEBUG_PORT = pickPort();

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
  'if(globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`))return;' +
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
// ---------- 3c) 时间显示 ----------
// ① 每条助手回复末尾（官方 meta 行「Build · model · 耗时」）追加完成时间，如「· 14:32」。
// ② 首页会话行追加最后活跃时间（今天 HH:MM，跨天 MM/DD，跨年 YYYY/MM/DD）。
// 数据来源：
//   - 回复完成时间：后端 `GET /api/session/<sid>/message` 里每条消息的 time.completed。
//     DOM 上 meta 行属于 [data-component=text-part][data-timeline-part-id="msg_xxx:text:0"]，
//     消息 id 取 part id 前缀；也兼容祖先 [data-message-id]。
//     sid 不直接暴露在 DOM 上：先试「最近一次 /api/session/<sid>/message 请求」的 sid，
//     再用 tab 的 data-tab-key 和 performance 里出现过的 sid 兜底，命中即缓存。
//   - 首页活跃时间：__ocRowMap$ 里的 session.time.updated（毫秒）。
// 第三组：时间 / 用量 / 速度 / 会话统计（参照 dsh 的布局，源码在 inject/time-stats.js）
const T_TIME_JS = fs.readFileSync(path.join(HERE, 'inject', 'time-stats.js'), 'utf8').trim();

// 第四组：Ctrl+左键点会话里的文件路径 → 资源管理器打开所在目录并选中文件
const T_FILE_JS = fs.readFileSync(path.join(HERE, 'inject', 'file-reveal.js'), 'utf8').trim();

// 第五组：「工作中」这一行中间的 展开/收起 按钮（一键展开本轮全部思考/工具组）
const T_WORK_JS = fs.readFileSync(path.join(HERE, 'inject', 'work-fold.js'), 'utf8').trim();

// 第六组：顶部标题栏正中的功能开关条（滑块），逐项开关上面这几组补丁。
// 必须最先注入：后面几个模块启动时会读 __ocFeatOn$() 判断自己要不要装。
const T_FEAT_JS = fs.readFileSync(path.join(HERE, 'inject', 'feature-panel.js'), 'utf8').trim();
// 右下角固定的「收起全部」悬浮按钮（只收思考块，跟着 __ocFoldQ$ 走，不随滚动）

// 主进程：加一个 oc:reveal-path IPC（用 shell.showItemInFolder，正好是「打开目录 + 选中文件」）
// 不依赖打包后的压缩变量名：动态 import electron，内置模块走 process.getBuiltinModule。
// 定位顺序（2026-10-28 加强：点了没反应最常见的三种原因都要兜住）：
// ① 原样路径存在 → 直接选中；
// ② 相对路径：依次在「会话目录 + 首页各行项目目录（dirs）」下拼 rel 试 existsSync（快，不做递归）；
// ③ 只有文件名（编辑/写入卡片）：在会话目录里 globSync 同名文件；
// ④ 还找不到：把最接近的目录用 openPath 打开当反馈（旧版直接 return false，表现就是「点了没反应」）。
const MAIN_REVEAL_JS = ';import("electron").then(function(m){try{m.ipcMain.handle("oc:reveal-path",' +
  'function(e,t){try{' +
    'var o=(t&&typeof t==="object")?t:{path:t},p=o.path,root=o.dir,rel=o.rel,ds=o.dirs;' +
    'if(typeof p!=="string"||!p)return!1;' +
    'var gm=(typeof process!=="undefined"&&typeof process.getBuiltinModule==="function")?process.getBuiltinModule.bind(process):null;' +
    'var fs=gm?gm("node:fs"):null,pa=gm?gm("node:path"):null;' +
    'function ex(q){try{return !!(fs&&q&&fs.existsSync(q))}catch(x){return !1}}' +
    'if(fs&&pa){' +
      'if(!ex(p)&&typeof rel==="string"&&rel){' +
        'var cs=[],i;if(root)cs.push(root);' +
        'if(ds&&ds.length)for(i=0;i<ds.length;i++)if(cs.indexOf(ds[i])<0)cs.push(ds[i]);' +
        'for(i=0;i<cs.length;i++){var q2=pa.join(cs[i],rel);if(ex(q2)){p=q2;break}}' +
        'if(!ex(p)&&root){var b0=pa.basename(p);try{var g=fs.globSync("**/"+b0,{cwd:root});if(g&&g.length)p=pa.join(root,g[0])}catch(x){}}' +
      '}' +
      'if(!ex(p)&&root&&pa.basename(p)){try{var g2=fs.globSync("**/"+pa.basename(p),{cwd:root});if(g2&&g2.length)p=pa.join(root,g2[0])}catch(x){}}' +
      'if(!ex(p)){' +
        'var dd=ex(root)?root:(ex(pa.dirname(p))?pa.dirname(p):null);' +
        'if(dd){try{m.shell.openPath(dd)}catch(x){}}' +
        'return !1' +
      '}' +
    '}' +
    'm.shell.showItemInFolder(p);return !0' +
  '}catch(x){return !1}})}catch(x){}});';

// 2.2.2（/out/renderer/assets/main-DApoQvPT.js）：声明锚点变成 `,WKt=!1,GKt=500,KKt=250,qKt=200,JKt=[56,38,66,46,30,52];`；
// 图标组件 wG + 挂载 M（`M(wG,{name:`archive`})`）、showDelete 里也是 `M(y,…)`、右键菜单 `M(U$.Item,…)`。
// D2/D3/D5/D6/F1/F2 原样可用；2.2.2 起 asar 里带 main-*.js.map，改锚点可以直接读源码定位。
// 2.2.0：main chunk 的 minified 名字又换了一轮 —— 行按钮开关 f8→fBt（同一声明里还多了 mBt/hBt/gBt）、
// 组件挂载 F→M（`M(Comp,{...})`，`L(parent,child)`）、图标组件 VP→VG、右键菜单 W4.Item→J$.Item、
// 菜单文案渲染 z→Jt。声明锚点原文：
// `,fBt=!1,pBt=500,mBt=250,hBt=200,gBt=[56,38,66,46,30,52];`（旧版到 500 就结束，新版后面还有 3 个声明）。
// 时间/用量：注入的 T_TIME_JS 里 paintMsgRow() 是 2.2.0 的回退路径 —— 折叠工具组状态下
// `[data-slot=text-part-meta]` 是 0（正文 part 不渲染），改按 `[data-timeline-row=AssistantPart]`
// 整轮在 `[data-slot=session-turn-message-container]` 末尾自建 `[data-oc-msg-line]`；
// 代表消息取行内 `msg_` 前缀 part 中 `time.completed` 最大的那条（行上的 data-message-id 是用户消息 id，
// 只有 time.created，拿它会一直不显示）。折叠组展开后 text-part-meta 会重新出现，此时走旧路径、跳过回退。
const D_RULES = [
  ['D1 打开写死的按钮开关 + 垃圾桶图标 + 注入多选删除 UI + 时间/用量/速度/会话统计 + 文件定位 + 工作中展开收起', ',WKt=!1,GKt=500,KKt=250,qKt=200,JKt=[56,38,66,46,30,52];', ',WKt=!0,GKt=500,KKt=250,qKt=200,JKt=[56,38,66,46,30,52],' + D_TRASH_ICON + ';' + T_FEAT_JS + ';' + D_MULTI_JS + ';' + T_TIME_JS + ';' + T_FILE_JS + ';' + T_WORK_JS + ';'],
  ['D2 tooltip 文案 归档→删除', 'get value(){return e.language.t(`common.archive`)}', 'get value(){return globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`)?e.language.t(`common.archive`):e.language.t(`common.delete`)}'],
  ['D3 动作标识 home-session-archive→delete', '`home-session-archive`', '`home-session-delete`'],
  ['D4 图标 归档→垃圾桶 + 注册行→会话映射', 'get icon(){return M(wG,{name:`archive`})}', 'get icon(){return globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`)?M(wG,{name:`archive`}):(globalThis.__ocRegRow$&&globalThis.__ocRegRow$(e.server,e.record.session),globalThis.__ocDeleteApi$=e.onDeleteSession,M(ZZ_TRASH_ICON,{}))}'],
  ['D5 无障碍标签 归档→删除', 'get"aria-label"(){return e.language.t(`common.archive`)}', 'get"aria-label"(){return globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`)?e.language.t(`common.archive`):e.language.t(`common.delete`)}'],
  ['D6 点击动作 归档→删除 + Shift 免确认', D_ANCHOR, '(function(){if(globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`))return e.onArchiveSession(e.record.session);var _p=globalThis.__ocSkipConfirm;globalThis.__ocSkipConfirm=!!t.shiftKey;try{e.onDeleteSession(e.server,e.record.session)}finally{globalThis.__ocSkipConfirm=_p}})()'],
  ['D7 showDelete 支持跳过确认框（走内部删除函数 v）', 'showDelete:(e,t)=>r.show(()=>M(y,{server:e,session:t}))', 'showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):r.show(()=>M(y,{server:e,session:t}))'],
  ['D8 会话右键菜单加「多选删除」入口', 'M(U$.Item,{onSelect:()=>e.onDeleteSession(e.server,e.record.session),get children(){return[Zt(()=>e.language.t(`common.delete`)),`…`]}})', 'M(U$.Item,{onSelect:()=>e.onDeleteSession(e.server,e.record.session),get children(){return[Zt(()=>e.language.t(`common.delete`)),`…`]}}),M(U$.Item,{onSelect:()=>globalThis.__ocMultiEnter$(e.server,e.record.session),get children(){return[Jt(()=>"多选删除"),`…`]}})'],
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
function findDeleteChunk(a) {
  const hits = findChunk(a, (t) => t.includes(D_ANCHOR));
  if (!hits.length) throw new Error('在所有 renderer chunk 里都没找到首页会话行锚点（' + D_ANCHOR + '）');
  if (hits.length > 1) console.log('注意：首页会话行锚点命中多个 chunk：' + hits.join(', '));
  return hits[0];
}

const srcParsed = parseAsar(source);
const delChunk = findDeleteChunk(srcParsed);
const delPath = '/out/renderer/assets/' + delChunk;
console.log('目标 chunk [首页删除]:', delPath);

const jobs = [];


// ---- 补丁 2：首页会话行「删除」按钮 ----
let del = Buffer.from(readEntry(srcParsed, delPath));
for (const [label, find, repl] of D_RULES) del = replaceOnce(del, find, repl, label);
{
  const txt = del.toString('utf8');
  if (!txt.includes('ZZ_TRASH_ICON')) throw new Error('补丁自检失败：垃圾桶图标没定义');
  if (!txt.includes('home-session-delete')) throw new Error('补丁自检失败：删除按钮的 data-action 没换掉');
  if (!txt.includes('e.onDeleteSession(e.server,e.record.session)')) throw new Error('补丁自检失败：删除动作没接上');
  // 归档动作在「删除按钮」开关关掉时是故意留着当退路的，自检先把自己的 guard 剔掉再看残留
  const noGuard = txt.split('if(globalThis.__ocFeatOn$&&!globalThis.__ocFeatOn$(`home-delete`))return e.onArchiveSession(e.record.session);').join('');
  if (noGuard.includes('e.onArchiveSession(') || noGuard.includes('`home-session-archive`')) throw new Error('补丁自检失败：还残留归档动作');
  if (!txt.includes('showDelete:(e,t)=>globalThis.__ocSkipConfirm?v(e,t):')) throw new Error('补丁自检失败：showDelete 没有接上跳过确认框的分支');
  if (!txt.includes('globalThis.__ocMultiEnter$')) throw new Error('补丁自检失败：多选删除入口没注入');
  if (!txt.includes('__ocRegRow$')) throw new Error('补丁自检失败：会话行→会话映射注册缺失');
  if (!txt.includes('data-oc-multi')) throw new Error('补丁自检失败：多选工具条没注入');
  if (!txt.includes('__ocWorkFoldBoot$')) throw new Error('补丁自检失败：「工作中」展开/收起按钮没注入');
  if (!txt.includes('data-oc-work-fold')) throw new Error('补丁自检失败：「工作中」展开/收起按钮的标记缺失');
  if (!txt.includes('data-oc-feat-bar')) throw new Error('补丁自检失败：顶部功能开关条没注入');
  if (!txt.includes('__ocFeatOn$')) throw new Error('补丁自检失败：功能开关的读取函数没注入');
}
jobs.push({ path: delPath, content: del, label: '首页删除按钮' });

// ---- 补丁 3：preload 暴露 revealPath（renderer 侧用 window.electron.revealPath 调） ----
const PRELOAD_PATH = '/out/preload/index.cjs';
let pre = Buffer.from(readEntry(srcParsed, PRELOAD_PATH));
pre = replaceOnce(
  pre,
  ',getPathForFile:t=>e.webUtils.getPathForFile(t)});',
  ',getPathForFile:t=>e.webUtils.getPathForFile(t),revealPath:t=>e.ipcRenderer.invoke("oc:reveal-path",t)});',
  'F1 preload 暴露 revealPath'
);
if (!pre.toString('utf8').includes('oc:reveal-path')) throw new Error('补丁自检失败：preload 没接上 revealPath');
jobs.push({ path: PRELOAD_PATH, content: pre, label: 'preload 文件定位' });

// ---- 补丁 4：主进程注册 oc:reveal-path（追加到 main chunk 末尾，不依赖压缩变量名） ----
const MAIN_PATH = '/out/main/index.js';
let mainBuf = Buffer.from(readEntry(srcParsed, MAIN_PATH));
const mainTxt = mainBuf.toString('utf8');
if (!mainTxt.includes('ipcMain')) throw new Error('主进程 chunk 里没找到 ipcMain，锚点结构可能变了');
mainBuf = Buffer.from(mainTxt + MAIN_REVEAL_JS, 'utf8');
console.log('  F2 主进程 oc:reveal-path: OK');
jobs.push({ path: MAIN_PATH, content: mainBuf, label: '主进程文件定位' });

// ---- 重建 asar ----
// 两个目标必须串行：每替换一个文件都会平移它之后所有文件的 offset，第二次要在上一次的结果上继续。
let out = source;
for (const j of jobs) {
  console.log('重建 asar [' + j.label + '] …');
  out = rebuildAsar(parseAsar(out), j.path, j.content);
}
console.log('新 app.asar 大小:', out.length, '(原', source.length, ')');

// 把仓库里的斜杠命令装到 OpenCode 的 commands 目录（补丁本身不会带命令，这里顺手装好）
function installCommand() {
  const src = path.join(HERE, 'commands', 'reasoning-patch.md');
  if (!fs.existsSync(src)) return;
  const dstDir = path.join(os.homedir(), '.config', 'opencode', 'commands');
  const dst = path.join(dstDir, 'reasoning-patch.md');
  const next = fs.readFileSync(src);
  const same = fs.existsSync(dst) && fs.readFileSync(dst).equals(next);
  if (same) { console.log('斜杠命令已是最新:', dst); return; }
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(dst, next);
  console.log('已安装斜杠命令:', dst);
}

if (WRITE) {
  const wasRunning = stopApp();          // 必须先关：运行中覆盖 asar 会把当前实例搞崩
  if (!fs.existsSync(BAK)) { fs.copyFileSync(ASAR, BAK); console.log('已保存官方备份:', BAK); }
  fs.writeFileSync(ASAR, out);
  console.log('已写入:', ASAR);
  installCommand();
  if (wasRunning) startApp(dir);         // 关过就自动开回来（带调试口，供 verify.mjs 用）
} else if (OUT) {
  // --out <file>：只把打好的 asar 写到指定位置，不碰安装目录、不关进程（便于先离线检查产物）
  fs.writeFileSync(OUT, out);
  console.log('已写出补丁版 asar:', OUT);
} else {
  console.log('dry-run（加 --write 才真正写入）');
}
