#!/usr/bin/env node
"use strict";

const { execFile } = require("child_process");
const https = require("https");
const path = require("path");
const fs = require("fs");

const SERVER_NAME = "assistant-xavier-ops";
const SERVER_VERSION = "0.1.0";
const LOG_FILE = path.join(__dirname, "mcp-start.log");

const config = {
  projectRoot: process.env.PROJECT_ROOT || path.resolve(__dirname, "../.."),
  vpsHost: process.env.VPS_HOST || "51.210.244.28",
  vpsUser: process.env.VPS_USER || "ubuntu",
  vpsPath: process.env.VPS_PATH || "/opt/assistant-xavier",
  appUrl: (process.env.APP_URL || "https://vps-b6bb35e6.vps.ovh.net").replace(/\/$/, ""),
  assistantUser: process.env.ASSISTANT_USER || "",
  assistantPassword: process.env.ASSISTANT_PASSWORD || "",
};

writeLog("startup", {
  server: SERVER_NAME,
  version: SERVER_VERSION,
  projectRoot: config.projectRoot,
  vpsHost: config.vpsHost,
  vpsUser: config.vpsUser,
  vpsPath: config.vpsPath,
  appUrl: config.appUrl,
  hasAssistantUser: Boolean(config.assistantUser),
  hasAssistantPassword: Boolean(config.assistantPassword),
});

const tools = [
  {
    name: "app_health",
    description: "Verifie que l'application Assistant Xavier repond en HTTPS.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "config_summary",
    description: "Affiche la configuration MCP lue, sans reveler les secrets.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "check_google_sync",
    description: "Lit le statut de synchronisation Google expose par l'application.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "vps_status",
    description: "Controle l'application, la synchronisation, Docker et l'espace disque du VPS.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "read_logs",
    description: "Lit les logs Docker du VPS pour un service autorise.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: ["assistant", "caddy", "postgres", "qdrant", "all"],
          default: "assistant",
        },
        tail: {
          type: "number",
          minimum: 10,
          maximum: 500,
          default: 120,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "restart_vps",
    description: "Relance la stack Docker publique sur le VPS sans redeployer les fichiers.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "deploy_vps",
    description: "Deploie les fichiers locaux vers le VPS puis reconstruit et relance Docker.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "backup_vps",
    description: "Lance une sauvegarde du VPS et copie les archives dans le dossier local OneDrive.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const handlers = {
  config_summary: async () => {
    return {
      projectRoot: config.projectRoot,
      vpsHost: config.vpsHost,
      vpsUser: config.vpsUser,
      vpsPath: config.vpsPath,
      appUrl: config.appUrl,
      hasAssistantUser: Boolean(config.assistantUser),
      hasAssistantPassword: Boolean(config.assistantPassword),
    };
  },
  app_health: async () => {
    return requestJson("/api/health");
  },
  check_google_sync: async () => {
    return requestJson("/api/sync/status");
  },
  vps_status: async () => {
    return runPowerShellScript("ops\\vps-status.ps1");
  },
  read_logs: async (args = {}) => {
    const service = ["assistant", "caddy", "postgres", "qdrant", "all"].includes(args.service)
      ? args.service
      : "assistant";
    const tail = clampNumber(args.tail, 120, 10, 500);
    const serviceArg = service === "all" ? "" : ` ${service}`;
    return runSsh(`cd '${config.vpsPath}' && docker compose logs --tail ${tail}${serviceArg}`);
  },
  restart_vps: async () => {
    return runSsh(`cd '${config.vpsPath}' && docker compose --profile public up -d`);
  },
  deploy_vps: async () => {
    const deploy = await runPowerShellScript("ops\\deploy-vps.ps1");
    const restart = await runSsh(`cd '${config.vpsPath}' && docker compose --profile public up -d --build`);
    return `${deploy}\n\n--- Relance Docker ---\n${restart}`;
  },
  backup_vps: async () => {
    return runPowerShellScript("ops\\pull-vps-backup.ps1");
  },
};

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  drainInput();
});

process.stdin.on("end", () => {
  process.exit(0);
});

function drainInput() {
  while (inputBuffer.length) {
    const parsed = tryParseContentLengthMessage();
    if (parsed === null) break;
    if (parsed) {
      handleMessage(parsed).catch((error) => {
        sendError(parsed.id ?? null, -32603, error.message);
      });
      continue;
    }

    const newline = inputBuffer.indexOf(10);
    if (newline === -1) break;
    const raw = inputBuffer.slice(0, newline).toString("utf8").trim();
    inputBuffer = inputBuffer.slice(newline + 1);
    if (!raw) continue;
    try {
      const message = JSON.parse(raw);
      handleMessage(message).catch((error) => {
        sendError(message.id ?? null, -32603, error.message);
      });
    } catch (error) {
      sendError(null, -32700, `Message JSON invalide: ${error.message}`);
    }
  }
}

function tryParseContentLengthMessage() {
  const marker = Buffer.from("\r\n\r\n");
  const headerEnd = inputBuffer.indexOf(marker);
  if (headerEnd === -1) {
    const startsLikeHeader = inputBuffer.slice(0, 32).toString("utf8").toLowerCase().startsWith("content-length:");
    return startsLikeHeader ? null : false;
  }

  const header = inputBuffer.slice(0, headerEnd).toString("utf8");
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) return false;

  const length = Number(match[1]);
  const bodyStart = headerEnd + marker.length;
  const bodyEnd = bodyStart + length;
  if (inputBuffer.length < bodyEnd) return null;

  const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
  inputBuffer = inputBuffer.slice(bodyEnd);
  return JSON.parse(body);
}

async function handleMessage(message) {
  if (Array.isArray(message)) {
    writeLog("batch", { count: message.length });
    for (const item of message) {
      await handleMessage(item);
    }
    return;
  }

  if (!message || typeof message !== "object") {
    return sendError(null, -32600, "Message MCP invalide.");
  }

  if (message.error) {
    writeLog("client/error", {
      id: message.id ?? null,
      error: message.error,
    });
    return;
  }

  if (message.result) {
    writeLog("client/result", {
      id: message.id ?? null,
      keys: Object.keys(message.result),
    });
    return;
  }

  if (message.method === "initialize") {
    const requestedProtocolVersion = message.params?.protocolVersion || "2024-11-05";
    writeLog("initialize", {
      id: message.id,
      requestedProtocolVersion,
      clientInfo: message.params?.clientInfo || null,
    });
    return sendResult(message.id, {
      protocolVersion: requestedProtocolVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    });
  }

  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "ping") {
    return sendResult(message.id, {});
  }

  if (message.method === "resources/list") {
    writeLog("resources/list", { id: message.id, count: 0 });
    return sendResult(message.id, { resources: [] });
  }

  if (message.method === "prompts/list") {
    writeLog("prompts/list", { id: message.id, count: 0 });
    return sendResult(message.id, { prompts: [] });
  }

  if (message.method === "tools/list") {
    writeLog("tools/list", { id: message.id, count: tools.length });
    return sendResult(message.id, { tools });
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const handler = handlers[name];
    if (!handler) {
      return sendError(message.id, -32602, `Outil inconnu: ${name}`);
    }

    try {
      writeLog("tools/call", { id: message.id, name });
      const output = await handler(args);
      return sendResult(message.id, {
        content: [
          {
            type: "text",
            text: typeof output === "string" ? output : JSON.stringify(output, null, 2),
          },
        ],
      });
    } catch (error) {
      writeLog("tools/error", { id: message.id, name, error: formatError(error) });
      return sendResult(message.id, {
        isError: true,
        content: [
          {
            type: "text",
            text: formatError(error),
          },
        ],
      });
    }
  }

  if (message.id !== undefined) {
    writeLog("unknown/request", { id: message.id, method: message.method || null });
    return sendError(message.id, -32601, `Methode non supportee: ${message.method}`);
  }

  writeLog("unknown/notification", {
    method: message.method || null,
    keys: Object.keys(message),
  });
}

function sendResult(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function requestJson(endpoint) {
  const url = new URL(endpoint, config.appUrl);
  const headers = {};
  if (config.assistantUser && config.assistantPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${config.assistantUser}:${config.assistantPassword}`).toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, timeout: 20_000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 1000)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Delai depasse pendant l'appel HTTPS."));
    });
    request.on("error", (error) => {
      reject(new Error(`Erreur HTTPS vers ${url.href}: ${formatError(error)}`));
    });
  });
}

function runPowerShellScript(relativePath) {
  const scriptPath = path.join(config.projectRoot, relativePath);
  return runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ], { cwd: config.projectRoot, timeoutMs: 10 * 60_000 });
}

function runSsh(remoteCommand) {
  const target = `${config.vpsUser}@${config.vpsHost}`;
  return runCommand("ssh", [target, remoteCommand], { cwd: config.projectRoot, timeoutMs: 5 * 60_000 });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd || config.projectRoot,
      timeout: options.timeoutMs || 120_000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      if (error) {
        reject(new Error(`${command} a echoue (${error.code || error.signal || "erreur"}):\n${output || formatError(error)}`));
        return;
      }
      resolve(output || "Commande terminee sans sortie.");
    });
  });
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function formatError(error) {
  if (!error) return "Erreur inconnue.";
  if (typeof error === "string") return error || "Erreur inconnue.";
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error) || "Erreur inconnue.";
  }
}

function writeLog(event, payload = {}) {
  try {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      event,
      ...payload,
    });
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // Le MCP ne doit jamais echouer juste parce que le journal est inaccessible.
  }
}
