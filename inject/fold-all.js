(function () {
  try {
    if (globalThis.__ocFoldAllBoot$) return;
    globalThis.__ocFoldAllBoot$ = !0;

    // 官方 timeline 的「分组」开关打开后，一轮里的 Shell/编辑/思考会合成一个
    // [data-component=collapsed-tool-group]，标题就是「使用了 N 个 Shell、编辑…」。
    // 补丁的「打开折叠」= 把这个组点开，里面的块就能正常滚；底部按钮负责一键收回。
    var ID = 'oc-fold-all-btn';
    var GROUP = '[data-component=collapsed-tool-group]';
    var btn = null;

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
        if (groups().some(isOpen)) foldAll(); else openAll();
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

    // ---------- 每轮回复结束收一次 ----------
    // __ocMsgTime$：msgId → { t: {created, completed}, ... }，__ocMsgOwner$：msgId → sid
    function sid() {
      try {
        var u = localStorage.getItem('last-active-url') || '';
        var m = u.match(/ses_[A-Za-z0-9]+/);
        return m ? m[0] : '';
      } catch (e) { return ''; }
    }

    function latestDone() {
      var M = globalThis.__ocMsgTime$, O = globalThis.__ocMsgOwner$, s = sid(), mx = 0;
      if (!M || !M.size) return 0;
      M.forEach(function (v, id) {
        if (!v || !v.t || !v.t.completed) return;
        if (s && O && O.get(id) && O.get(id) !== s) return;
        if (v.t.completed > mx) mx = v.t.completed;
      });
      return mx;
    }

    var lastDone = latestDone();
    setInterval(function () {
      var d = latestDone();
      // 启动时 __ocMsgTime$ 可能还没数据（lastDone=0），第一次拿到值只做基准，不算「刚结束一轮」
      if (!lastDone) { lastDone = d; return; }
      if (d > lastDone) {
        lastDone = d;
        if (groups().some(isOpen)) foldAll();
      }
    }, 600);

    document.addEventListener('scroll', soon, true);
    try {
      new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
    setInterval(refresh, 800);
    refresh();
  } catch (e) { }
})()
