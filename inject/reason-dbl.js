/*
 * 双击思考块 = 折叠/展开一次（2026-10-30 老板要求）
 *
 * 背景：2.2.2 的逐块折叠引擎已被上游整组删除（`1969f87`/`4434dcc`，老板反馈卡顿），
 * 现在思考块用官方原生折叠 —— 结构是
 *   div[data-component="reasoning-part"]
 *     div[data-component="collapsible"]
 *       button[type="button"][data-slot="collapsible-trigger"][aria-expanded="false"]
 * 官方单击标题即可切换，本模块只补「双击也切换一次」。
 *
 * 为什么双击里要再点一次：真实双击会产生 click、click、dblclick 三个事件，
 * 官方那两次 click 互相抵消（展开又折回），所以在 dblclick 里补一次 click，
 * 净效果正好是「切换一次」（实测序列：click aria=false → true → click aria=true → false）。
 *
 * 只认标题行（trigger）上的双击：展开后正文很长，双击选词是正常操作，
 * 整块都拦截会把选词弄坏。正文里双击照旧选词，不折叠。
 *
 * 2026-10-30 老板反馈「不对，双击思考的正文」→ 改成**整个思考块**都能双击折叠，
 * 正文里双击也切换（此时浏览器选词被 preventDefault 吃掉，是刻意的）。
 *
 * 开关：localStorage['oc-feat:reason-dbl'] = '0' | '1'（默认开，见 feature-panel.js）
 * 标记：__ocReasonDblBoot$、<html data-oc-reason-dbl="1">（verify.mjs --static 校验）
 */
(function () {
  if (globalThis.__ocReasonDblBoot$) return;
  if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('reason-dbl')) return;
  globalThis.__ocReasonDblBoot$ = 1;

  function triggerOf(el) {
    var part = el && el.closest ? el.closest('[data-component="reasoning-part"]') : null;
    if (!part) return null;
    // 整块都算：标题行、正文、里面的代码块，双击哪都切换（老板 2026-10-30 要求）
    return part.querySelector('[data-slot="collapsible-trigger"]');
  }

  document.addEventListener('dblclick', function (ev) {
    if (ev.button !== 0) return;
    var t = triggerOf(ev.target);
    if (!t) return;
    try { ev.preventDefault(); } catch (e) {}
    try { t.click(); } catch (e) {}
  }, true);

  document.documentElement.setAttribute('data-oc-reason-dbl', '1');
})();
