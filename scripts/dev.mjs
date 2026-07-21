import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const helperServer = path.join(projectRoot, "source-finder", "helper_server.mjs");
const nextArguments = [nextCli, "dev", ...process.argv.slice(2)];

const processes = [
  spawn(process.execPath, [helperServer], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }),
  spawn(process.execPath, nextArguments, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }),
];

let shuttingDown = false;
let exitCode = 0;
let runningProcesses = processes.length;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error("개발 서버를 시작하지 못했습니다.", error);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    runningProcesses -= 1;
    if (!shuttingDown) {
      const reason = signal ? `신호 ${signal}` : `종료 코드 ${code ?? 1}`;
      console.error(`개발 서버 하나가 종료되었습니다 (${reason}). 나머지 서버도 종료합니다.`);
      shutdown(code ?? 1);
    }
    if (runningProcesses === 0) process.exit(exitCode);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
