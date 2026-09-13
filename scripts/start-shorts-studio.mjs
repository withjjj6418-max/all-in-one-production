import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function ensureShortsStudio() {
  try {
    const response = await fetch("http://127.0.0.1:8791/api/state", { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    if (response.ok && data.doctor && Array.isArray(data.projects)) {
      console.log("[독백 제작실] 실행 중인 서버를 사용합니다.");
      return;
    }
  } catch { /* Start the existing launcher when the studio is unavailable. */ }
  const home = os.homedir();
  const workspace = process.env.SHORTS_STUDIO_ROOT || path.join(home, "Dropbox", "03.해짜-자동생성");
  const launcher = path.join(workspace, "pipeline", "start_studio.py");
  const bundledPython = path.join(home, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  const python = process.env.SHORTS_STUDIO_PYTHON || (existsSync(bundledPython) ? bundledPython : "python");
  if (!existsSync(launcher)) throw new Error(`제작실 시작 파일을 찾을 수 없습니다: ${launcher}`);
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-X", "utf8", launcher], { cwd: workspace, windowsHide: true, stdio: "inherit", timeout: 25000 });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`제작실 시작 실패 (${code})`)));
  });
  console.log("[독백 제작실] 준비 완료: http://127.0.0.1:3000/studio/shorts-workshop/script");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureShortsStudio().catch(error => { console.error(error.message); process.exitCode = 1; });
}
