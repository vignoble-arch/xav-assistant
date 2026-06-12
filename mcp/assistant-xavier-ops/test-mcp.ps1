param(
  [string]$NodeCommand = "node"
)

$ErrorActionPreference = "Stop"

$serverPath = Join-Path $PSScriptRoot "server.js"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $serverPath)) {
  throw "Serveur MCP introuvable : $serverPath"
}

$testScript = @'
const { spawn } = require("child_process");
const server = process.argv[2];
const child = spawn(process.argv[0], [server], {
  cwd: process.env.PROJECT_ROOT,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = Buffer.alloc(0);
const timer = setTimeout(() => {
  console.error("Timeout : le serveur MCP ne repond pas.");
  child.kill();
  process.exit(1);
}, 8000);

function send(id, method, params) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function sendPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

function drain() {
  while (true) {
    if (buffer.length && !buffer.slice(0, 32).toString("utf8").toLowerCase().startsWith("content-length:")) {
      const newline = buffer.indexOf(10);
      if (newline === -1) return;
      const raw = buffer.slice(0, newline).toString("utf8").trim();
      buffer = buffer.slice(newline + 1);
      if (!raw) continue;
      handleResponse(JSON.parse(raw));
      continue;
    }

    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = buffer.slice(0, headerEnd).toString("utf8");
    const length = Number(header.match(/content-length:\s*(\d+)/i)?.[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;

    if (!length || buffer.length < bodyEnd) return;

    const response = JSON.parse(buffer.slice(bodyStart, bodyEnd).toString("utf8"));
    buffer = buffer.slice(bodyEnd);

    handleResponse(response);
  }
}

function handleResponse(response) {
  if (response.id === 2) {
    clearTimeout(timer);
    const tools = response.result.tools.map((tool) => tool.name);
    console.log(JSON.stringify({ ok: true, tools }, null, 2));
    child.kill();
  }
}

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("error", (error) => {
  clearTimeout(timer);
  console.error(error.message);
  process.exit(1);
});

send(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "assistant-xavier-ops-test", version: "0" },
});
sendPayload([
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
]);
'@

$tempScript = Join-Path $env:TEMP "assistant-xavier-ops-test.js"
Set-Content -Path $tempScript -Value $testScript -Encoding UTF8

$env:PROJECT_ROOT = $projectRoot
$env:VPS_HOST = if ($env:VPS_HOST) { $env:VPS_HOST } else { "51.210.244.28" }
$env:VPS_USER = if ($env:VPS_USER) { $env:VPS_USER } else { "ubuntu" }
$env:VPS_PATH = if ($env:VPS_PATH) { $env:VPS_PATH } else { "/opt/assistant-xavier" }
$env:APP_URL = if ($env:APP_URL) { $env:APP_URL } else { "https://vps-b6bb35e6.vps.ovh.net" }

& $NodeCommand $tempScript $serverPath
