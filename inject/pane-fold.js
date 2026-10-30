/*
 * 最后一个文件标签页关掉后，自动收起右侧「审查和文件」栏（2026-10-30 老板要求）
 *
 * 背景：2.2.2 的审查栏在没有任何文件标签页时会留一个空壳（width 还是展开宽度），
 * 点最后一个 tab 上的 x 关掉它，右边就剩一块空白，得再手动点一次折叠按钮。
 *
 * 判定要「从有到无」：直接看「tab 数为 0 且栏是展开的」会在打开栏的瞬间把它又关掉
 * （刚打开栏的时候本来就没有 tab）。所以记上一次的数量，只有 prev > 0 → 0 才折叠。
 * 首次加载 last = -1，任何一次观察只记录、不动作。
 *
 * 折叠走 aria-label="切换审查" 的按钮（和用户手点同一条路径，动画/状态都由上游管）。
 *
 * 开关：localStorage['oc-feat:pane-fold'] = '0' | '1'（默认开，见 feature-panel.js）
 * 标记：__ocPaneFoldBoot$、<html data-oc-pane-fold="1">（verify.mjs --static 校验）
 */
(function () {
  if (globalThis.__ocPaneFoldBoot$) return;
  if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('pane-fold')) return;
  globalThis.__ocPaneFoldBoot$ = 1;

  var PANE_ID = 'review-panel';
  var TOGGLE = '[aria-label="切换审查"]';
  var last = -1;          // 上一次看到的 tab 数；-1 = 还没观察到
  var timer = null;

  function tabCount() {
    var list = document.querySelector('[role="tablist"]');
    if (!list) return -1;
    return list.querySelectorAll('[role="tab"]').length;
  }

  function paneOpen() {
    var p = document.getElementById(PANE_ID);
    if (!p) return false;
    return p.getAttribute('aria-hidden') !== 'true';
  }

  function check() {
    var n = tabCount();
    if (n < 0) return;            // 审查栏没渲染，忽略
    var prev = last;
    last = n;
    if (n !== 0 || prev <= 0) return;   // 只处理「从有到无」
    if (!paneOpen()) return;
    var btn = document.querySelector(TOGGLE);
    if (!btn) return;
    try { btn.click(); } catch (e) {}
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; check(); }, 120);
  }

  function touchesPane(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.id === PANE_ID) return true;
      if (node.matches && (node.matches('[role="tablist"]') || node.matches('[role="tab"]'))) return true;
      if (node.querySelector && node.querySelector('[role="tablist"]')) return true;
    } catch (e) {}
    return false;
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      var t = m.target;
      if (t && t.nodeType === 1) {
        try {
          if (t.closest && (t.closest('[role="tablist"]') || t.closest('#' + PANE_ID))) return schedule();
        } catch (e) {}
      }
      var j;
      for (j = 0; j < m.addedNodes.length; j++) if (touchesPane(m.addedNodes[j])) return schedule();
      for (j = 0; j < m.removedNodes.length; j++) if (touchesPane(m.removedNodes[j])) return schedule();
    }
  });

  function boot() {
    if (!document.body) { setTimeout(boot, 50); return; }
    mo.observe(document.body, { childList: true, subtree: true });
    last = tabCount();            // 先记录当前状态，别把「打开栏」当成「关掉最后一个」
    document.documentElement.setAttribute('data-oc-pane-fold', '1');
  }
  boot();
})();
