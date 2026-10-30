// 第十三组：审查栏「每次展开都多一个 New tab」去重（2.2.2 上游行为）
//
// 现象：右上角「切换审查」展开时，上游会往标签栏 push 一个 New tab；如果里面已经有
// 一个 New tab（或根本没有 tab），每展开一次就多一个，反复开合会堆出一排「New tab」。
// 关闭「空页折叠」后仍然复现 → 不是我们别处补丁引起，是上游逻辑：
// 展开时只判断「有没有可用的内容 tab」，不判断「是否已经有一个空白 tab」。
//
// 修法：不碰上游的创建逻辑，只在事后把多余的空白标签收掉 —— 保留当前选中的那个
// （没有选中就保留第一个），其余点掉。内容 tab 一律不动。
(function () {
  if (globalThis.__ocPaneTabsBoot$) return;
  globalThis.__ocPaneTabsBoot$ = 1;
  if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('pane-tabs')) return;

  var PANEL = '#review-panel';
  var LIST = '[role=tablist]';
  var TAB = '[role=tab]';
  var CLOSE = '[aria-label="关闭标签页"]';
  var BLANK = 'New tab';

  function groups() {
    var p = document.querySelector(PANEL);
    var out = [];
    if (!p) return out;
    var lists = p.querySelectorAll(LIST);
    for (var i = 0; i < lists.length; i++) {
      var ch = lists[i].children;
      for (var j = 0; j < ch.length; j++) {
        // 只认「一格 = 一个标签」的容器，最后一个 sticky 的「添加标签页」没有 role=tab
        if (ch[j].querySelector && ch[j].querySelector(TAB)) out.push(ch[j]);
      }
    }
    return out;
  }

  function blanks() {
    return groups().filter(function (g) {
      var t = g.querySelector(TAB);
      return t && (t.textContent || '').trim() === BLANK;
    });
  }

  function dedupe() {
    var list = blanks();
    if (list.length < 2) return;
    var keep = null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i].querySelector(TAB);
      if (t && t.getAttribute('aria-selected') === 'true') { keep = list[i]; break; }
    }
    if (!keep) keep = list[0];
    for (var k = 0; k < list.length; k++) {
      if (list[k] === keep) continue;
      var btn = list[k].querySelector(CLOSE);
      if (btn) { try { btn.click(); } catch (e) { } }
    }
  }

  var last = 0;
  function schedule() {
    var now = Date.now();
    if (now - last < 200) return;
    last = now;
    dedupe();
  }

  try { document.documentElement.setAttribute('data-oc-pane-tabs', '1'); } catch (e) { }

  // 展开的一瞬间标签是「先出现再挂上内容」，用 observer + 轮询双保险
  var mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true });
  setInterval(schedule, 600);
  setTimeout(schedule, 400);
})();
