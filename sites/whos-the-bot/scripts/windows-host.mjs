// Repair missing host metadata for local Windows tooling; not used by the Worker.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.platform === "win32") {
  process.env.ComSpec ||= path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  const key = Object.keys(process.env).find(key => key.toLowerCase() === "path") || "PATH";
  const gitBin = path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin");
  const bashPath = existsSync(path.join(gitBin, "bash.exe")) ? gitBin + path.delimiter : "";
  process.env[key] = fileURLToPath(new URL("./host-bin/", import.meta.url)) + path.delimiter + path.dirname(process.execPath) + path.delimiter + bashPath + (process.env[key] || "");
  process.env.WTB_NPM_CLI = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  process.env.npm_execpath ||= process.env.WTB_NPM_CLI;
}
