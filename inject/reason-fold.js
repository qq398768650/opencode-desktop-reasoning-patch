// 「执行 / Shell」工具卡默认折起，点开才看参数和 Output
// ---------------------------------------------------------------------------
// 只管一件事：单个工具卡（标题是「执行」，跑完变成「Shell」）默认收起来。
// 「使用了 N 个 …」汇总组、思考块等其它折叠块的逻辑全部保持官方原样，
// 这里一律不插手 —— 不强开、不强折、也不连带处理组内子项。
//
// 识别：
//   单项：button[data-slot=collapsible-trigger] 里带 [data-slot=basic-tool-tool-title]
//   汇总组：trigger 里带 [data-component=context-tool-group-trigger]（标题「使用了 N 个 …」）
//   含汇总组 trigger 的按钮直接跳过，一个 click 都不发。
//
// 原则：只碰「执行/Shell」的单项，其它一律不动。
(function () {
  try {
    if (typeof document === 'undefined' || globalThis.__ocReasonFoldBoot$) return;
    if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('reason-fold')) return;
    globalThis.__ocReasonFoldBoot$ = 1;

    var SEL_TRIG = 'button[data-slot="collapsible-trigger"]';
    var TITLE = '[data-slot="basic-tool-tool-title"]';
    var GROUP_TRIG = '[data-component="context-tool-group-trigger"]';

    var KEEP = Object.create(null);   // 老板手动点开过：别再折
    var LAST = Object.create(null);   // 刚被点过的时间戳：600ms 内别跟他抢

    function keyOf(b) {
      var it = b.closest('[data-slot="context-tool-group-item"]') ||
        b.closest('[data-component="context-tool-group-item"]') ||
        b.closest('[data-component="tool-part-wrapper"]') ||
        b.parentElement;
      var pre = 'p|';
      var pid = it && it.getAttribute && (it.getAttribute('data-timeline-part-id') || '');
      if (pid) return pre + pid;
      var root = b.closest('[data-component="collapsed-tool-group"]');
      var rid = root ? (root.getAttribute('data-timeline-part-ids') || '') : '';
      var par = it && it.parentElement;
      var all = par ? [].slice.call(par.children) : [];
      return pre + rid + '#' + (it ? all.indexOf(it) : 0);
    }

    function labelOf(b) {
      var t = b.querySelector(TITLE);
      if (t) {
        var sh = t.querySelector('[data-component="text-shimmer"]');
        var v = (sh && sh.getAttribute('aria-label')) || t.textContent || '';
        return v.replace(/\s+/g, '');
      }
      return '';
    }

    function isExecCard(label) {
      return label === '执行' || label === 'Shell' ||
        label.indexOf('执行') === 0 || label.indexOf('Shell') === 0;
    }

    // 点在这个组的标题区空白处时，ev.target 不在 button 内；用元素栈把 trigger 找回来。
    function triggerAt(x, y, t) {
      var b = t && t.closest ? t.closest(SEL_TRIG) : null;
      if (b) return b;
      var els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      for (var i = 0; i < els.length; i++) {
        var e = els[i];
        if (!e || !e.closest) continue;
        var bb = e.closest(SEL_TRIG);
        if (bb) return bb;
      }
      return null;
    }

    var timer = 0;

    function dbg() {
      try { globalThis.__ocRF$ = { K: KEEP, L: LAST, at: Date.now() }; } catch (e) { }
    }

    function fold() {
      dbg();
      var bs = document.querySelectorAll(SEL_TRIG);
      var now = Date.now();
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        // 「使用了 N 个 …」汇总组：官方逻辑，一律不插手
        if (b.querySelector(GROUP_TRIG)) continue;
        var label = labelOf(b);
        if (!label || !isExecCard(label)) continue;
        var k = keyOf(b);
        if (KEEP[k]) continue;
        if (LAST[k] && now - LAST[k] < 600) continue;
        if (b.getAttribute('aria-expanded') === 'true') {
          try { b.click(); } catch (e) { }
        }
      }
    }

    // 老板点击：在 pointerdown 那一刻读「点之前」的状态，就能直接确定他想开还是想关。
    document.addEventListener('pointerdown', function (ev) {
      if (!ev.isTrusted) return;                    // 我们 b.click() 合成的点击不算
      var t = ev.target;
      if (!t || !t.closest) return;
      var b = triggerAt(ev.clientX, ev.clientY, t);
      if (!b) return;
      if (b.querySelector(GROUP_TRIG)) return;      // 汇总组不记，完全交给官方
      var label = labelOf(b);
      if (!label || !isExecCard(label)) return;
      var k = keyOf(b);
      var now = Date.now();
      if (now - (LAST[k] || 0) < 600) return;       // click-fix 会补发一次，去重
      LAST[k] = now;
      // 点之前是展开的 → 老板要收起，别拦；点之前是折的 → 老板要展开，记住别再折
      if (b.getAttribute('aria-expanded') === 'true') delete KEEP[k];
      else KEEP[k] = 1;
    }, true);

    function kick() {
      if (timer) return;
      timer = setTimeout(function () { timer = 0; fold(); }, 120);
    }

    try {
      new MutationObserver(kick).observe(document.body || document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    } catch (e3) { }

    globalThis.__ocReasonFoldTimer$ = setInterval(fold, 300);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fold);
    else setTimeout(fold, 300);
  } catch (e) { }
})();
