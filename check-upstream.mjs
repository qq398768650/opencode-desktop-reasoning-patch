// check-upstream.mjs — 打补丁前先看官方更新日志，判断官方是否已经实现了我们要补的某个功能。
//
// 背景：官方迭代很快，某些补丁迟早会被官方自己做掉（例如 v2.2.0 官方恢复了 Todo 工具、
// 顺手加了 Desktop 插件机制）。重复实现一遍是纯负债：锚点会失效、行为会和官方打架。
// 所以打补丁的第一步是「查日志 → 提示候选冲突 → 由人决定跳过哪一个」。
//
// 用法：
//   node check-upstream.mjs                 # 查安装目录当前版本的日志
//   node check-upstream.mjs --version 2.2.2 # 查指定版本
//   node check-upstream.mjs --json          # 机器可读输出（apply-patch.mjs 内部用）
//   node check-upstream.mjs --strict        # 有疑似冲突时退出码 1（CI / 命令里用）
//   node check-upstream.mjs --force         # 忽略缓存，重新拉
//
// 它只做「提示」，不替人做决定：命中关键词不等于官方真做了同一件事（比如官方说
// activity pill 能展开 shell 输出，不等于我们的「工作中」行折叠该删），报告里会把命中的
// 原文列出来，由人判断后决定是否 --skip=<key>。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const FEATURES = [
  {
    key: 'home-delete',
    name: '首页会话行「删除」按钮（含 Shift 免确认 / 多选删除）',
    patterns: [
      /delet\w*[^.\n]{0,24}session/i,
      /session[^.\n]{0,24}delet/i,
      /\btrash\b/i,
      /recycle bin/i,
      /undo[^.\n]{0,20}delet/i,
    ],
  },
  {
    key: 'time-stats',
    name: '回复时间 / 用量 / tok/s 统计',
    patterns: [
      /token usage/i,
      /usage[^.\n]{0,24}panel/i,
      /tokens per second/i,
      /context usage/i,
      /session[^.\n]{0,20}cost/i,
    ],
  },
  {
    key: 'file-reveal',
    name: 'Ctrl+点击文件路径 → 资源管理器定位',
    patterns: [
      /reveal[^.\n]{0,30}(explorer|folder|file manager)/i,
      /show in (file )?explorer/i,
      /open[^.\n]{0,20}containing (folder|directory)/i,
      /click[^.\n]{0,30}file path/i,
    ],
  },
  {
    key: 'work-fold',
    name: '「工作中」行展开 / 收起',
    patterns: [
      /activity pill/i,
      /(working|activity)[^.\n]{0,24}(shelf|pill)/i,
      /expand[^.\n]{0,24}working/i,
      /collapse[^.\n]{0,24}(working|activity)/i,
    ],
  },
  {
    key: 'feature-panel',
    name: '标题栏功能开关条',
    patterns: [/toggle[^.\n]{0,30}feature/i, /feature flag/i],
  },
];

const REPO = 'anomalyco/opencode';
const cacheDir = os.tmpdir();

function ghBin() {
  const probe = spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (!probe.error && probe.status === 0) return 'gh';
  const fallback = 'C:\\Program Files\\GitHub CLI\\gh.exe';
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function fetchBody(version, force) {
  const cache = path.join(cacheDir, `oc-upstream-${version}.json`);
  if (!force && fs.existsSync(cache)) {
    try { return { body: fs.readFileSync(cache, 'utf8'), cached: true }; } catch { }
  }
  const gh = ghBin();
  if (gh) {
    const r = spawnSync(gh, ['release', 'view', 'v' + version, '-R', REPO, '--json', 'body,tagName,publishedAt', '-q', '.body'], {
      encoding: 'utf8', timeout: 20000, windowsHide: true,
    });
    if (!r.error && r.status === 0 && r.stdout.trim()) {
      try { fs.writeFileSync(cache, r.stdout, 'utf8'); } catch { }
      return { body: r.stdout, cached: false };
    }
  }
  return { body: null, cached: false, error: (r && r.stderr) || 'gh 不可用' };
}

function hitLines(body, patterns) {
  const lines = body.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const hits = [];
  for (const line of lines) {
    if (!line.startsWith('- ') && !line.startsWith('* ')) continue;
    for (const p of patterns) {
      if (p.test(line)) { hits.push(line); break; }
    }
  }
  return hits;
}

export function checkUpstream(version, { force = false } = {}) {
  const { body, cached, error } = fetchBody(version, force);
  if (!body) return { version, ok: false, error, conflicts: [], results: [] };

  const results = FEATURES.map((f) => {
    const hits = hitLines(body, f.patterns);
    return { key: f.key, name: f.name, hits };
  });
  return { version, ok: true, cached, conflicts: results.filter((r) => r.hits.length), results };
}

// ---- 跨版本：从上次成功打过补丁的版本到当前版本，中间的日志都要看 ----
// 只查当前版本是不够的：常见情况是 2.2.0 打完补丁，一路用到 2.2.3 才重打，中间几版的更新全漏了。

export function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function listVersions() {
  const gh = ghBin();
  if (!gh) return [];
  const r = spawnSync(gh, ['release', 'list', '-R', REPO, '--limit', '80', '--json', 'tagName', '-q', '.[].tagName'], {
    encoding: 'utf8', timeout: 20000, windowsHide: true,
  });
  if (r.error || r.status !== 0) return [];
  return r.stdout.split(/\s+/).map((s) => s.trim().replace(/^v/, '')).filter(Boolean);
}

// 返回 (from, to] 之间的所有版本（不含 from，含 to），按升序。
export function versionsBetween(from, to, all = listVersions()) {
  const pool = all.length ? all : [to];
  const picked = pool.filter((v) => cmpVer(v, from) > 0 && cmpVer(v, to) <= 0);
  if (!picked.includes(to)) picked.push(to);
  return picked.sort(cmpVer);
}

export function checkUpstreamRange(versions, { force = false } = {}) {
  const bodies = [];
  const missing = [];
  let cachedAll = true;
  for (const v of versions) {
    const { body, cached, error } = fetchBody(v, force);
    if (!body) { missing.push(`${v}: ${error || '拉取失败'}`); continue; }
    if (!cached) cachedAll = false;
    bodies.push(`## v${v}\n` + body);
  }
  if (!bodies.length) return { version: versions.join(','), ok: false, error: missing.join('; '), conflicts: [], results: [] };
  const merged = bodies.join('\n');
  const results = FEATURES.map((f) => ({ key: f.key, name: f.name, hits: hitLines(merged, f.patterns) }));
  return {
    version: versions.length === 1 ? versions[0] : `${versions[0]} → ${versions[versions.length - 1]}`,
    ok: true,
    cached: cachedAll,
    missing,
    conflicts: results.filter((r) => r.hits.length),
    results,
  };
}

export function formatReport(res) {
  const out = [];
  if (!res.ok) {
    out.push(`  官方日志拉取失败（${res.error || '未知原因'}），跳过冲突检查`);
    return out.join('\n');
  }
  out.push(`  官方 v${res.version} 日志${res.cached ? '（缓存）' : ''}：${res.conflicts.length ? res.conflicts.length + ' 项疑似官方已实现' : '没有命中任何补丁功能'}`);
  if (res.missing && res.missing.length) out.push(`  （有 ${res.missing.length} 个版本日志没拉到，结果可能不全）`);
  for (const r of res.results) {
    if (!r.hits.length) continue;
    out.push(`  ⚠️ ${r.key}  ${r.name}`);
    for (const h of r.hits.slice(0, 3)) {
      out.push(`     · ${h.length > 150 ? h.slice(0, 150) + '…' : h}`);
    }
    out.push(`     → 确认官方是否已覆盖；是就重跑：node apply-patch.mjs --skip=${r.key} --write`);
  }
  return out.join('\n');
}

// 从安装目录的 app.asar 里读版本（与 apply-patch.mjs 的定位方式一致：LOCALAPPDATA 下的 @opencode-aidesktop）
export function installedVersion() {
  const root = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const res = path.join(root, 'Programs', '@opencode-aidesktop', 'resources');
  const asar = path.join(res, 'app.asar');
  if (!fs.existsSync(asar)) return null;
  const buf = fs.readFileSync(asar);
  const hn = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + hn).toString('utf8'));
  const node = header.files && header.files['package.json'];
  if (!node || !node.offset) return null;
  const start = 16 + hn + Number(node.offset);
  const pkg = JSON.parse(buf.subarray(start, start + node.size).toString('utf8'));
  return pkg.version || null;
}

// ---- CLI ----
if (process.argv[1] && path.basename(process.argv[1]) === 'check-upstream.mjs') {
  const argVer = (() => { const i = process.argv.indexOf('--version'); return i >= 0 ? process.argv[i + 1] : null; })();
  const argSince = (() => { const i = process.argv.indexOf('--since'); return i >= 0 ? process.argv[i + 1] : null; })();
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const force = process.argv.includes('--force');

  const ver = argVer || installedVersion();
  if (!ver) {
    console.error('没拿到版本号：用 --version <x.y.z> 指定');
    process.exit(2);
  }

  const res = argSince ? checkUpstreamRange(versionsBetween(argSince, ver), { force }) : checkUpstream(ver, { force });
  if (json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`官方日志检查 · opencode ${ver}`);
    console.log(formatReport(res));
  }
  process.exit(strict && res.conflicts.length ? 1 : 0);
}
