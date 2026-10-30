// click-fix.js —— 兜底修复 2.2.2 上游的「点击丢失」bug。
// 现象：右侧审查栏的 x（关闭标签页）、折叠按钮、顶部菜单项等，只有 pointerdown/pointerup，没有 click；
// 原因是 pointerdown 的 handler 里 Solid 把节点重建了（pointerup 时 target 已 isConnected === false），
// Chromium 因此不合成 click。这里在同一个手势没有产生 click 时补一次 .click()。
//
// 补两条路径（2026-10-30 加）：
//   1) pointerdown 时就把「可能被点的按钮/菜单项」记下来，pointerup 后直接点它 —— 顶部菜单的子项
//      在 pointerup 后会被移除，elementFromPoint 已经打不到它了；
//   2) elementFromPoint 兜底（节点被重建但位置没变的情况，比如审查栏的 x）。
(function () {
  var FLAG = '__ocClickFixBoot$';
  if (globalThis[FLAG]) return;
  if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('click-fix')) return;
  globalThis[FLAG] = true;

  var SEL = 'button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],a[href]';
  var down = null;
  var got = false;
  var WINDOW_MS = 1500;
  var MOVE_TOL = 8;

  document.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) { down = null; return; }
    var t = ev.target;
    down = {
      x: ev.clientX,
      y: ev.clientY,
      t: Date.now(),
      el: t && t.closest ? t.closest(SEL) : null
    };
    got = false;
  }, true);

  document.addEventListener('click', function () { got = true; }, true);

  function usable(el) {
    if (!el) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  document.addEventListener('pointerup', function (ev) {
    var d = down;
    down = null;
    if (!d || got) return;
    if (Math.abs(ev.clientX - d.x) > MOVE_TOL || Math.abs(ev.clientY - d.y) > MOVE_TOL) return;
    setTimeout(function () {
      if (got) return;                       // 正常触发的 click 已经处理过
      if (Date.now() - d.t > WINDOW_MS) return;
      // 1) 按下时记下的真实目标（菜单项在 pointerup 后常常已经脱离文档）
      if (usable(d.el)) { d.el.click(); return; }
      // 2) 落点重新命中（节点被重建、位置没变）
      //    用元素栈从内向外找：点在折叠组标题的空白处时，最近的 button 可能不是它自己，
      //    所以要额外回退到所在 collapsed-tool-group 的 trigger。
      var els = document.elementsFromPoint ? document.elementsFromPoint(d.x, d.y) : [document.elementFromPoint(d.x, d.y)];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el || !el.closest) continue;
        var btn = el.closest(SEL);
        if (usable(btn)) { btn.click(); return; }
        var grp = el.closest('[data-component="collapsed-tool-group"]');
        if (grp) {
          var gt = grp.querySelector('button[data-slot="collapsible-trigger"]');
          if (usable(gt)) { gt.click(); return; }
        }
      }
    }, 0);
  }, true);

  document.documentElement.setAttribute('data-oc-click-fix', '1');
})();
