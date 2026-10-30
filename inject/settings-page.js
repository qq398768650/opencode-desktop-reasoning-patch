/* 设置页里的「桌面端补丁」页面 —— 把顶部标题栏那排开关搬进设置
 *
 * 为什么这么做：标题栏正中那排开关在窄窗口/Top tabs 布局下会挤压标签，而且
 * 它们是"常驻 UI"，不该一直占着主界面。搬进设置页后，主界面干净了，开关仍在。
 *
 * 实现方式（纯 DOM 注入，不改上游组件树）：
 *   - 在 .settings-sidebar 里插一个 role=tab 的按钮，data-value="oc-plugin"
 *   - 面板不走 Solid 的 tabpanel（那个是渲染期创建的，插进去会被冲掉），
 *     而是在 .settings 上叠一个 absolute 的层，切换时显示/隐藏
 *   - 点任意原生 tab 就收起我们的层，让 Kobalte 正常切 tab
 *   - Solid 重渲染会把我们插的按钮冲掉，所以用 MutationObserver 补回
 *
 * 开关值仍然走 localStorage['oc-feat:<key>']，和 feature-panel.js 共用 __ocFeatOn$。
 */
(function () {
  try {
    if (typeof document === 'undefined') return;
    if (globalThis.__ocSettingsPageBoot$) return;
    globalThis.__ocSettingsPageBoot$ = 1;

    var ON$ = globalThis.__ocFeatOn$;
    var SET$ = globalThis.__ocFeatSet$;
    if (typeof ON$ !== 'function' || typeof SET$ !== 'function') return;

    var PAGE_NAME = '桌面端补丁';

    // 分组：键、标题、一句话
    var GROUPS = [
      ['home', '首页与会话', '会话列表上的东西'],
      ['read', '阅读与消息', '看对话时的显示方式'],
      ['fix', '点击与文件', '交互和文件跳转'],
      ['ui', '界面', '主界面外观']
    ];

    // 键、名称、说明、分组 —— 说明里讲人话，别写成配置项名词
    var ITEMS = [
      ['home-delete', '会话删除按钮', '首页每个会话行悬停时出现垃圾桶，Shift+点击跳过确认框。', 'home'],
      ['session-pin', '会话置顶', '首页会话右键菜单里多一项"置顶"，置顶的排在最前。', 'home'],
      ['time', '时间与用量', '助手回复下方显示用量 token、完成时间，以及输入框上方的统计。', 'read'],
      ['workfold', '工作中展开', '把"工作中"那段执行步骤默认展开，不用每次手动点。', 'read'],
      ['reason-fold', '执行卡默认收起', '跑命令的工具卡默认折起，点开才看参数和输出；思考和汇总组保持原样。', 'read'],
      ['reason-dbl', '双击折叠思考', '双击思考块标题可以手风琴式展开/收起。', 'read'],
      ['width', '正文宽度', '放宽消息正文的最大宽度，长代码行少折行。', 'read'],
      ['click-fix', '点击丢失兜底', '按下和抬起之间节点被重建时，补一次 click，救 x 和折叠按钮。', 'fix'],
      ['reveal', '文件定位', 'Ctrl+左键点击正文里的文件路径，在资源管理器里选中该文件。', 'fix'],
      ['pane-fold', '空页自动折叠', '关掉审查栏里最后一个标签页时，自动收起整个右侧栏。', 'ui'],
      ['bar', '顶部快捷条', '在标题栏中间那排小开关。默认关，开关都在这页里；想要快捷条再打开。', 'ui']
    ];
    // --skip 掉的功能没注入代码，别在设置里留一个按了没反应的开关
    if (globalThis.__ocFeatAvail$ && globalThis.__ocFeatAvail$.length) {
      var okKeys = globalThis.__ocFeatAvail$.concat(['bar']);
      ITEMS = ITEMS.filter(function (x) { return okKeys.indexOf(x[0]) >= 0; });
    }

    var CSS_ID = 'oc-settings-page-css';
    function css() {
      if (document.getElementById(CSS_ID)) return;
      var s = document.createElement('style');
      s.id = CSS_ID;
      s.textContent = [
        '[data-oc-settings-tab]{display:flex;align-items:center;gap:8px;width:100%;',
        'height:28px;padding:0 8px;border:0;border-radius:6px;background:none;',
        'color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer;opacity:.75}',
        '[data-oc-settings-tab]:hover{background:rgba(127,127,127,.12);opacity:1}',
        '[data-oc-settings-tab][data-oc-active="1"]{background:rgba(127,127,127,.16);opacity:1}',
        '[data-oc-settings-tab] .dot{width:6px;height:6px;border-radius:999px;background:#6366f1;flex:none}',
        // 只盖右侧内容区，左侧导航要留着（left 由 showOurs() 按 sidebar 实际宽度写）
        '[data-oc-settings-panel]{position:absolute;top:0;right:0;bottom:0;left:260px;z-index:6;overflow:auto;display:none;',
        'padding:26px 34px 40px;background:var(--v2-background-bg-base,#0b0b0c);color:inherit}',
        '[data-oc-settings-panel] h2{margin:0 0 6px;font-size:15px;font-weight:600}',
        '[data-oc-settings-panel] .desc{margin:0 0 22px;font-size:12px;opacity:.6;line-height:1.6}',
        '[data-oc-settings-panel] .row{display:flex;align-items:flex-start;gap:16px;',
        'padding:14px 0;border-top:1px solid rgba(127,127,127,.16)}',
        '[data-oc-settings-panel] .row:first-of-type{border-top:0}',
        '[data-oc-settings-panel] .grp{margin-top:20px}',
        '[data-oc-settings-panel] .grp-hd{display:flex;align-items:center;gap:7px;width:100%;',
        'padding:6px 0;border:0;background:none;color:inherit;font:inherit;font-size:12px;',
        'font-weight:600;letter-spacing:.02em;opacity:.55;cursor:pointer;text-align:left}',
        '[data-oc-settings-panel] .grp-hd:hover{opacity:.9}',
        '[data-oc-settings-panel] .grp-hd .caret{display:inline-block;font-size:9px;line-height:1;',
        'transition:transform .15s;transform:rotate(90deg)}',
        '[data-oc-settings-panel] .grp[data-oc-collapsed="1"] .grp-hd .caret{transform:rotate(0deg)}',
        '[data-oc-settings-panel] .grp[data-oc-collapsed="1"] .grp-bd{display:none}',
        '[data-oc-settings-panel] .grp-hd .cnt{margin-left:auto;font-weight:400;font-size:11px;opacity:.75}',
        '[data-oc-settings-panel] .grp-bd{padding-left:2px}',
        // 我们激活时，把原生 tab 的选中底纹压掉（选中态在 wrapper 上，靠 [data-selected] 上色）
        '.settings-sidebar[data-oc-ours="1"] [data-slot="tabs-v2-trigger-wrapper"]{background:transparent !important}',
        '[data-oc-settings-panel] .meta{flex:1;min-width:0}',
        '[data-oc-settings-panel] .name{font-size:13px;line-height:20px}',
        '[data-oc-settings-panel] .note{margin-top:3px;font-size:11.5px;line-height:1.55;opacity:.52}',
        '[data-oc-settings-panel] .sw{flex:none;margin-top:2px;width:34px;height:18px;border-radius:999px;',
        'border:0;padding:0;cursor:pointer;background:rgba(127,127,127,.32);position:relative;',
        'transition:background .15s}',
        '[data-oc-settings-panel] .sw i{position:absolute;top:2px;left:2px;width:14px;height:14px;',
        'border-radius:999px;background:#fff;transition:transform .15s;display:block}',
        '[data-oc-settings-panel] .sw[aria-checked="true"]{background:#6366f1}',
        '[data-oc-settings-panel] .sw[aria-checked="true"] i{transform:translateX(16px)}',
        '[data-oc-settings-panel] .foot{margin-top:26px;font-size:11.5px;opacity:.5}',
        '[data-oc-settings-panel] .reload{margin-left:8px;padding:4px 10px;border-radius:6px;',
        'border:1px solid rgba(127,127,127,.35);background:none;color:inherit;font:inherit;',
        'font-size:11.5px;cursor:pointer}',
        '[data-oc-settings-panel] .reload:hover{background:rgba(127,127,127,.14)}',
        '[data-oc-hide-native]>*{display:none !important}'
      ].join('\n');
      document.head.appendChild(s);
    }

    var panel = null;
    var tabBtn = null;
    var active = false;

    function avail(key) {
      if (key === 'bar') return true; // 快捷条不是注入模块，永远可开关
      var a = globalThis.__ocFeatAvail$;
      return !a || !a.length || a.indexOf(key) >= 0;
    }

    function buildPanel() {
      var d = document.createElement('div');
      d.setAttribute('data-oc-settings-panel', '1');
      d.style.display = 'none';

      var h = document.createElement('h2');
      h.textContent = PAGE_NAME;
      d.appendChild(h);

      var p = document.createElement('p');
      p.className = 'desc';
      p.textContent = '这些补丁直接改在应用包上，不是官方插件。开关只影响界面，随时可关；切换后需要重载界面一次才生效。';
      d.appendChild(p);

      var FOLD_PREFIX = 'oc-set-fold:';
      // 默认展开；只有明确收起过（记 '1'）才收起
      function isCollapsed(g) {
        try { return localStorage.getItem(FOLD_PREFIX + g) === '1'; } catch (e) { return false; }
      }

      GROUPS.forEach(function (g) {
        var items = ITEMS.filter(function (x) { return x[3] === g[0] && avail(x[0]); });
        if (!items.length) return;

        var sec = document.createElement('section');
        sec.className = 'grp';
        sec.setAttribute('data-oc-group', g[0]);
        if (isCollapsed(g[0])) sec.setAttribute('data-oc-collapsed', '1');

        var hd = document.createElement('button');
        hd.type = 'button';
        hd.className = 'grp-hd';
        hd.setAttribute('aria-expanded', isCollapsed(g[0]) ? 'false' : 'true');
        if (g[2]) hd.title = g[2];
        var caret = document.createElement('span');
        caret.className = 'caret';
        caret.textContent = '▶';
        hd.appendChild(caret);
        hd.appendChild(document.createTextNode(g[1]));
        var cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = items.length + ' 项';
        hd.appendChild(cnt);
        hd.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var next = sec.getAttribute('data-oc-collapsed') !== '1';
          if (next) sec.setAttribute('data-oc-collapsed', '1');
          else sec.removeAttribute('data-oc-collapsed');
          hd.setAttribute('aria-expanded', next ? 'false' : 'true');
          try { localStorage.setItem(FOLD_PREFIX + g[0], next ? '1' : '0'); } catch (err) {}
        });
        sec.appendChild(hd);

        var bd = document.createElement('div');
        bd.className = 'grp-bd';

        items.forEach(function (it) {
          var row = document.createElement('div');
          row.className = 'row';

          var meta = document.createElement('div');
          meta.className = 'meta';
          var name = document.createElement('div');
          name.className = 'name';
          name.textContent = it[1];
          var note = document.createElement('div');
          note.className = 'note';
          note.textContent = it[2];
          meta.appendChild(name);
          meta.appendChild(note);

          var sw = document.createElement('button');
          sw.className = 'sw';
          sw.setAttribute('role', 'switch');
          sw.setAttribute('aria-checked', ON$(it[0]) ? 'true' : 'false');
          sw.setAttribute('aria-label', it[1]);
          sw.appendChild(document.createElement('i'));
          sw.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var next = sw.getAttribute('aria-checked') !== 'true';
            sw.setAttribute('aria-checked', next ? 'true' : 'false');
            SET$(it[0], next);
          });

          row.appendChild(meta);
          row.appendChild(sw);
          bd.appendChild(row);
        });

        sec.appendChild(bd);
        d.appendChild(sec);
      });

      var foot = document.createElement('div');
      foot.className = 'foot';
      foot.appendChild(document.createTextNode('改完点这里重载界面：'));
      var btn = document.createElement('button');
      btn.className = 'reload';
      btn.textContent = '重载界面';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        location.reload();
      });
      foot.appendChild(btn);
      d.appendChild(foot);

      return d;
    }

    function contentEl() {
      var s = document.querySelector('.settings');
      return s && s.querySelector('.settings-content');
    }

    function showOurs() {
      var s = document.querySelector('.settings');
      if (!s) return;
      css();
      if (!panel || !s.contains(panel)) {
        panel = buildPanel();
        s.appendChild(panel);
      }
      // 让出左侧导航：量一下 sidebar 实际宽度，窗口缩放也跟着走
      s.style.position = 'relative';
      var sb = s.querySelector('.settings-sidebar');
      var w = sb ? Math.round(sb.getBoundingClientRect().width) : 0;
      panel.style.left = (w || 260) + 'px';
      panel.style.display = 'block';
      active = true;
      var c = contentEl();
      if (c) c.setAttribute('data-oc-hide-native', '1');
      var sbEl = s.querySelector('.settings-sidebar');
      if (sbEl) sbEl.setAttribute('data-oc-ours', '1');
      markTab();
    }

    function hideOurs() {
      if (panel) panel.style.display = 'none';
      active = false;
      var c = contentEl();
      if (c) c.removeAttribute('data-oc-hide-native');
      var sbEl = document.querySelector('.settings .settings-sidebar');
      if (sbEl) sbEl.removeAttribute('data-oc-ours');
      markTab();
    }

    function markTab() {
      if (tabBtn) tabBtn.setAttribute('data-oc-active', active ? '1' : '0');
      // 原生 tab 的选中态也一并清掉，否则两个都亮着
      if (active) {
        [].forEach.call(document.querySelectorAll('.settings-sidebar [role=tab]'), function (t) {
          t.setAttribute('aria-selected', 'false');
        });
        if (tabBtn) tabBtn.setAttribute('aria-selected', 'true');
      }
    }

    function buildTab() {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('data-oc-settings-tab', '1');
      b.setAttribute('data-value', 'oc-plugin');
      b.setAttribute('data-slot', 'tabs-v2-trigger');
      b.setAttribute('data-orientation', 'vertical');
      b.tabIndex = -1;
      var inner = document.createElement('span');
      inner.className = 'inline-flex items-center gap-2';
      inner.setAttribute('data-slot', 'tabs-v2-trigger-content');
      var dot = document.createElement('span');
      dot.className = 'dot';
      inner.appendChild(dot);
      inner.appendChild(document.createTextNode(PAGE_NAME));
      b.appendChild(inner);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (active) { hideOurs(); return; }
        showOurs();
      });
      return b;
    }

    function ensureTab() {
      var sb = document.querySelector('.settings .settings-sidebar');
      if (!sb) return;
      var exist = sb.querySelector('[data-oc-settings-tab]');
      if (exist) {
        tabBtn = exist;
        if (active) markTab();
        return;
      }
      tabBtn = buildTab();
      // 排在「关于」之后，最不容易和原生项混
      var tabs = sb.querySelectorAll('[role=tab]');
      var last = tabs.length ? tabs[tabs.length - 1] : null;
      if (last && last.parentElement === sb) sb.insertBefore(tabBtn, last.nextSibling);
      else sb.appendChild(tabBtn);
      if (active) markTab();
    }

    // 点原生 tab 就收起我们的层
    document.addEventListener('click', function (e) {
      if (!active) return;
      var t = e.target && e.target.closest ? e.target.closest('[role=tab]') : null;
      if (!t) return;
      if (t.hasAttribute('data-oc-settings-tab')) return;
      hideOurs();
    }, true);

    // 离开设置页再回来时，active 状态作废，别把新界面盖住
    var mo = new MutationObserver(function () {
      css();
      if (!document.querySelector('.settings')) {
        if (active) { active = false; panel = null; tabBtn = null; }
        return;
      }
      ensureTab();
      if (active && panel && !panel.isConnected) {
        var s = document.querySelector('.settings');
        // 别把上一代实例残留的 panel 又插回去
        if (s && !s.querySelector('[data-oc-settings-panel]')) s.appendChild(panel);
        else { active = false; panel = null; }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    function boot() {
      css();
      ensureTab();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } catch (e) {}
})();
