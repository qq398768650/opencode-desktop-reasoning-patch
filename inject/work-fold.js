// 「工作中」这一行中间的 展开/收起 按钮
// ---------------------------------------------------------------------------
// 2.2.x 里每个助手轮的思考、工具调用都被官方塞进 [data-component=collapsed-tool-group]
// 默认折叠，看细节得一个个点开。这里在 timeline 底部的「工作中」状态行（bottom-spacer
// 里那行 flex h-9：`session.timeline.working` 的 shimmer）中间放一个按钮，
// 一键把「本轮」所有思考/工具组全展开，再点全收起。
//
// 定位：
//   - 行： [data-timeline-row="bottom-spacer"] 内、有子节点的 div.flex.h-9.items-center
//          （空行是官方占位，不插）
//   - 本轮：从最后一个 [data-slot="session-turn-message-container"] 往前找，
//          第一个含 collapsed-tool-group 的 turn
//   - 展开/收起：点官方 button[data-slot="collapsible-trigger"]，不自己改 React 状态
//
// React 重渲染会清掉注入节点，所以用 MutationObserver（120ms 节流）+ 800ms 兜底重插。
(function () {
  try {
    if (typeof document === 'undefined' || globalThis.__ocWorkFoldBoot$) return;
    globalThis.__ocWorkFoldBoot$ = 1;

    var SEL_ROW = '[data-timeline-row="bottom-spacer"]';
    var SEL_GROUP = '[data-component="collapsed-tool-group"]';
    var SEL_TRIG = 'button[data-slot="collapsible-trigger"]';

    function workingRow() {
      var bs = document.querySelector(SEL_ROW);
      if (!bs) return null;
      var rows = bs.querySelectorAll('div.flex.h-9.items-center');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].children.length) return rows[i];
      }
      return null;
    }

    function lastGroups() {
      var turns = document.querySelectorAll('[data-slot="session-turn-message-container"]');
      for (var i = turns.length - 1; i >= 0; i--) {
        var g = turns[i].querySelectorAll(SEL_GROUP);
        if (g.length) return Array.prototype.slice.call(g);
      }
      return [];
    }

    function triggers(gs) {
      var out = [];
      for (var i = 0; i < gs.length; i++) {
        var b = gs[i].querySelector(SEL_TRIG);
        if (b) out.push(b);
      }
      return out;
    }

    function allOpen(ts) {
      for (var i = 0; i < ts.length; i++) {
        if (ts[i].getAttribute('aria-expanded') !== 'true') return false;
      }
      return ts.length > 0;
    }

    var btn = null;

    function makeBtn() {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-oc-work-fold', '');
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var ts = triggers(lastGroups());
        if (!ts.length) return;
        var open = allOpen(ts);
        for (var i = 0; i < ts.length; i++) {
          var isOpen = ts[i].getAttribute('aria-expanded') === 'true';
          if (open ? isOpen : !isOpen) ts[i].click();
        }
        paint();
      }, true);
      return b;
    }

    function removeBtn() {
      if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
      btn = null;
    }

    function paint() {
      var row = workingRow();
      var gs = lastGroups();
      var ts = triggers(gs);
      if (!row || !ts.length) { removeBtn(); return; }
      if (!btn) btn = makeBtn();
      if (btn.parentElement !== row) row.appendChild(btn);
      var open = allOpen(ts);
      var label = open ? '收起 ▴' : '展开 ▾';
      if (btn.textContent !== label) btn.textContent = label;
      btn.title = open ? '收起本轮全部思考 / 工具' : '展开本轮全部思考 / 工具';
      if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
    }

    var sty = document.createElement('style');
    sty.id = 'oc-work-fold-css';
    sty.textContent =
      '[data-oc-work-fold]{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'z-index:5;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;' +
      'border:1px solid rgba(127,127,127,.35);border-radius:999px;background:transparent;' +
      'color:inherit;font:inherit;font-size:11px;line-height:16px;opacity:.72;cursor:pointer;' +
      'transition:opacity .15s ease,border-color .15s ease,background-color .15s ease}' +
      '[data-oc-work-fold]:hover{opacity:1;border-color:rgba(127,127,127,.6);background:rgba(127,127,127,.12)}';
    (document.head || document.documentElement).appendChild(sty);

    var t = 0;
    function kick() {
      if (t) return;
      t = setTimeout(function () { t = 0; paint(); }, 120);
    }
    try {
      new MutationObserver(kick).observe(document.body || document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    } catch (e) { }
    globalThis.__ocWorkFoldTimer$ = setInterval(paint, 800);
    paint();
  } catch (e) { }
})();
