/* 时间 / 用量 / 速度 / 会话统计 —— 参照 dsh 的信息布局
 *
 * 1) 每条助手回复的 meta 行右侧：`用量 4.1M tok   10月15日 18:45`
 *    - 用量可点开，弹出本轮明细（模型 / 缓存命中 / 各类 token）
 *    - 时间格式跟 dsh 一致：今天 `HH:MM`，同年 `M月D日 HH:MM`，跨年带年份
 * 2) 输入框下方一行会话统计（居中）：`⟳ 10 轮 97 步 · 235 tok/s` / `▤ 18.5M tok · 缓存命中 95%` / `(圆环) 38%`
 * 3) tok/s 只有这一个位置（不再挂在发送按钮旁）：流式中显示 2.5s 滑窗实时值，
 *    流式结束后落回平均速度 Σoutput / Σ(completed - created)，分母只算有正文的模型步
 *    （opencode 的 message.time 没有「首 token」时间戳，streamed 是最后一次流式更新，
 *     所以拿不到 dsh 那种纯 decode 时间，只能整步墙钟近似）
 *
 * 数据全部来自页面内 fetch（Node 直连后端 401，只有页面带认证）。
 */
(function () {
  try {
    if (typeof document === 'undefined') return;
    if (globalThis.__ocTimeBoot$ && globalThis.__ocSpeedBoot$) return;
    globalThis.__ocTimeBoot$ = 1;
    globalThis.__ocSpeedBoot$ = 1;

    var p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
    var hm = function (ts) { var d = new Date(ts); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };

    // dsh 的 formatMessageClock：今天只给时间，同年给月日，跨年带年份
    var fmtClock = function (ts) {
      if (!ts) return '';
      var d = new Date(ts), n = new Date();
      if (d.toDateString() === n.toDateString()) return hm(ts);
      var s = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      if (d.getFullYear() !== n.getFullYear()) s = d.getFullYear() + '年' + s;
      return s + ' ' + hm(ts);
    };

    // dsh 的 formatTokens：<1k 原样，<1M 用 K，否则 M；>=100 取整，否则一位小数
    var fmtTok = function (v) {
      v = Math.max(0, v || 0);
      if (v < 1000) return String(v);
      var sc = function (x) { return x >= 100 ? String(Math.round(x)) : String(Math.round(x * 10) / 10); };
      return v < 1e6 ? sc(v / 1000) + 'K' : sc(v / 1e6) + 'M';
    };

    var apiBase = function () {
      var es = performance.getEntriesByType('resource');
      for (var i = es.length - 1; i >= 0; i--) {
        var u = es[i].name, k = u.indexOf('/api/');
        if (k > 0 && /^https?:/.test(u)) return u.slice(0, k);
      }
      return '';
    };

    var M = globalThis.__ocMsgTime$ || (globalThis.__ocMsgTime$ = new Map());
    // msgId → 所属会话：DOM 里渲染的 data-timeline-part-id 能反查「用户此刻到底在看哪个会话」，
    // localStorage / performance 资源都会滞后（实测切 tab 3 秒后仍指着上一个会话）
    var OWN = globalThis.__ocMsgOwner$ || (globalThis.__ocMsgOwner$ = new Map());
    var ST = globalThis.__ocStats$ || (globalThis.__ocStats$ = {});
    var SID = globalThis.__ocMsgSid$ || (globalThis.__ocMsgSid$ = { lastTry: 0 });
    var BUSY = {};

    var cands = function () {
      var out = [], seen = {}, i;
      var es = performance.getEntriesByType('resource');
      for (i = es.length - 1; i >= 0; i--) {
        var u = es[i].name, k = u.indexOf('/api/session/');
        if (k < 0) continue;
        var rest = u.slice(k + 13), j = rest.indexOf('/');
        var id = j < 0 ? rest : rest.slice(0, j);
        if (id.indexOf('ses_') === 0 && !seen[id]) { seen[id] = 1; out.push(id); }
      }
      var ts = document.querySelectorAll('[data-tab-key]');
      for (i = 0; i < ts.length; i++) {
        var key = ts[i].getAttribute('data-tab-key') || '';
        var k2 = key.indexOf('/session/ses_');
        if (k2 < 0) continue;
        var id2 = key.slice(k2 + 9).split('/')[0];
        if (id2.indexOf('ses_') === 0 && !seen[id2]) { seen[id2] = 1; out.push(id2); }
      }
      return out;
    };

    var loadSid = function (sid, then) {
      if (!sid || BUSY[sid]) return;
      var b = apiBase(); if (!b) return;
      BUSY[sid] = 1;
      // limit 必须显式给：默认只返回最后 50 条，长会话的 user 消息全被截掉 → 「⟳ 0 轮 45 步」、上下文/速度也跟着偏；
      // 200 是服务端上限（250 起返回 400），实测 120 条的会话能全量拿到
      fetch(b + '/api/session/' + sid + '/message?limit=200').then(function (r) { return r.json(); }).then(function (j) {
        var a = Array.isArray(j) ? j : ((j && (j.data || j.messages)) || []);
        var turns = 0, steps = 0, oTok = 0, decMs = 0, llmMs = 0, lastCtx = 0, firstAt = 0, lastAt = 0;
        var txtCh = 0, toolCh = 0;
        for (var i = 0; i < a.length; i++) {
          var m = a[i];
          if (!m || !m.id || !m.time) continue;
          if (m.time.created && (!firstAt || m.time.created < firstAt)) firstAt = m.time.created;
          if (m.time.completed && m.time.completed > lastAt) lastAt = m.time.completed;
          var ch = 0;
          if (m.content) for (var q = 0; q < m.content.length; q++) {
            var pp = m.content[q];
            if (!pp) continue;
            if (pp.type === 'text' || pp.type === 'reasoning') { ch += (pp.text || '').length; continue; }
            // 工具结果也要算进上下文：tool part 的入参 + 输出（state.content 数组或 state.output 字符串）
            if (pp.type === 'tool') {
              var stt = pp.state || {};
              if (stt.input) { try { toolCh += JSON.stringify(stt.input).length; } catch (e) { } }
              var cc = stt.content;
              if (Array.isArray(cc)) {
                for (var ci = 0; ci < cc.length; ci++) { var cp = cc[ci]; if (cp && cp.text) toolCh += cp.text.length; }
              } else if (typeof cc === 'string') toolCh += cc.length;
              if (typeof stt.output === 'string') toolCh += stt.output.length;
            }
          }
          txtCh += ch;
          OWN.set(m.id, sid);
          M.set(m.id, {
            t: m.time,
            k: m.tokens,
            c: ch,
            p: m.model && m.model.providerID,
            m: m.model && m.model.id
          });
          if (m.type === 'user') turns++;
          if (m.type === 'assistant') {
            steps++;
            var tk = m.tokens;
            if (tk) {
              var ca = tk.cache || {};
              lastCtx = (tk.input || 0) + (ca.read || 0) + (ca.write || 0) + (tk.output || 0);
              if (ch >= 50) oTok += (tk.output || 0) + (tk.reasoning || 0);
            }
            if (ch >= 50 && m.time.completed && m.time.created) {
              // 只把「有正文的模型步」计入：纯工具步骤会把分母撑大、速度凭空掉一半
              var stepMs = Math.max(0, m.time.completed - m.time.created);
              llmMs += stepMs;
              decMs += stepMs;
            }
          }
        }
        // 只有「当前正在看的会话」才允许覆盖统计：want() 会并发拉多个候选 sid，
        // 后到的结果会把统计行改成别的会话的数字（甚至 0 步 → 整行闪没）
        // guessSid() 在新会话刚建、还没写 last-active-url 时会返回空，这时放行（单一候选，不会互相覆盖）
        var curSid = guessSid();
        if (!curSid || sid === curSid) {
        ST.sid = sid;
        ST.turns = turns;
        ST.steps = steps;
        ST.oTok = oTok;
        ST.decMs = decMs;
        ST.llmMs = llmMs;
        ST.ctx = lastCtx;
        ST.msgCh = txtCh;
        ST.toolCh = toolCh;
        ST.spanMs = firstAt && lastAt && lastAt > firstAt ? lastAt - firstAt : 0;
        ST.lastAt = lastAt;
        }
        loadSess(sid, function () { paintAll(); });
        then && then();
      }).catch(function () { }).then(function () { BUSY[sid] = 0; });
    };

    var loadSess = function (sid, then) {
      if (!sid) return;
      // 会话累计 tokens 只在每轮结束后才更新，所以必须过期就重拉；
      // 以前这里是 "sessSid 命中即返回"，数字永久冻结在首次拉取那一刻 —— 就是老板说的「没有真正跟随对话」
      if (ST.sessSid === sid && Date.now() - (ST.sessAt || 0) < 2500) { then && then(); return; }
      if (BUSY['s:' + sid]) return;
      var b = apiBase(); if (!b) return;
      BUSY['s:' + sid] = 1;
      fetch(b + '/api/session/' + sid).then(function (r) { return r.json(); }).then(function (j) {
        var s = j.data || j;
        if (s && (sid === ST.sid || sid === guessSid())) {
          ST.sess = s.tokens || null;
          ST.sessSid = sid;
          ST.sessAt = Date.now();
          ST.model = s.model || null;
        }
        then && then();
      }).catch(function () { ST.sessAt = Date.now(); }).then(function () { BUSY['s:' + sid] = 0; });
    };

    // 上下文上限按 model id 缓存。旧实现是单值 __ocCtxLimit$，一旦被第一个模型写进去就再也不更新：
    // 先打开过 200K 的会话，之后切到 1M 模型，面板仍然按 200K 算（50% 而不是 10%）。
    var limStore = function () {
      var g = globalThis.__ocCtxLimits$;
      if (!g) g = globalThis.__ocCtxLimits$ = Object.create(null);
      return g;
    };
    var limTried = function () {
      var g = globalThis.__ocCtxTried$;
      if (!g) g = globalThis.__ocCtxTried$ = Object.create(null);
      return g;
    };
    var limOf = function (mid) {
      if (!mid) return 0;
      var v = limStore()[mid];
      return v > 0 ? v : 0;
    };
    // 最新一条带 model 的消息最准：会话中途换模型时 /api/session 的 model 不一定立刻刷新
    var MIDC = { k: '', v: '' };
    var curMid = function () {
      var sm = (ST.model && ST.model.id) || '';
      var k = M.size + '|' + sm;
      if (MIDC.k === k) return MIDC.v;
      var last = '', it = M.values(), x;
      while (!(x = it.next()).done) { var v = x.value; if (v && v.m) last = v.m; }
      MIDC.k = k; MIDC.v = last || sm;
      return MIDC.v;
    };

    var loadModel = function (mid) {
      if (!mid) return;
      var g = limStore();
      if (g[mid] > 0) return;
      var T = limTried(), now = Date.now();
      if (T[mid] && now - T[mid] < 60000) return;  // 查不到就冷却一分钟，别每帧重发
      var b = apiBase(); if (!b) return;
      T[mid] = now;
      fetch(b + '/api/model').then(function (r) { return r.json(); }).then(function (j) {
        var a = (j && (j.data || j)) || [];
        for (var i = 0; i < a.length; i++) {
          if (a[i] && a[i].id === mid && a[i].limit && a[i].limit.context) {
            g[mid] = a[i].limit.context;
            globalThis.__ocCtxLimit$ = a[i].limit.context;  // 兼容旧值 / 人工排查
            delete T[mid];
            try { paintStats(); } catch (e) { }
            break;
          }
        }
      }).catch(function () { });
    };

    var want = function (mid) {
      if (!mid || M.has(mid)) return;
      var now = Date.now();
      if (now - (SID.lastTry || 0) < 2500) return;
      SID.lastTry = now;
      var list = cands(), i;
      for (i = 0; i < list.length && i < 6; i++) {
        (function (s) { loadSid(s, function () { paintAll(); }); })(list[i]);
      }
    };

    // ---------- 消息行：用量 + 时间 ----------
    // 2.1.x：正文 part 末尾有 <div data-slot=text-part-footer><span data-slot=text-part-meta>，宿主取 meta.parentElement
    // 2.2.0：助手 turn 的正文 part 会整块折叠进 collapsed-tool-group，页面上 text-part-meta / text-part-footer 全是 0，
    //        旧逻辑一个都挂不上（实测 metas=0 / usageCount=0 / doneTimes=[]）→ 回退成「按 turn 行」处理：
    //        在 [data-slot=session-turn-message-container] 末尾自建一行 meta，代表消息取整轮里最后一个有 time.completed 的 msg_ id
    //        （2.2.0 行上的 data-message-id 是这一轮的用户消息 id，不能直接用）
    var paintMsgRow = function (row) {
      var box = row.querySelector('[data-slot=session-turn-message-container]');
      if (!box) return;
      var ids = [], parts = row.querySelectorAll('[data-timeline-part-id]'), i, pid;
      for (i = 0; i < parts.length; i++) {
        pid = (parts[i].getAttribute('data-timeline-part-id') || '').split(':')[0];
        if (pid.indexOf('msg_') === 0 && ids.indexOf(pid) < 0) ids.push(pid);
      }
      pid = (row.getAttribute('data-message-id') || '').split(':')[0];
      if (pid.indexOf('msg_') === 0 && ids.indexOf(pid) < 0) ids.push(pid);

      var mid = '', rec = null, t = null, best = 0, r, tt;
      for (i = 0; i < ids.length; i++) {
        r = M.get(ids[i]);
        tt = r && (r.t || r);
        if (tt && tt.completed && (!best || tt.completed >= best)) { best = tt.completed; mid = ids[i]; rec = r; t = tt; }
      }

      var line = box.querySelector('[data-oc-msg-line]');
      if (!t) {
        if (line) line.remove();
        if (!rec && ids.length) want(ids[ids.length - 1]);
        return;
      }
      if (!line) {
        line = document.createElement('div');
        line.setAttribute('data-oc-msg-line', '1');
        line.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:12px;padding-top:4px';
        box.appendChild(line);
      }

      var tk = rec.k, total = 0, ca;
      if (tk) {
        ca = tk.cache || {};
        total = (tk.input || 0) + (tk.output || 0) + (ca.read || 0) + (ca.write || 0);
      }
      var useEl = line.querySelector('[data-oc-usage]');
      var timeEl = line.querySelector('[data-oc-done-time]');

      if (tk && total > 0) {
        if (!useEl) {
          useEl = document.createElement('span');
          useEl.setAttribute('data-oc-usage', '1');
          useEl.className = 'text-12-regular text-text-weak';
          useEl.style.cssText = 'white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums';
          useEl.innerHTML = '<svg width="11" height="11" aria-hidden="true" style="flex:0 0 auto;opacity:.8"><use href="#opencode-v2-icon-window-analytics"></use></svg><span data-oc-usage-txt></span>';
          line.appendChild(useEl);
        }
        useEl.setAttribute('data-oc-mid', mid);
        var utxt = '用量 ' + fmtTok(total) + ' tok';
        var uTxtEl = useEl.querySelector('[data-oc-usage-txt]');
        if (uTxtEl && uTxtEl.textContent !== utxt) uTxtEl.textContent = utxt;
      } else if (useEl) {
        useEl.remove();
        useEl = null;
      }

      if (!timeEl) {
        timeEl = document.createElement('span');
        timeEl.setAttribute('data-oc-done-time', '1');
        timeEl.className = 'text-12-regular text-text-weak';
        timeEl.style.cssText = 'white-space:nowrap;font-variant-numeric:tabular-nums;opacity:.8';
        line.appendChild(timeEl);
      }
      var txt = fmtClock(t.completed);
      if (timeEl.textContent !== txt) timeEl.textContent = txt;
    };

    var paintMsg = function () {
      var metas = document.querySelectorAll('[data-slot=text-part-meta]');
      for (var i = 0; i < metas.length; i++) {
        var sp = metas[i];
        var part = sp.closest('[data-timeline-part-id]');
        var row = sp.closest('[data-message-id]');
        var pid = part ? (part.getAttribute('data-timeline-part-id') || '').split(':')[0] : '';
        var rid = row ? row.getAttribute('data-message-id') : '';
        var mid = pid || rid;
        var rec = M.get(pid) || M.get(rid);
        var t = rec && (rec.t || rec);
        var host = sp.parentElement;
        if (!host) continue;

        var stale = host.querySelector('[data-oc-tps]');
        if (stale) stale.remove();

        var timeEl = host.querySelector('[data-oc-done-time]');
        var useEl = host.querySelector('[data-oc-usage]');

        if (!t || !t.completed) {
          if (timeEl) timeEl.remove();
          if (useEl) useEl.remove();
          if (!t) want(mid);
          continue;
        }

        var tk = rec.k;
        var total = 0;
        if (tk) {
          var ca = tk.cache || {};
          total = (tk.input || 0) + (tk.output || 0) + (ca.read || 0) + (ca.write || 0);
        }

        // 用量 pill：只有拿到 tokens 才显示
        if (tk && total > 0) {
          if (!useEl) {
            useEl = document.createElement('span');
            useEl.setAttribute('data-oc-usage', '1');
            useEl.className = 'text-12-regular text-text-weak';
            useEl.style.cssText = 'margin-left:auto;padding-left:12px;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums';
            useEl.innerHTML = '<svg width="11" height="11" aria-hidden="true" style="flex:0 0 auto;opacity:.8"><use href="#opencode-v2-icon-window-analytics"></use></svg><span data-oc-usage-txt></span>';
            host.appendChild(useEl);
          }
          useEl.setAttribute('data-oc-mid', mid);
          var utxt = '用量 ' + fmtTok(total) + ' tok';
          var uTxtEl = useEl.querySelector('[data-oc-usage-txt]');
          if (uTxtEl && uTxtEl.textContent !== utxt) uTxtEl.textContent = utxt;
        } else if (useEl) {
          useEl.remove();
          useEl = null;
        }

        if (!timeEl) {
          timeEl = document.createElement('span');
          timeEl.setAttribute('data-oc-done-time', '1');
          timeEl.className = 'text-12-regular text-text-weak';
          timeEl.style.cssText = 'padding-left:12px;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:.8';
          host.appendChild(timeEl);
        }
        if (!useEl) timeEl.style.marginLeft = 'auto';
        else timeEl.style.marginLeft = '';
        var txt = fmtClock(t.completed);
        if (timeEl.textContent !== txt) timeEl.textContent = txt;
      }

      // 2.2.0 回退：正文 footer 不存在时按 turn 行挂一行 meta（行内若已渲染 text-part-meta 说明是旧结构，跳过避免重复）
      var rows = document.querySelectorAll('[data-timeline-row=AssistantPart]'), j;
      for (j = 0; j < rows.length; j++) {
        if (rows[j].querySelector('[data-slot=text-part-meta]')) continue;
        paintMsgRow(rows[j]);
      }
    };

    // ---------- 首页会话行时间 ----------
    var paintHome = function () {
      var rows = document.querySelectorAll('[data-session-id]'), i;
      for (i = 0; i < rows.length; i++) {
        var el = rows[i], id = el.getAttribute('data-session-id');
        var rec = globalThis.__ocRowMap$ && globalThis.__ocRowMap$.get(id);
        var ts = rec && rec.session && rec.session.time && rec.session.time.updated;
        var host = el.querySelector('[data-slot=home-session-labels]');
        if (!host) continue;
        var sp = host.querySelector('[data-oc-home-time]');
        if (!ts) { if (sp) sp.remove(); continue; }
        if (!sp) {
          sp = document.createElement('span');
          sp.setAttribute('data-oc-home-time', '1');
          sp.style.cssText = 'flex:0 0 auto;font-size:11px;line-height:1;opacity:.55;padding-left:6px;font-variant-numeric:tabular-nums';
          host.appendChild(sp);
        }
        var txt = fmtClock(ts);
        if (sp.textContent !== txt) sp.textContent = txt;
      }
    };

    // ---------- 输入框下方：会话统计 ----------
    var ensureStatsCss = function () {
      if (document.getElementById('oc-stats-css')) return;
      var tag = document.createElement('style');
      tag.id = 'oc-stats-css';
      // 每块自带内边距 + hover 底色，视觉上才是一列一列分开的（对齐 dsh 的 pill）
      tag.textContent = '[data-oc-stat]{padding:2px 9px;border-radius:999px;transition:background-color .12s ease}' +
        '[data-oc-stat]:hover{background:rgba(128,128,128,.14)}';
      document.head.appendChild(tag);
    };

    var statsEl = null;
    var ensureStats = function () {
      ensureStatsCss();
      var form = document.querySelector('[data-component="composer"]');
      if (!form) return null;
      var host = form.parentElement;
      if (!host) return null;
      var reuse = statsEl && statsEl.parentElement === host && statsEl.querySelector('[data-oc-tps-wrap]');
      if (!reuse) {
        statsEl = host.querySelector('[data-oc-stats]');
        // 旧版结构（tok/s 单独挂在发送按钮旁）没有 tps 容器，直接重建
        if (statsEl && !statsEl.querySelector('[data-oc-tps-wrap]')) {
          statsEl.parentNode.removeChild(statsEl);
          statsEl = null;
        }
        if (!statsEl) {
          statsEl = document.createElement('div');
          statsEl.setAttribute('data-oc-stats', '1');
          statsEl.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:24px;padding:8px 4px 0;font-size:11px;line-height:1;color:var(--text-weak);opacity:.8;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:auto;user-select:none';
          statsEl.innerHTML =
            '<span data-oc-stat="rounds" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer">' +
              '<span data-oc-rounds-text></span>' +
              '<span data-oc-tps-wrap style="visibility:hidden">·&nbsp;<span data-oc-live-tps></span> tok/s</span>' +
            '</span>' +
            '<span data-oc-stat="usage" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"></span>' +
            '<span data-oc-stat="ctx" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"></span>';
          host.insertBefore(statsEl, form.nextSibling);
        }
      }
      // cssText 里的 display:flex 会被丢掉（实测 computed 变 block、gap 形同虚设，三块挤成一坨、也不居中），单独用 important 压住
      statsEl.style.setProperty('display', 'flex', 'important');
      return statsEl;
    };

    var paintStats = function () {
      var el = ensureStats();
      if (!el) return;
      // 用 visibility 而不是 display：保留这 23px 高度，否则新会话数据没到的那一帧整行消失，输入框跟着上下跳
      if (!ST.steps && !ST.turns) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = '';

      // 3 秒兜底轮询：靠 tick()/SSE 触发的话，只有页面有 DOM 变动才会刷新，数字会看起来卡住
      if (ST.sid && Date.now() - (ST.sessAt || 0) > 3000) loadSess(ST.sid, paintStats);

      var rounds = el.querySelector('[data-oc-rounds-text]');
      var rt = '⟳ ' + (ST.turns ? ST.turns + ' 轮 ' : '') + (ST.steps || 0) + ' 步';
      if (rounds && rounds.textContent !== rt) rounds.textContent = rt;

      var sess = ST.sess || {};
      var ca = sess.cache || {};
      var total = (sess.input || 0) + (sess.output || 0) + (ca.read || 0) + (ca.write || 0);
      var den = (sess.input || 0) + (ca.read || 0) + (ca.write || 0);
      var hit = den > 0 ? Math.round(((ca.read || 0) / den) * 100) : null;
      var usage = el.querySelector('[data-oc-stat="usage"]');
      var ut = total > 0
        ? '▤ ' + fmtTok(total) + ' tok' + (hit === null ? '' : ' · 缓存命中 ' + hit + '%')
        : '';
      if (usage.textContent !== ut) usage.textContent = ut;
      usage.style.display = ut ? '' : 'none';

      var mid = curMid();
      var lim = limOf(mid);
      if (!lim) loadModel(mid);
      var pct = lim > 0 && ST.ctx > 0 ? Math.min(100, Math.round((ST.ctx / lim) * 100)) : null;
      var ctx = el.querySelector('[data-oc-stat="ctx"]');
      if (pct === null) {
        if (ctx.style.display !== 'none') ctx.style.display = 'none';
      } else {
        // 别用 ''：清空后会退回 span 默认的 inline，里面的 block 圆环会把文字挤到下一行
        if (ctx.style.display === 'none') ctx.style.display = 'inline-flex';
        var ring = ctx.querySelector('[data-oc-ring]');
        if (!ring) {
          // 圆环：conic-gradient 按百分比填充 + radial mask 挖空中心（Chromium 里两者都吃 currentColor）
          ctx.innerHTML = '<span data-oc-ring></span><span data-oc-ctx-text></span>';
          ring = ctx.querySelector('[data-oc-ring]');
          ring.style.cssText = 'display:block;flex:0 0 auto;width:10px;height:10px;border-radius:50%;' +
            'background:conic-gradient(currentColor calc(var(--p) * 1%), color-mix(in srgb, currentColor 22%, transparent) 0)';
          ring.style.setProperty('-webkit-mask', 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))');
        }
        ring.style.setProperty('--p', String(pct));
        var tx = ctx.querySelector('[data-oc-ctx-text]');
        var ct = pct + '%';
        if (tx.textContent !== ct) tx.textContent = ct;
      }
      paintSpeed();
    };

    // ---------- 统计行内：tok/s（流式中实时，结束后 dsh 口径平均） ----------
    var K = 0.6, WIN = 2000, IDLE = 2000, ALPHA = 0.4;
    var D = [];
    var LIVE = { v: 0, last: 0 };  // v：平滑中的实时值；last：最后一次输出结束时的显示值，停止后钉住

    var kAdj = function () {
      var M2 = globalThis.__ocMsgTime$;
      if (!M2 || !M2.size) return K;
      var tk = 0, ch = 0, it = M2.values(), x;
      while (!(x = it.next()).done) {
        var v = x.value;
        if (v && v.k && v.c >= 200) {
          var n = (v.k.output || 0) + (v.k.reasoning || 0);
          var r = n / v.c;
          if (n > 0 && r > 0.25 && r < 1.2) { tk += n; ch += v.c; }
        }
      }
      if (ch < 2000 || !tk) return K;
      return tk / ch;
    };

    // 平均速度：Σoutput / Σ(completed - created)，分母只含 l>=50 字符的模型步
    var avgTps = function () {
      return ST.decMs > 0 ? Math.round(ST.oTok / (ST.decMs / 1000)) : 0;
    };

    var ensureSpeed = function () {
      var el = ensureStats();
      return el ? el.querySelector('[data-oc-live-tps]') : null;
    };

    var paintSpeed = function () {
      var s = ensureSpeed();
      var st = statsEl;
      if (!s || !st) return;
      var wrap = st.querySelector('[data-oc-tps-wrap]');
      if (!wrap) return;
      var now = performance.now(), cut = now - WIN, i, sum = 0, oldest = now, last = 0;
      for (i = D.length - 1; i >= 0; i--) {
        var r = D[i];
        if (r.t < cut) break;
        sum += r.n;
        if (r.t < oldest) oldest = r.t;
        if (r.t > last) last = r.t;
      }
      while (D.length && D[0].t < now - 8000) D.shift();
      var live = !!sum && now - last <= IDLE;
      var val = 0;
      if (live) {
        var span = Math.min(WIN, now - oldest);
        if (span < 1000) span = 1000;
        var raw = sum / span * 1000 * kAdj();
        // 指数平滑（新值 0.4）：滑窗在输出不均匀时会大幅摆动，直接显示像乱码
        LIVE.v = LIVE.v > 0 ? LIVE.v * (1 - ALPHA) + raw * ALPHA : raw;
        val = Math.round(LIVE.v);
        LIVE.last = val;
      } else {
        // 输出结束不消失：钉住最后那一帧的实时值，既不归零也不拿平均值顶替
        val = LIVE.last || 0;
      }
      // 同理用 visibility 保宽：tok/s 一消失第一块就变窄，居中布局会让整行左右横跳
      if (!val) { wrap.style.visibility = 'hidden'; return; }
      wrap.style.visibility = '';
      var txt = String(val);
      if (s.textContent !== txt) s.textContent = txt;
      wrap.setAttribute('title', live ? '实时输出速度（2 秒滑窗，平滑 0.4）' : '最后一次输出的实时速度（已停止输出）');
    };

    var connect = function () {
      var b = apiBase();
      if (!b) return;
      fetch(b + '/api/event').then(function (r) {
        if (!r.ok || !r.body) return;
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
        var pump = function () {
          rd.read().then(function (x) {
            if (x.done) return;
            buf += dec.decode(x.value, { stream: true });
            var i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              var raw = buf.slice(0, i);
              buf = buf.slice(i + 2);
              var line = '', ls = raw.split('\n');
              for (var j = 0; j < ls.length; j++) {
                if (ls[j].indexOf('data: ') === 0) { line = ls[j].slice(6); break; }
              }
              if (!line) continue;
              var ev;
              try { ev = JSON.parse(line); } catch (e) { continue; }
              var dd = ev.data;
              if (!dd) continue;
              if ((ev.type === 'session.text.delta' || ev.type === 'session.reasoning.delta') && dd.delta && dd.assistantMessageID) {
                D.push({ t: performance.now(), n: dd.delta.length, mid: dd.assistantMessageID });
                paintSpeed();
              } else if (ev.type === 'session.text.ended' || ev.type === 'session.step.ended' || ev.type === 'session.execution.succeeded') {
                setTimeout(paintSpeed, 1400);
                // 一轮结束再拉一次消息列表：轮数/步数/上下文都来自 /message，只在 boot 时拉一次的话
                // 一条消息发完统计行还是旧的（这是老板说的「会话统计没跟随会话」的另一半）
                setTimeout(function () { if (ST.sid) loadSid(ST.sid, paintAll); else paintAll(); }, 1500);
              }
            }
            pump();
          }).catch(function () { });
        };
        pump();
      }).catch(function () { });
    };

    // ---------- 弹层（本轮用量 / 会话统计 / Token 用量 / 上下文） ----------
    var panel = null;
    var closePanel = function () {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
    };
    var rowHtml = function (k, v) {
      return '<div style="display:flex;justify-content:space-between;gap:24px"><span style="opacity:.65">' + k + '</span><span style="font-variant-numeric:tabular-nums">' + v + '</span></div>';
    };
    var fmtDur = function (ms) {
      if (!ms || ms < 0) return '—';
      var s = Math.round(ms / 1000);
      if (s < 60) return s + '秒';
      var m = Math.floor(s / 60), r = s % 60;
      if (m < 60) return m + '分' + r + '秒';
      var h = Math.floor(m / 60); m = m % 60;
      return h + '小时' + m + '分';
    };
    var openPanel = function (anchor, title, body, extra) {
      if (panel) { closePanel(); return; }
      panel = document.createElement('div');
      panel.setAttribute('data-oc-usage-panel', '1');
      panel.style.cssText = 'position:fixed;z-index:9999;min-width:260px;max-width:320px;padding:10px 12px;border-radius:10px;background:var(--v2-background-bg-base,#1b1b1b);border:1px solid rgba(128,128,128,.25);box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:12px;line-height:1.7;color:var(--text-base,inherit);display:flex;flex-direction:column;gap:1px';
      panel.innerHTML = (title ? '<div style="font-weight:600;margin-bottom:4px">' + title + '</div>' : '') + (extra || '') + body;
      document.body.appendChild(panel);
      var r = anchor.getBoundingClientRect();
      var pr = panel.getBoundingClientRect();
      var left = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8);
      var top = r.top - pr.height - 8;
      if (top < 8) top = r.bottom + 8;
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    };

    var usageRows = function (tk) {
      var ca = tk.cache || {};
      var total = (tk.input || 0) + (tk.output || 0) + (ca.read || 0) + (ca.write || 0);
      var den = (tk.input || 0) + (ca.read || 0) + (ca.write || 0);
      var hit = den > 0 ? Math.round(((ca.read || 0) / den) * 1000) / 10 : null;
      return {
        total: total,
        hit: hit,
        html: rowHtml('缓存命中', hit === null ? '—' : hit + '%') +
          rowHtml('未缓存输入', String(tk.input || 0) + ' tok') +
          rowHtml('缓存读取', String(ca.read || 0) + ' tok') +
          (ca.write ? rowHtml('缓存写入', String(ca.write) + ' tok') : '') +
          rowHtml('输出', String(tk.output || 0) + ' tok') +
          (tk.reasoning ? rowHtml('其中推理', String(tk.reasoning) + ' tok') : '')
      };
    };

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) { closePanel(); return; }
      var u = t.closest('[data-oc-usage]');
      if (u) {
        e.preventDefault(); e.stopPropagation();
        if (panel) { closePanel(); return; }
        var mid = u.getAttribute('data-oc-mid');
        var rec = mid && M.get(mid);
        if (!rec || !rec.k) return;
        var ur = usageRows(rec.k);
        openPanel(u, '', rowHtml('提供方 / 模型', (rec.p || '—') + '/' + (rec.m || '—')) + ur.html,
          '<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px"><span style="font-weight:600">本轮用量</span><span style="font-variant-numeric:tabular-nums;font-weight:600">' + ur.total.toLocaleString() + ' tok</span></div>');
        return;
      }
      var st = t.closest('[data-oc-stat]');
      if (st) {
        e.preventDefault(); e.stopPropagation();
        if (panel) { closePanel(); return; }
        var kind = st.getAttribute('data-oc-stat');
        if (kind === 'rounds') {
          var tps = avgTps();
          var llmMs = ST.llmMs || ST.decMs;
          var stepMs = ST.steps > 0 ? Math.round(llmMs / ST.steps) : 0;
          var toolMs = ST.spanMs > llmMs ? ST.spanMs - llmMs : 0;
          openPanel(st, '会话统计',
            rowHtml('模型用时', fmtDur(llmMs)) +
            rowHtml('工具调用用时', fmtDur(toolMs)) +
            rowHtml('单步平均耗时', stepMs ? (Math.round(stepMs / 100) / 10) + '秒' : '—') +
            rowHtml('输出速度（TPS）', tps ? tps + ' tok/s' : '—'));
        } else if (kind === 'usage') {
          var sess = ST.sess || {};
          var su = usageRows(sess);
          openPanel(st, '', su.html,
            '<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px"><span style="font-weight:600">Token 用量</span><span style="font-variant-numeric:tabular-nums;font-weight:600">' + su.total.toLocaleString() + ' tok</span></div>');
        } else if (kind === 'ctx') {
          var mid = curMid();
          var lim = limOf(mid);
          if (!lim) loadModel(mid);
          var ctx = ST.ctx || 0;
          // API 只给整轮 token 总量，拆不出精确的工具占用：按会话内「正文 / 工具」字符占比折算
          var tch = ST.toolCh || 0, mch = ST.msgCh || 0, sum = tch + mch;
          var toolTok = sum > 0 ? Math.round((ctx * tch) / sum) : 0;
          var msgTok = ctx - toolTok;
          var pct = lim > 0 ? Math.min(100, Math.round((ctx / lim) * 1000) / 10) : 0;
          var bar = '<div style="height:6px;border-radius:3px;background:rgba(128,128,128,.25);margin:6px 0 8px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#3b82f6;border-radius:3px"></div></div>';
          openPanel(st, '',
            rowHtml('对话消息', '~' + fmtTok(msgTok) + ' tok') +
            rowHtml('工具结果', sum > 0 ? '~' + fmtTok(toolTok) + ' tok' : '—') +
            rowHtml('合计占用', '~' + fmtTok(ctx) + ' tok') +
            rowHtml('上限', lim ? fmtTok(lim) + ' tok' : '—'),
            '<div style="display:flex;justify-content:space-between;gap:24px"><span style="font-weight:600">上下文已用 ' + pct + '%</span><span style="font-variant-numeric:tabular-nums;font-weight:600">~' + fmtTok(ctx) + ' / ' + (lim ? fmtTok(lim) : '—') + '</span></div>' + bar);
        }
        return;
      }
      closePanel();
    }, true);
    document.addEventListener('scroll', closePanel, true);

    // ---------- 调度 ----------
    var guessSid = function () {
      SID.src = 0;
      // 0) 标题栏标签页：data-active="true" 的 tab，key 形如 "sidecar\n/server/xxx/session/ses_…"，切换瞬间就变，最准
      try {
        var at = document.querySelector('[data-tab-key][data-active="true"]');
        var am = at && (at.getAttribute('data-tab-key') || '').match(/(ses_[A-Za-z0-9]+)/);
        if (am) { SID.src = 2; return am[1]; }
      } catch (e) { }
      // 1) DOM 里正在渲染的消息 → 反查它属于哪个会话。
      // localStorage 的 last-active-url 和 performance 里的 /api/session 请求都可能滞后于真实切换（实测切 tab 3 秒后还指着旧会话）
      try {
        var els = document.querySelectorAll('[data-timeline-part-id]');
        for (var d = els.length - 1; d >= 0 && d > els.length - 80; d--) {
          var pid = (els[d].getAttribute('data-timeline-part-id') || '').split(':')[0];
          var own = pid && OWN.get(pid);
          if (own) { SID.src = 1; return own; }
        }
      } catch (e) { }
      // 退化：桌面端记录的当前会话；再退化到最近的 /api/session 请求，再退化到标签页
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('last-active-url') >= 0) {
            var v = localStorage.getItem(k) || '';
            var m = v.match('/session/(ses_[A-Za-z0-9]+)');
            if (m) return m[1];
          }
        }
      } catch (e) { }
      var es = performance.getEntriesByType('resource');
      for (var j = es.length - 1; j >= 0; j--) {
        var u = es[j].name, kk = u.indexOf('/api/session/');
        if (kk < 0) continue;
        var rest = u.slice(kk + 13), sl = rest.indexOf('/');
        var id = sl < 0 ? rest : rest.slice(0, sl);
        if (id.indexOf('ses_') === 0) return id;
      }
      var list = cands();
      return list.length ? list[0] : '';
    };
    var lastSync = 0;
    var syncSid = function () {
      var now = Date.now();
      if (now - lastSync < 2000) return;
      lastSync = now;
      var cur = guessSid();
      // guessSid() 在新会话刚建时会在「新 sid / 旧最近资源 / 空」之间抖，抖一次就切一次会话 → 统计行反复清空又回填。
      // 要求同一个 sid 连续两轮一致（首轮直接放行，来源是标题栏 tab 也直接放行 —— 那就是用户此刻点开的会话）。
      var stable = cur && (cur === SID.lastCur || !SID.lastCur || SID.src === 2);
      SID.lastCur = cur;
      if (stable && cur !== ST.sid && !BUSY[cur]) {
        // 真换会话：旧会话的数字立刻清掉，否则新会话会先显示上一条的轮数/步数，再变成空白、再变成新数（就是老板说的「消失出现」）
        LIVE.v = 0; LIVE.last = 0;
        // 面板里的轮数/步数/用量都是切会话那一刻的快照，留着只会显示上一个会话的数字
        try { closePanel(); } catch (e) { }
        ST.turns = 0; ST.steps = 0; ST.oTok = 0; ST.ctx = 0; ST.sess = null; ST.sessSid = ''; ST.sessAt = 0;
        loadSid(cur, paintAll);
      }
    };
    var paintAll = function () { paintMsg(); paintHome(); paintStats(); syncSid(); };
    var tick = function () {
      if (globalThis.__ocTimeT$) return;
      globalThis.__ocTimeT$ = setTimeout(function () { globalThis.__ocTimeT$ = 0; paintAll(); }, 120);
    };
    try {
      var mo = new MutationObserver(tick);
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { }
    setInterval(paintHome, 15000);
    // SSE 断线时也不能让轮数/步数永远停在打开那一刻；20 秒一次，代价远小于每帧重拉
    setInterval(function () { if (ST.sid && !BUSY[ST.sid]) loadSid(ST.sid, paintStats); }, 20000);
    // 切 tab 之后 DOM 可能长时间没有 mutation（渲染完就不动了），只靠 tick 的话统计行会一直停在旧会话上，
    // 要等 20 秒兜底才跟上。这里借 400ms 的速度定时器顺手喊一声 syncSid()（它自己 2 秒限流）。
    setInterval(function () { paintSpeed(); syncSid(); }, 400);
    var boot = function () {
      if (!apiBase()) { setTimeout(boot, 1000); return; }
      connect();
      var sid = guessSid();
      if (sid) loadSid(sid, paintAll);
      setTimeout(function () { var s2 = guessSid(); if (s2 && s2 !== ST.sid) loadSid(s2, paintAll); }, 2500);
    };
    boot();
    paintAll();
  } catch (e) { }
})();
