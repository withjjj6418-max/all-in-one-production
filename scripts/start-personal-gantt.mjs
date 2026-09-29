import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../personal-gantt/', import.meta.url));
const url = 'http://127.0.0.1:5186';
async function isRunning() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok || !(await response.text()).includes('나의 작업실')) throw new Error('Port 5186 is occupied by a different application.');
    return true;
  } catch (error) {
    if (error.message.includes('occupied')) throw error;
    return false;
  }
}
export async function ensurePersonalGantt() {
  if (await isRunning()) return;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../personal-gantt/server.mjs', import.meta.url))], {
    cwd: root, detached: true, windowsHide: true, stdio: 'ignore',
  });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  child.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (spawnError) throw spawnError;
    await new Promise(resolve => setTimeout(resolve, 200));
    if (await isRunning()) return;
  }
  throw new Error('개인 일정 서버를 시작하지 못했습니다. personal-gantt/시작.cmd를 실행해주세요.');
}
