/*
 * 首页会话列表「置顶」（2026-10-30 老板要求）
 *
 * 只有一处改动落到上游组件树：会话右键菜单里多一项「置顶 / 取消置顶」
 * （apply-patch.mjs 的 P1 规则，插在「归档」前面）。菜单本体是 Kobalte/Solid 的
 * M(U$.Item,{onSelect, children})，自己造 DOM 会被它的焦点管理和关闭逻辑甩开，
 * 所以走替换，不做 MutationObserver 插节点。
 *
 * 排序用 CSS：列表容器本身就是 `flex flex-col`，给会话行设 style.order 就能置顶，
 * 一个 DOM 节点都不用搬 —— Solid 用节点引用做 diff，外部搬节点会把它搞乱。
 * 代价是它重渲染会清掉 inline style，所以一直挂 MutationObserver 补回去。
 *
 * 会话行没有 data-session-id，只有标题文本（<span dir="auto">）。菜单回调里能拿到
 * 真 session 对象（e.record.session.id），所以存 id；但往回找 DOM 只能用标题匹配，
 * 标题重名会一起置顶，改名后这条 pin 失效 —— 可接受的退化。
 *
 * 存储：localStorage['oc-pin-sessions'] = [{id,title}, …]（下标 = 置顶顺序）
 * 开关：localStorage['oc-feat:session-pin'] = '0' | '1'（默认开）
 * 标记：__ocPinBoot$、<html data-oc-session-pin="1">（verify.mjs --static 校验）
 */
(function () {
  if (globalThis.__ocPinBoot$) return;
  if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('session-pin')) return;
  globalThis.__ocPinBoot$ = 1;

  var KEY = 'oc-pin-sessions';
  var ROW = '[data-slot="sidebar-inbox-item"]';
  var ORDER_BASE = -1000;
  var boots = 0;

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(v)) return [];
      return v.filter(function (x) { return x && typeof x.id === 'string'; });
    } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(pins)); } catch (e) {}
  }

  var pins = load();

  function styleTag() {
    var id = 'oc-pin-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      ROW + '[data-oc-pinned]{box-shadow:inset 2px 0 0 #6366f1}',
      ROW + '[data-oc-pinned] span[dir="auto"]{color:inherit}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function titleOf(item) {
    var s = item.querySelector('span[dir="auto"]');
    if (s) return (s.textContent || '').trim();
    var all = item.querySelectorAll('span');
    return all.length ? (all[all.length - 1].textContent || '').trim() : '';
  }

  function pinIndexOf(session) {
    if (!session || !session.id) return -1;
    for (var i = 0; i < pins.length; i++) if (pins[i].id === session.id) return i;
    return -1;
  }

  function apply() {
    var items = document.querySelectorAll(ROW);
    var used = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var t = titleOf(it);
      var idx = -1;
      for (var k = 0; k < pins.length; k++) if (!used[k] && pins[k].title === t) { idx = k; break; }
      if (idx >= 0) used[idx] = 1;
      if (idx >= 0) {
        var val = String(ORDER_BASE + idx);
        if (it.style.order !== val) it.style.order = val;
        if (it.getAttribute('data-oc-pinned') !== '1') it.setAttribute('data-oc-pinned', '1');
      } else {
        if (it.style.order) it.style.order = '';
        if (it.hasAttribute('data-oc-pinned')) it.removeAttribute('data-oc-pinned');
      }
    }
  }

  // MutationObserver 回调是 microtask，在下一次 paint 之前执行，所以这里必须同步补写：
  // 一旦延后（哪怕 150ms），Solid 重渲染后到补写之间的空窗就会被画出来 —— 表现为置顶行
  // 掉回原位再跳上去（老板反馈的「互相抢权重」）。列表只有十几行，同步 apply 的开销可以忽略。
  function schedule() {
    apply();
  }

  // ---- 菜单回调 ----
  // 首页会话列表的右键菜单是 Kobalte ContextMenu，组件 props 只有 {archived,onArchive,onUnarchive,onDelete}，
  // 拿不到 session 对象（也就没有 id）。所以右键按下的瞬间先记住「这次点的是哪一行」，菜单项无参调用。
  document.addEventListener('contextmenu', function (ev) {
    var el = ev.target;
    var row = el && el.closest ? el.closest(ROW) : null;
    globalThis.__ocPinCurrent$ = row ? titleOf(row) : '';
  }, true);

  function titleIndex(title) {
    if (!title) return -1;
    for (var i = 0; i < pins.length; i++) if (pins[i].title === title) return i;
    return -1;
  }
  function targetTitle(session) {
    if (session && typeof session.title === 'string') return session.title.trim();
    return (globalThis.__ocPinCurrent$ || '').trim();
  }

  globalThis.__ocPinList$ = function () { return pins; };
  globalThis.__ocPinIs$ = function (session) { return titleIndex(targetTitle(session)) >= 0; };
  globalThis.__ocPinLabel$ = function (session) {
    return titleIndex(targetTitle(session)) >= 0 ? '取消置顶' : '置顶';
  };
  globalThis.__ocPinToggle$ = function (server, session) {
    var title = targetTitle(session);
    if (!title) return;
    var i = titleIndex(title);
    if (i >= 0) pins.splice(i, 1);
    else pins.unshift({ id: (session && session.id) ? session.id : ('t:' + title), title: title });
    save();
    apply();
  };
  globalThis.__ocPinApply$ = apply;

  // ---- 永续生效 ----
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      var t = m.target;
      if (t && t.nodeType === 1 && t.closest && t.closest(ROW)) return schedule();
      for (var j = 0; j < m.addedNodes.length; j++) {
        var nd = m.addedNodes[j];
        if (nd && nd.nodeType === 1) {
          try {
            if (nd.matches(ROW) || (nd.querySelector && nd.querySelector(ROW))) return schedule();
          } catch (e) {}
        }
      }
      for (var k = 0; k < m.removedNodes.length; k++) {
        var rm = m.removedNodes[k];
        if (rm && rm.nodeType === 1) {
          try { if (rm.matches(ROW)) return schedule(); } catch (e) {}
        }
      }
    }
  });

  function boot() {
    if (!document.body) { setTimeout(boot, 50); return; }
    styleTag();
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    apply();
    document.documentElement.setAttribute('data-oc-session-pin', '1');
    // 列表是懒渲染的，前几秒多补几次
    if (boots < 6) { boots++; setTimeout(apply, 400 * boots); }
  }
  boot();
})();
