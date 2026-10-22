/* 时间 / 用量 / 速度 / 会话统计 —— 参照 dsh 的信息布局
 *
 * 1) 每条助手回复的 meta 行右侧：`用量 4.1M tok   10月15日 18:45`
 *    - 用量可点开，弹出本轮明细（模型 / 缓存命中 / 各类 token）
 *    - 时间格式跟 dsh 一致：今天 `HH:MM`，同年 `M月D日 HH:MM`，跨年带年份
 * 2) 输入框下方一行会话统计：`10 轮 97 步 · 235 tok/s` / `18.5M tok · 缓存命中 95%` / `38%`
 * 3) 发送按钮左侧：流式时实时 tok/s（会话统计里的 tok/s 是整段平均值）
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
      fetch(b + '/api/session/' + sid + '/message').then(function (r) { return r.json(); }).then(function (j) {
        var a = Array.isArray(j) ? j : ((j && (j.data || j.messages)) || []);
        var turns = 0, steps = 0, oTok = 0, decMs = 0, lastCtx = 0, sttMs = 0, firstAt = 0, lastAt = 0;
        for (var i = 0; i < a.length; i++) {
          var m = a[i];
          if (!m || !m.id || !m.time) continue;
          if (m.time.created && (!firstAt || m.time.created < firstAt)) firstAt = m.time.created;
          if (m.time.completed && m.time.completed > lastAt) lastAt = m.time.completed;
          var ch = 0;
          if (m.content) for (var q = 0; q < m.content.length; q++) {
            var pp = m.content[q];
            if (pp && (pp.type === 'text' || pp.type === 'reasoning')) ch += (pp.text || '').length;
          }
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
            if (ch >= 50 && m.time.completed && m.time.created) decMs += Math.max(0, m.time.completed - m.time.created);
            if (m.time.streamed && m.time.created) sttMs += Math.max(0, m.time.streamed - m.time.created);
          }
        }
        ST.sid = sid;
        ST.turns = turns;
        ST.steps = steps;
        ST.oTok = oTok;
        ST.decMs = decMs;
        ST.ctx = lastCtx;
        ST.sttMs = sttMs;
        ST.spanMs = firstAt && lastAt && lastAt > firstAt ? lastAt - firstAt : 0;
        ST.lastAt = lastAt;
        loadSess(sid, function () { paintAll(); });
        then && then();
      }).catch(function () { }).then(function () { BUSY[sid] = 0; });
    };

    var loadSess = function (sid, then) {
      if (!sid) return;
      if (ST.sessSid === sid) { then && then(); return; }
      if (BUSY['s:' + sid]) return;
      var b = apiBase(); if (!b) return;
      BUSY['s:' + sid] = 1;
      fetch(b + '/api/session/' + sid).then(function (r) { return r.json(); }).then(function (j) {
        var s = j.data || j;
        if (s) {
          ST.sess = s.tokens || null;
          ST.sessSid = sid;
          ST.model = s.model || null;
        }
        then && then();
      }).catch(function () { }).then(function () { BUSY['s:' + sid] = 0; });
    };

    var loadModel = function (mid) {
      if (!mid || globalThis.__ocCtxLimit$ || BUSY['m:' + mid]) return;
      var b = apiBase(); if (!b) return;
      BUSY['m:' + mid] = 1;
      fetch(b + '/api/model').then(function (r) { return r.json(); }).then(function (j) {
        var a = (j && (j.data || j)) || [];
        for (var i = 0; i < a.length; i++) {
          if (a[i] && a[i].id === mid && a[i].limit && a[i].limit.context) {
            globalThis.__ocCtxLimit$ = a[i].limit.context;
            break;
          }
        }
      }).catch(function () { }).then(function () { BUSY['m:' + mid] = 0; });
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
    var statsEl = null;
    var ensureStats = function () {
      var form = document.querySelector('[data-component="composer"]');
      if (!form) return null;
      var host = form.parentElement;
      if (!host) return null;
      if (statsEl && statsEl.parentElement === host) return statsEl;
      statsEl = host.querySelector('[data-oc-stats]');
      if (!statsEl) {
        statsEl = document.createElement('div');
        statsEl.setAttribute('data-oc-stats', '1');
        statsEl.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 4px 0;font-size:11px;line-height:1;color:var(--text-weak);opacity:.8;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:auto;user-select:none';
        statsEl.innerHTML =
          '<span data-oc-stat="rounds" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"></span>' +
          '<span data-oc-stat="usage" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"></span>' +
          '<span data-oc-stat="ctx" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"></span>';
        host.insertBefore(statsEl, form.nextSibling);
      }
      return statsEl;
    };

    var paintStats = function () {
      var el = ensureStats();
      if (!el) return;
      if (!ST.steps && !ST.turns) { el.style.display = 'none'; return; }
      el.style.display = '';

      var tps = ST.decMs > 0 ? Math.round(ST.oTok / (ST.decMs / 1000)) : 0;
      var rounds = el.querySelector('[data-oc-stat="rounds"]');
      var rt = '⟳ ' + (ST.turns || 0) + ' 轮 ' + (ST.steps || 0) + ' 步' + (tps ? ' · ' + tps + ' tok/s' : '');
      if (rounds.textContent !== rt) rounds.textContent = rt;

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

      var lim = globalThis.__ocCtxLimit$ || 0;
      if (!lim && ST.model && ST.model.id) loadModel(ST.model.id);
      var pct = lim > 0 && ST.ctx > 0 ? Math.min(100, Math.round((ST.ctx / lim) * 100)) : null;
      var ctx = el.querySelector('[data-oc-stat="ctx"]');
      var ct = pct === null ? '' : '◑ ' + pct + '%';
      if (ctx.textContent !== ct) ctx.textContent = ct;
      ctx.style.display = ct ? '' : 'none';
    };

    // ---------- 发送按钮旁：实时 tok/s ----------
    var K = 0.6, WIN = 2500, IDLE = 2000;
    var D = [];

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

    var speedHost = function () { return document.querySelector('[data-slot=composer-actions]'); };
    var ensureSpeed = function () {
      var ca = speedHost();
      if (!ca) return null;
      var s = ca.querySelector('[data-oc-live-tps]');
      if (!s) {
        s = document.createElement('span');
        s.setAttribute('data-oc-live-tps', '1');
        s.style.cssText = 'font-size:11px;line-height:1;opacity:.5;margin-right:8px;font-variant-numeric:tabular-nums;white-space:nowrap';
        ca.insertBefore(s, ca.firstChild);
      }
      return s;
    };

    var paintSpeed = function () {
      var s = ensureSpeed();
      if (!s) return;
      var now = performance.now(), cut = now - WIN, i, sum = 0, oldest = now, last = 0;
      for (i = D.length - 1; i >= 0; i--) {
        var r = D[i];
        if (r.t < cut) break;
        sum += r.n;
        if (r.t < oldest) oldest = r.t;
        if (r.t > last) last = r.t;
      }
      while (D.length && D[0].t < now - 8000) D.shift();
      if (!sum || now - last > IDLE) {
        if (s.textContent) s.textContent = '';
        s.style.display = 'none';
        return;
      }
      var span = Math.min(WIN, now - oldest);
      if (span < 1000) span = 1000;
      var raw = sum / span * 1000 * kAdj();
      s.style.display = '';
      var txt = Math.round(raw) + ' tok/s';
      if (s.textContent !== txt) s.textContent = txt;
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
                setTimeout(paintAll, 1500);
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
          var tps = ST.decMs > 0 ? Math.round(ST.oTok / (ST.decMs / 1000)) : 0;
          var ttft = ST.steps > 0 ? Math.round(ST.sttMs / ST.steps) : 0;
          var toolMs = ST.spanMs > ST.decMs ? ST.spanMs - ST.decMs : 0;
          openPanel(st, '会话统计',
            rowHtml('模型用时', fmtDur(ST.decMs)) +
            rowHtml('工具调用用时', fmtDur(toolMs)) +
            rowHtml('首 token 平均（TTFT）', ttft ? (Math.round(ttft / 100) / 10) + '秒' : '—') +
            rowHtml('输出速度（TPS）', tps ? tps + ' tok/s' : '—'));
        } else if (kind === 'usage') {
          var sess = ST.sess || {};
          var su = usageRows(sess);
          openPanel(st, '', su.html,
            '<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px"><span style="font-weight:600">Token 用量</span><span style="font-variant-numeric:tabular-nums;font-weight:600">' + su.total.toLocaleString() + ' tok</span></div>');
        } else if (kind === 'ctx') {
          var lim = globalThis.__ocCtxLimit$ || 0;
          var ctx = ST.ctx || 0;
          var pct = lim > 0 ? Math.min(100, Math.round((ctx / lim) * 1000) / 10) : 0;
          var bar = '<div style="height:6px;border-radius:3px;background:rgba(128,128,128,.25);margin:6px 0 8px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#3b82f6;border-radius:3px"></div></div>';
          openPanel(st, '',
            rowHtml('对话消息', '~' + fmtTok(ctx) + ' tok') +
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
      // 优先桌面端记录的当前会话；退化到最近的 /api/session 请求，再退化到标签页
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
      if (cur && cur !== ST.sid && !BUSY[cur]) loadSid(cur, paintAll);
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
    setInterval(paintSpeed, 400);
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
