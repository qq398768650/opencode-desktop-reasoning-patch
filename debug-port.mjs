// debug-port.mjs — 挑一个可用的远程调试口（apply-patch.mjs / restart.mjs 共用）
//
// 为什么不能写死 9222：Windows 上 Hyper-V / WSL / Docker 会占用一段 TCP 保留端口
// （netsh interface ipv4 show excludedportrange protocol=tcp 能看到），9222 有时正好落在里面，
// Electron 传了 --remote-debugging-port=9222 也绑不上，而且**不报错**，verify 只会说「连不上调试口」。
import { execSync } from 'node:child_process';

export function excludedRanges() {
  try {
    const out = execSync('netsh interface ipv4 show excludedportrange protocol=tcp', { encoding: 'utf8', windowsHide: true });
    return [...out.matchAll(/^\s*(\d+)\s+(\d+)\s*\*?\s*$/gm)].map((m) => [+m[1], +m[2]]);
  } catch { return []; }
}

let netstatCache = null;
export function portInUse(port) {
  try {
    if (netstatCache === null) netstatCache = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true });
    return new RegExp(':' + port + '\\s+.*LISTENING', 'i').test(netstatCache);
  } catch { return false; }
}

// 优先级：--port 参数 > OC_DEBUG_PORT 环境变量 > 从 9222 往后自动找（跳过系统保留/已占用）
export function pickPort(argv = process.argv) {
  const i = argv.indexOf('--port');
  const asked = i >= 0 ? Number(argv[i + 1]) : Number(process.env.OC_DEBUG_PORT || 0);
  const ranges = excludedRanges();
  const blocked = (p) => ranges.some(([a, b]) => p >= a && p <= b) || portInUse(p);
  if (asked) {
    if (!blocked(asked)) return asked;
    console.log(`调试口 ${asked} 被系统保留或已占用，自动换一个`);
  }
  for (let p = 9222; p < 9400; p++) if (!blocked(p)) return p;
  return 9222;
}
