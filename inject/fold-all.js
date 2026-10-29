(function () {
  try {
    if (globalThis.__ocFoldAllBoot$) return;
    globalThis.__ocFoldAllBoot$ = !0;

    // 老板定的交互（2026-10-28）：
    //   发消息 → 思考/调工具全程**展开**，单块不再折叠；
    //   这一轮回复结束 → 自动全收一次（收成「使用了 N 个 Shell、编辑…」一行）；
    //   右下角固定按钮 = 手动全收 / 全展开，不随内容滚动。
    // 操作对象是官方 timeline 分组容器 [data-component=collapsed-tool-group]。
    var ID = 'oc-fold-all-btn';
    var GROUP = '[data-component=collapsed-tool-group]';
    var btn = null;
    var userFolded = false;   // 用户手动点过「收起」，本轮内不再自动展开
    var pending = false;

    function groups() {
      return [].slice.call(document.querySelectorAll(GROUP));
    }

    function isOpen(g) {
      var t = g.querySelector('[aria-expanded]');
      return !!t && t.getAttribute('aria-expanded') === 'true';
    }

    function trigger(g) {
      return g.querySelector('[data-slot=collapsible-trigger]') || g.querySelector('[aria-expanded]');
    }

    function setOpen(g, want) {
      if (isOpen(g) === want) return true;
      var t = trigger(g);
      if (!t) return false;
      try { t.click(); } catch (e) { return false; }
      return true;
    }

    // React 的 setState 要等事件循环，同步 while 里 DOM 还没更新，
    // 所以一次只点一个，150ms 后再看下一个。
    function foldAll() { step(true, 0); }
    function openAll() { step(false, 0); }

    function step(fold, k) {
      var gs = groups();
      if (k > gs.length + 3) return;
      var target = fold ? gs.filter(isOpen).pop() : gs.filter(function (g) { return !isOpen(g); })[0];
      if (!target) return;
      if (!setOpen(target, !fold)) return;
      setTimeout(function () { step(fold, k + 1); }, 150);
    }

    // 流式中保持最新一组展开；新工具组冒出来时也会被拉回来
    function ensureOpen() {
      var gs = groups();
      if (!gs.length) return;
      var g = gs[gs.length - 1];
      if (isOpen(g) || pending) return;
      pending = true;
      setOpen(g, true);
      setTimeout(function () { pending = false; }, 220);
    }

    function make() {
      var b = document.createElement('button');
      b.id = ID;
      b.type = 'button';
      b.setAttribute('data-oc-fold-all', '');
      b.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483000;display:none;' +
        'cursor:pointer;border:1px solid rgba(127,127,127,.4);background:rgba(28,28,30,.88);color:#eee;' +
        'font:12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;padding:7px 12px;border-radius:999px;' +
        'letter-spacing:.04em;box-shadow:0 2px 10px rgba(0,0,0,.28)';
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (groups().some(isOpen)) { userFolded = true; foldAll(); }
        else { userFolded = false; openAll(); }
        setTimeout(refresh, 60);
      });
      document.body.appendChild(b);
      return b;
    }

    function refresh() {
      var gs = groups();
      var n = gs.filter(isOpen).length;
      if (!btn || !document.body.contains(btn)) btn = make();
      if (!gs.length) { btn.style.display = 'none'; return 0; }
      btn.style.display = '';
      btn.textContent = n ? '收起全部 ' + n + ' 组 ▴' : '展开全部 ' + gs.length + ' 组 ▾';
      return n;
    }

    var t = 0;
    function soon() {
      if (t) return;
      t = setTimeout(function () { t = 0; refresh(); }, 120);
    }

    // ---------- 判定「这一轮还在跑」 ----------
    // __ocMsgTime$：msgId → { t: {created, completed}, ... }，__ocMsgOwner$：msgId → sid
    function sid() {
      try {
        var u = localStorage.getItem('last-active-url') || '';
        var m = u.match(/ses_[A-Za-z0-9]+/);
        return m ? m[0] : '';
      } catch (e) { return ''; }
    }

    function latestMsg() {
      var M = globalThis.__ocMsgTime$, O = globalThis.__ocMsgOwner$, s = sid(), best = null;
      if (!M || !M.size) return null;
      M.forEach(function (v, id) {
        if (!v || !v.t || !v.t.created) return;
        if (s && O && O.get(id) && O.get(id) !== s) return;
        if (!best || v.t.created > best.created) best = v.t;
      });
      return best;
    }

    function streaming() {
      var b = latestMsg();
      return !!(b && !b.completed);
    }

    var wasStream = streaming();
    setInterval(function () {
      var st = streaming();
      if (st) {
        if (!userFolded) ensureOpen();
      } else if (wasStream) {
        foldAll();          // 整轮结束：自动全收一次
        userFolded = false;
      }
      wasStream = st;
    }, 600);

    document.addEventListener('scroll', soon, true);
    try {
      new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
    setInterval(refresh, 800);
    refresh();
  } catch (e) { }
})()
