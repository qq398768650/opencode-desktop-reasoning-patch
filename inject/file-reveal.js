(function () {
  try {
    if (globalThis.__ocFileBoot$) return;
    // 顶部功能条的总开关（inject/feature-panel.js）；没有那层时缺省开
    if (globalThis.__ocFeatOn$ && !globalThis.__ocFeatOn$('reveal')) return;
    globalThis.__ocFileBoot$ = !0;

    var DIR = null;          // 当前会话工作目录（缓存，与 DIR_SID 绑定）
    var DIR_SID = null;      // 上面这个 DIR 属于哪个会话
    var DIR_P = null;        // 进行中的查询
    var DIR_P_SID = null;    // 进行中查询对应的 sid

    function base() {
      var n = performance.getEntriesByType("resource"), i, u, m;
      for (i = n.length - 1; i >= 0; i--) {
        u = n[i].name;
        m = /^(http:\/\/127\.0\.0\.1:\d+)\//.exec(u);
        if (m) return m[1];
      }
      return null;
    }

    function sidNow() {
      var k, v, m;
      for (k in localStorage) {
        if (k.indexOf("last-active-url") >= 0) {
          v = localStorage.getItem(k) || "";
          m = v.match(/session\/(ses_[A-Za-z0-9]+)/);
          if (m) return m[1];
        }
      }
      return null;
    }

    // 目录来源：① 首页行映射里当前 sid 那条（快、准） ② 后端 /api/session/<sid>（准）
    // 绝不「随便取首页第一条」——切会话后 DIR 会串到别的项目，表现为「点了没反应」。
    // 缓存与 sid 绑定，切会话自动失效。
    function ensureDir() {
      var sid = sidNow();
      if (DIR && DIR_SID === sid) return Promise.resolve(DIR);
      if (DIR_P && DIR_P_SID === sid) return DIR_P;
      DIR_P_SID = sid;
      DIR_P = new Promise(function (res) {
        try {
          var map = globalThis.__ocRowMap$;
          if (map && map.get && sid) {
            var row = map.get(sid), s = row && row.session;
            if (s && s.location && s.location.directory) { DIR = s.location.directory; DIR_SID = sid; return res(DIR); }
          }
          var b = base();
          if (!b || !sid) return res(null);
          fetch(b + "/api/session/" + sid)
            .then(function (r) { return r.json(); })
            .then(function (j) {
              var d = j && (j.data || j);
              var loc = d && d.location;
              DIR = (loc && loc.directory) || d.directory || null;
              DIR_SID = DIR ? sid : null;
              res(DIR);
            })
            .catch(function () { res(null); });
        } catch (e) { res(null); }
      });
      return DIR_P;
    }

    function clean(p) {
      return String(p || "").trim()
        .replace(/^[`"'(<\[]+/, "")
        .replace(/[`"')>\].,;]+$/, "");
    }

    function absPath(p, dir) {
      p = clean(p);
      if (!p) return null;
      var q = p.replace(/(?::\d+){1,2}$/, "");     // 去掉 :12 / :12:3 行号（盘符 C: 不受影响）
      if (/^[A-Za-z]:[\\/]/.test(q)) return q;
      if (/^\\\\/.test(q)) return q;
      if (/^\//.test(q)) return q;
      if (!dir) return null;
      return dir.replace(/[\\/]+$/, "") + "\\" + q.replace(/^[\\/]+/, "");
    }

    // 点击位置的文本里，找出包含该偏移的那个「路径 token」
    var RE = /[A-Za-z]:[\\/][^\s"'<>|*?\n]+|(?:[\w.@~-]+[\\/])+[\w.@~-]+(?:\.[\w]{1,8})?|[\w.@~-]+\.[A-Za-z0-9]{1,8}/g;

    function tokenAt(node, off) {
      var s = node.nodeValue || "", m;
      RE.lastIndex = 0;
      while ((m = RE.exec(s))) {
        var a = m.index, b = a + m[0].length;
        if (off >= a && off <= b) return m[0];
        if (a > off) break;
      }
      return null;
    }

    function reveal(p) {
      if (p.indexOf("://") >= 0) return Promise.resolve(!1);
      var raw = clean(p).replace(/(?::\d+){1,2}$/, "");
      return ensureDir().then(function (dir) {
        var abs = absPath(p, dir);
        if (!abs) return !1;
        // 相对路径要交给主进程在「会话目录 + 各项目目录」里再找一遍（会话目录不一定就是文件所在仓库）
        var rel = /^([A-Za-z]:[\\/]|\\\\|\/)/.test(raw) ? "" : raw;
        var dirs = [];
        try {
          var m = globalThis.__ocRowMap$;
          if (m && m.forEach) {
            m.forEach(function (v) {
              var s = v && v.session, d = s && s.location && s.location.directory;
              if (d && dirs.indexOf(d) < 0) dirs.push(d);
            });
          }
        } catch (e) { }
        try {
          if (window.electron && typeof window.electron.revealPath === "function") {
            window.electron.revealPath({ path: abs, dir: dir || "", rel: rel, dirs: dirs.slice(0, 16) });
            return !0;
          }
        } catch (e) { }
        return !1;
      });
    }

    // 悬停：Ctrl 按着且指到路径上时给手型，避免误以为点了没反应
    document.addEventListener("mousemove", function (ev) {
      if (!ev.ctrlKey) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var hit = t.closest('[data-slot="apply-patch-filename"]');
      if (!hit) {
        var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(ev.clientX, ev.clientY) : null;
        if (r && r.startContainer && r.startContainer.nodeType === 3 && tokenAt(r.startContainer, r.startOffset)) {
          hit = r.startContainer.parentElement;
        }
      }
      document.documentElement.style.cursor = hit ? "pointer" : "";
    }, !0);

    document.addEventListener("click", function (ev) {
      if (!ev.ctrlKey || ev.button !== 0) return;
      var t = ev.target;
      if (!t || !t.closest) return;

      var p = null;
      // ① 编辑文件卡片（apply patch / write）——只显示文件名，交给主进程去找同名文件
      var fnEl = t.closest('[data-slot="apply-patch-filename"]');
      if (fnEl) p = (fnEl.textContent || "").trim();

      // ② 正文里的磁盘路径：按点击位置取 token
      if (!p) {
        var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(ev.clientX, ev.clientY) : null;
        if (r && r.startContainer && r.startContainer.nodeType === 3) p = tokenAt(r.startContainer, r.startOffset);
      }

      // ③ 兜底：整块文本就是一条路径（如单独的 code 行）
      if (!p) {
        var el = t.closest('[data-slot="text-part"] code, code');
        if (el) {
          var txt = (el.textContent || "").trim();
          if (txt && txt.length < 300) p = txt;
        }
      }
      if (!p) return;
      if (p.indexOf("://") >= 0) return;      // 网页链接不接管

      ev.preventDefault();
      ev.stopPropagation();
      reveal(p);
    }, !0);
  } catch (e) { }
})()
