(function () {
  try {
    if (globalThis.__ocFoldAllBoot$) return;
    globalThis.__ocFoldAllBoot$ = !0;

    // 固定在右下角，不随内容滚动（position:fixed 不受滚动容器影响）。
    // 不收 __ocFoldQ$ —— 那张表只留「还没被自动折叠处理过」的块（自适应扫描会 splice 掉），
    // 拿它做「全部」只会收掉几个。直接扫 DOM 上的 reasoning-part。
    var ID = 'oc-fold-all-btn';
    var PART = '[data-component=reasoning-part]';
    var btn = null;

    // 折叠后块只有一行（实测 28px），展开是几百 px
    function isOpen(el) {
      try { return el.getBoundingClientRect().height > 48; } catch (e) { return false; }
    }

    function openParts() {
      var out = [], ps = document.querySelectorAll(PART), i;
      for (i = 0; i < ps.length; i++) if (isOpen(ps[i])) out.push(ps[i]);
      return out;
    }

    function foldAll() {
      // 每次点击都会让 React 重渲染、旧 DOM 引用失效，所以每轮重新查一遍，
      // 且只收「最后一个展开的块」——从下往上收，上方内容不动。
      var guard = openParts().length + 5;
      while (guard-- > 0) {
        var ps = openParts();
        if (!ps.length) break;
        var el = ps[ps.length - 1];
        var f = el.querySelector('[data-reasoning-collapse]');
        if (!f) break;
        try { f.click(); } catch (e) { }
        if (isOpen(el)) break;   // 收不动（流式中），停手别死循环
      }
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
        foldAll();
        setTimeout(refresh, 60);
      });
      document.body.appendChild(b);
      return b;
    }

    function refresh() {
      var n = openParts().length;
      if (!btn || !document.body.contains(btn)) btn = make();
      btn.style.display = n ? '' : 'none';
      if (n) btn.textContent = '收起全部 ' + n + ' 项 ▴';
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
      if (d > lastDone) {
        lastDone = d;
        if (openParts().length) foldAll();
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
