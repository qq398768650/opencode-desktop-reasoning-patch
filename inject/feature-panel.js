/* 功能开关条 —— 顶部标题栏正中的一排滑块，逐个开关本仓库的四/五组补丁
 *
 * 为什么要有它：这些补丁是直接改 asar 的字符串替换，打进包里就常驻，
 * 想临时关掉某一项（比如嫌统计行碍眼、嫌删除按钮误触）只能重打一遍。
 * 这里把每项功能做成运行时开关，值存 localStorage，切换后 reload 一次生效。
 *
 * 存储约定（缺省 = 开，只有显式 '0' 才是关，这样没动过的人行为和以前一样）：
 *   localStorage['oc-feat:home-delete'] = '0' | '1'
 *   localStorage['oc-feat:time']        = '0' | '1'
 *   localStorage['oc-feat:reveal']      = '0' | '1'
 *   localStorage['oc-feat:workfold']    = '0' | '1'
 *   localStorage['oc-feat:reason-dbl']  = '0' | '1'
 *   localStorage['oc-feat:width']       = '0' | '1'
 *
 * 其他模块统一用 globalThis.__ocFeatOn$(key) 判断，别自己读 localStorage
 * （这里处理了 localStorage 被禁/私密模式的异常）。
 */
(function () {
  try {
    if (typeof document === 'undefined') return;
    if (globalThis.__ocFeatBarBoot$) return;
    globalThis.__ocFeatBarBoot$ = 1;

    var PREFIX = 'oc-feat:';

    // 各模块用的读开关函数：没有这一层的话，模块自己 try/catch 会把代码写得很脏
    globalThis.__ocFeatOn$ = function (key) {
      try { return localStorage.getItem(PREFIX + key) !== '0'; } catch (e) { return true; }
    };
    globalThis.__ocFeatSet$ = function (key, on) {
      try { localStorage.setItem(PREFIX + key, on ? '1' : '0'); } catch (e) {}
    };

    var ITEMS = [
      ['home-delete', '删除按钮'],
      ['time', '时间用量'],
      ['reveal', '文件定位'],
      ['workfold', '工作中展开'],
      ['reason-dbl', '双击思考'],
      ['width', '正文宽度']
    ];
    // --skip 掉的功能不注入代码，开关留在条上就是个按了没反应的死按钮
    if (globalThis.__ocFeatAvail$ && globalThis.__ocFeatAvail$.length) {
      var avail = globalThis.__ocFeatAvail$;
      ITEMS = ITEMS.filter(function (x) { return avail.indexOf(x[0]) >= 0; });
    }

    var CSS_ID = 'oc-feat-bar-css';
    function css() {
      if (document.getElementById(CSS_ID)) return;
      var s = document.createElement('style');
      s.id = CSS_ID;
      s.textContent = [
        '[data-oc-feat-bar]{position:absolute;left:50%;top:0;height:100%;transform:translateX(-50%);',
        'display:flex;align-items:center;gap:14px;pointer-events:auto;',
        '-webkit-app-region:no-drag;z-index:30;opacity:.62;transition:opacity .15s}',
        '[data-oc-feat-bar]:hover{opacity:1}',
        // 「Top tabs」布局（标题栏里是浏览器式标签）时，标题栏中间被标签占满，
        // 开关条改成贴左侧边缘、竖向排列（垂直居中），别去挤标签
        '[data-oc-feat-bar][data-oc-feat-vert]{position:fixed;left:8px;top:50%;height:auto;',
        'transform:translateY(-50%);flex-direction:column;align-items:flex-start;gap:2px;',
        'padding:6px 8px;border-radius:10px;background:rgba(24,24,27,.72);backdrop-filter:blur(8px);',
        'box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:40;opacity:.45}',
        '[data-oc-feat-bar][data-oc-feat-vert]:hover{opacity:1}',
        '[data-oc-feat-bar][data-oc-feat-vert] [data-oc-feat]{width:100%}',
        '[data-oc-feat-bar][data-oc-feat-vert] [data-oc-feat] .l{font-size:10px}',
        '[data-oc-feat]{display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
        'font-size:11px;line-height:1;color:inherit;background:none;border:0;padding:2px 4px;',
        'border-radius:6px;white-space:nowrap;font-family:inherit}',
        '[data-oc-feat]:hover{background:rgba(127,127,127,.14)}',
        '[data-oc-feat] .t{position:relative;display:inline-block;width:26px;height:14px;border-radius:999px;',
        'background:rgba(127,127,127,.32);transition:background .15s;flex:none}',
        '[data-oc-feat] .k{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:999px;',
        'background:#fff;transition:transform .15s}',
        '[data-oc-feat][aria-checked="true"] .t{background:#6366f1}',
        '[data-oc-feat][aria-checked="true"] .k{transform:translateX(12px)}',
        '[data-oc-feat] .l{opacity:.75}',
        '[data-oc-feat][aria-checked="true"] .l{opacity:.95}'
      ].join('');
      (document.head || document.documentElement).appendChild(s);
    }

    // 判断当前是不是「Top tabs」布局（这个设置不存在 localStorage / IndexedDB / opencode.settings，
    // 只能按 DOM 判）：顶部标签模式下标签直接长在标题栏里（侧栏里没有 tab-link）；
    // 侧栏模式反过来 —— 标题栏没有标签、但 [data-slot=vertical-tabs-sidebar] 在；
    // Inbox（实验性）用 [data-slot=sidebar-inbox] 当左侧列表，同样不算顶部模式。
    // 两个特征都取不到时按「顶部模式」处理（宁可竖排，也不要横条压在标签上）。
    function isTopTabs() {
      try {
        var header = document.querySelector('[data-slot="titlebar-v2"]');
        if (!header) return false;
        if (header.querySelector('[data-slot="tab-link"],[data-slot="titlebar-tab-item"]')) return true;
        if (document.querySelector('[data-slot="vertical-tabs-sidebar"]')) return false;
        if (document.querySelector('[data-slot="sidebar-inbox"]')) return false;
        return true;
      } catch (e) { return false; }
    }

    function applyLayout(bar) {
      if (!bar) return;
      if (isTopTabs()) bar.setAttribute('data-oc-feat-vert', '');
      else bar.removeAttribute('data-oc-feat-vert');
    }

    function build() {
      css();
      var header = document.querySelector('[data-slot="titlebar-v2"]');
      if (!header) return null;
      var old = document.querySelector('[data-oc-feat-bar]');
      if (old && header.contains(old)) return old;
      if (old) old.remove();

      var bar = document.createElement('div');
      bar.setAttribute('data-oc-feat-bar', '');
      for (var i = 0; i < ITEMS.length; i++) {
        var key = ITEMS[i][0], label = ITEMS[i][1];
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-oc-feat', key);
        b.setAttribute('aria-checked', globalThis.__ocFeatOn$(key) ? 'true' : 'false');
        b.title = label + (globalThis.__ocFeatOn$(key) ? '：开（点击关闭，会重载界面）' : '：关（点击开启，会重载界面）');
        var t = document.createElement('span');
        t.className = 't';
        var k = document.createElement('span');
        k.className = 'k';
        t.appendChild(k);
        var l = document.createElement('span');
        l.className = 'l';
        l.textContent = label;
        b.appendChild(t);
        b.appendChild(l);
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var k2 = this.getAttribute('data-oc-feat');
          var next = !globalThis.__ocFeatOn$(k2);
          globalThis.__ocFeatSet$(k2, next);
          this.setAttribute('aria-checked', next ? 'true' : 'false');
          this.title = ITEMS.filter(function (x) { return x[0] === k2; }).map(function (x) { return x[1]; })[0] +
            (next ? '：开（点击关闭，会重载界面）' : '：关（点击开启，会重载界面）');
          // 开关要立刻把这条功能装上/卸下：注入模块在启动时读一次开关，
          // React 那几处（删除按钮的图标/文案/行为）也只在渲染时读，
          // 所以统一靠 reload 重新走一遍初始化，比逐模块写热插拔可靠得多。
          setTimeout(function () { try { location.reload(); } catch (e) {} }, 90);
        });
        bar.appendChild(b);
      }
      header.appendChild(bar);
      applyLayout(bar);
      return bar;
    }

    build();

    var timer = setInterval(function () {
      var bar = build();
      if (!bar) return;
      // 布局模式（Top tabs / 侧栏）切换后要立刻跟着换位置
      applyLayout(bar);
      // 标题栏被 React 重建时把条子补回去
      for (var i = 0; i < ITEMS.length; i++) {
        var el = bar.querySelector('[data-oc-feat="' + ITEMS[i][0] + '"]');
        if (el) el.setAttribute('aria-checked', globalThis.__ocFeatOn$(ITEMS[i][0]) ? 'true' : 'false');
      }
    }, 1500);
    globalThis.__ocFeatTimer$ = timer;
  } catch (e) {}
})();
