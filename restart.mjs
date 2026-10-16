// restart.mjs — 完全退出 opencode 桌面端再重开（带远程调试口，供 verify.mjs 用）
// 用法: node restart.mjs [--port 9222]
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i >= 0 ? process.argv[i + 1] : '9222';
})();

function findInstall() {
  const programs = path.join(process.env.LOCALAPPDATA, 'Programs');
  const hits = [];
  for (const d of fs.readdirSync(programs)) {
    const dir = path.join(programs, d);
    if (fs.existsSync(path.join(dir, 'OpenCode.exe')) && fs.existsSync(path.join(dir, 'resources', 'app.asar'))) hits.push(dir);
  }
  if (!hits.length) throw new Error('没找到 opencode 桌面端安装目录');
  return hits[0];
}

const dir = findInstall();
const exe = path.join(dir, 'OpenCode.exe');
console.log('安装目录:', dir);

function running() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq OpenCode.exe" /NH', { encoding: 'utf8', windowsHide: true });
    return /OpenCode\.exe/i.test(out);
  } catch { return false; }
}

if (running()) {
  console.log('关闭桌面端…');
  try { execSync('taskkill /IM OpenCode.exe /F', { stdio: 'ignore', windowsHide: true }); } catch { /* 已经没了 */ }
  const t0 = Date.now();
  while (running() && Date.now() - t0 < 30000) execSync('ping -n 1 127.0.0.1 > NUL', { windowsHide: true });
  if (running()) throw new Error('OpenCode.exe 没退干净，请手动退出');
  console.log('已退出');
}

const p = spawn(exe, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' });
p.unref();
console.log('已启动 pid', p.pid, '调试口 127.0.0.1:' + PORT);
