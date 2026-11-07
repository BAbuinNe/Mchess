import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const children = ["dev:server", "dev:web"].map(script => {
  const child = spawn(command, ["run", script], { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", code => {
    if (code && !stopping) {
      console.error(`${script} завершился с кодом ${code}`);
      stop();
    }
  });
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
