const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL, URLSearchParams } = require("url");
const { randomUUID, timingSafeEqual } = require("crypto");

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const RUNTIME_ENV_FILE = path.join(DATA_DIR, "runtime.env");
loadEnvFile(RUNTIME_ENV_FILE, true);

const STATE_FILE = path.join(DATA_DIR, "app-state.json");
const TOKENS_FILE = path.join(DATA_DIR, "google-tokens.json");
const AI_MEMORY_FILE = path.join(DATA_DIR, "ai-memory.json");
const AI_USAGE_FILE = path.join(DATA_DIR, "ai-usage.json");
const SYNC_STATUS_FILE = path.join(DATA_DIR, "sync-status.json");
const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge");
const KNOWLEDGE_FILE = path.join(DATA_DIR, "knowledge-documents.json");
const AUTO_SYNC_INTERVAL_MINUTES = Math.max(5, Number(process.env.AUTO_SYNC_INTERVAL_MINUTES || 15));

const GOOGLE_SCOPES = {
  gmail: ["https://www.googleapis.com/auth/gmail.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.readonly"],
  drive: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  tasks: ["https://www.googleapis.com/auth/tasks.readonly"],
};

const OPENAI_MODEL_PRICES = {
  "gpt-5.4-nano": { input: 0.20, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.50 },
  "gpt-5.4": { input: 2.50, output: 15.00 },
  "gpt-5.5": { input: 5.00, output: 30.00 },
};

const TASK_LISTS = ["Dettes", "Cave Expé", "vignoble", "bureau", "divers et perso"];

const GOOGLE_SERVICES = ["gmail", "calendar", "drive", "tasks"];

const CONFIG_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "PORT",
  "DATA_DIR",
  "ASSISTANT_USER",
  "ASSISTANT_PASSWORD",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "OPENAI_API_KEY",
  "LM_STUDIO_BASE_URL",
  "LM_STUDIO_MODEL",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const seedState = {
  tasks: [
    {
      id: randomUUID(),
      title: "Valider le perimetre de la V0.1",
      status: "En cours",
      priority: "Importante",
      list: "bureau",
      source: "manuel",
      due: todayISO(),
    },
    {
      id: randomUUID(),
      title: "Lister les dossiers autorises",
      status: "A faire",
      priority: "Normale",
      list: "bureau",
      source: "Drive",
      due: addDaysISO(2),
    },
    {
      id: randomUUID(),
      title: "Revoir l'organisation personnelle",
      status: "A faire",
      priority: "Faible",
      list: "divers et perso",
      source: "liste",
      due: addDaysISO(1),
    },
  ],
  inbox: [
    {
      id: randomUUID(),
      title: "Email client transfere a traiter",
      type: "Email",
      source: "Gmail mock",
      excerpt: "Demande a relire puis transformer en action si necessaire.",
      createdAt: new Date().toISOString(),
    },
  ],
  reminders: [
    {
      id: randomUUID(),
      title: "Faire le point sur le nom de l'application",
      due: todayISO(),
      source: "roadmap",
    },
    {
      id: randomUUID(),
      title: "Verifier les informations Google OAuth",
      due: addDaysISO(3),
      source: "Google",
    },
  ],
  notes: [
    {
      id: randomUUID(),
      title: "Principe produit",
      body: "Si le systeme comprend, il cree. Si c'est ambigu, il met dans l'Inbox. Rien ne doit etre perdu.",
      category: "Produit",
      createdAt: new Date().toISOString(),
    },
    {
      id: randomUUID(),
      title: "Ambiance UI",
      body: "Cockpit calme, clair, actionnable. Eviter l'effet SaaS generique ou CRM lourd.",
      category: "Design",
      createdAt: new Date().toISOString(),
    },
  ],
  lists: {
    Dettes: [],
    "Cave Expé": [],
    vignoble: [],
    bureau: [],
    "divers et perso": [],
  },
  agenda: [
    { id: randomUUID(), time: "09:00", title: "Revue du dashboard V0.1" },
    { id: randomUUID(), time: "14:30", title: "Point architecture Google OAuth" },
  ],
  mail: [
    { id: randomUUID(), title: "3 emails importants", source: "Gmail mock", detail: "A ouvrir quand la connexion Gmail sera active." },
    { id: randomUUID(), title: "1 email non lu a qualifier", source: "Gmail mock", detail: "Peut devenir une tache ou rester dans l'Inbox." },
  ],
  reports: [
    {
      id: randomUUID(),
      title: "Assistant Xavier V0.1",
      status: "En cours",
      progress: 35,
      summary: "Base locale creee : dashboard, taches, Inbox, notes, listes et assistant texte.",
    },
    {
      id: randomUUID(),
      title: "Preparation Google V0.2",
      status: "A cadrer",
      progress: 10,
      summary: "Decider les labels Gmail, calendriers et dossiers autorises.",
    },
    {
      id: randomUUID(),
      title: "Architecture serveur",
      status: "A venir",
      progress: 5,
      summary: "Choisir hebergeur, domaine, backend et sauvegardes.",
    },
  ],
};

ensureDataFiles();

let googleSyncInProgress = false;

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname !== "/api/health" && !isAuthorized(req)) {
      return requestAuthentication(res);
    }

    if (requestUrl.pathname === "/api/state" && req.method === "GET") {
      return sendJson(res, readJson(STATE_FILE, seedState));
    }

    if (requestUrl.pathname === "/api/morning-brief" && req.method === "GET") {
      return sendJson(res, buildMorningBrief(readJson(STATE_FILE, seedState)));
    }

    if (requestUrl.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, {
        ok: true,
        app: "Assistant Xavier",
        time: new Date().toISOString(),
      });
    }

    if (requestUrl.pathname === "/api/state" && req.method === "PUT") {
      const nextState = await readBody(req);
      writeJson(STATE_FILE, nextState);
      return sendJson(res, { ok: true });
    }

    if (requestUrl.pathname === "/api/reset" && req.method === "POST") {
      writeJson(STATE_FILE, seedState);
      return sendJson(res, readJson(STATE_FILE, seedState));
    }

    if (requestUrl.pathname === "/api/connections" && req.method === "GET") {
      return sendJson(res, getConnectionStatus());
    }

    if (requestUrl.pathname === "/api/debug/google" && req.method === "GET") {
      return sendJson(res, getGoogleDebugInfo());
    }

    if (requestUrl.pathname === "/api/debug/google-tasks" && req.method === "GET") {
      return await sendGoogleTasksDebug(res);
    }

    if (requestUrl.pathname === "/api/debug/google-calendar" && req.method === "GET") {
      return await sendGoogleCalendarDebug(res);
    }

    if (requestUrl.pathname === "/api/sync/status" && req.method === "GET") {
      return sendJson(res, getSyncStatus());
    }

    if (requestUrl.pathname === "/api/system/status" && req.method === "GET") {
      return sendJson(res, await getSystemStatus());
    }

    if (requestUrl.pathname === "/api/config/google" && req.method === "GET") {
      return sendJson(res, getGoogleConfigStatus());
    }

    if (requestUrl.pathname === "/api/config/google" && req.method === "PUT") {
      const config = await readBody(req);
      saveGoogleConfig(config);
      return sendJson(res, getGoogleConfigStatus());
    }

    if (requestUrl.pathname === "/api/config/ai" && req.method === "GET") {
      return sendJson(res, getAiConfigStatus());
    }

    if (requestUrl.pathname === "/api/config/ai" && req.method === "PUT") {
      const config = await readBody(req);
      saveAiConfig(config);
      return sendJson(res, getAiConfigStatus());
    }

    if (requestUrl.pathname === "/api/ai/status" && req.method === "GET") {
      return await sendAiStatus(res);
    }

    if (requestUrl.pathname === "/api/ai/chat" && req.method === "POST") {
      const body = await readBody(req);
      return await sendAiChat(body, res);
    }

    if (requestUrl.pathname === "/api/ai/memory" && req.method === "GET") {
      return sendJson(res, getAiMemoryStatus());
    }

    if (requestUrl.pathname === "/api/ai/memory" && req.method === "DELETE") {
      writeJson(AI_MEMORY_FILE, { exchanges: [] });
      return sendJson(res, getAiMemoryStatus());
    }

    if (requestUrl.pathname === "/api/knowledge" && req.method === "GET") {
      return sendJson(res, getKnowledgeStatus());
    }

    if (requestUrl.pathname === "/api/knowledge/upload" && req.method === "POST") {
      return await uploadKnowledgeDocument(req, res);
    }

    if (requestUrl.pathname === "/api/knowledge" && req.method === "DELETE") {
      return deleteKnowledgeDocument(requestUrl, res);
    }

    if (requestUrl.pathname === "/api/ai/usage" && req.method === "GET") {
      return sendJson(res, getAiUsageSummary());
    }

    if (requestUrl.pathname === "/auth/google/start" && req.method === "GET") {
      return startGoogleAuth(requestUrl, res);
    }

    if (requestUrl.pathname === "/auth/google/callback" && req.method === "GET") {
      return await handleGoogleCallback(requestUrl, res);
    }

    if (requestUrl.pathname === "/api/google/sync" && req.method === "POST") {
      return await syncGoogle(requestUrl, res);
    }

    if (requestUrl.pathname === "/api/google/sync-all" && req.method === "POST") {
      return await syncAllGoogle(res);
    }

    if (requestUrl.pathname === "/api/google/disconnect" && req.method === "POST") {
      return await disconnectGoogle(req, res);
    }

    return serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: "Erreur serveur locale.", detail: error.message }, 500);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est deja utilise.`);
    console.error(`L'application est probablement deja ouverte sur http://127.0.0.1:${PORT}`);
    console.error("Ferme l'ancien serveur avec Ctrl+C, ou lance avec un autre port :");
    console.error("  $env:PORT=4174; powershell -ExecutionPolicy Bypass -File .\\start-local.ps1");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, () => {
  console.log(`Assistant Xavier disponible sur http://127.0.0.1:${PORT}`);
  scheduleGoogleAutoSync();
});

function startGoogleAuth(requestUrl, res) {
  const service = requestUrl.searchParams.get("service") || "all";
  const config = getGoogleConfig();
  if (!config.ready) {
    return redirect(res, `/index.html?connection=missing-config&service=${encodeURIComponent(service)}`);
  }

  const scopes = service === "all"
    ? Object.values(GOOGLE_SCOPES).flat()
    : GOOGLE_SCOPES[service];

  if (!scopes) {
    return sendJson(res, { error: "Service Google inconnu." }, 400);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: service,
  });

  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function handleGoogleCallback(requestUrl, res) {
  const code = requestUrl.searchParams.get("code");
  const service = requestUrl.searchParams.get("state") || "all";
  const config = getGoogleConfig();
  if (!code || !config.ready) {
    return redirect(res, "/index.html?connection=failed");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google OAuth a refuse la connexion: ${detail}`);
  }

  const tokenPayload = await response.json();
  const tokens = readJson(TOKENS_FILE, {});
  const services = service === "all" ? Object.keys(GOOGLE_SCOPES) : [service];
  services.forEach((name) => {
    tokens[name] = {
      ...tokenPayload,
      connectedAt: new Date().toISOString(),
      expiresAt: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
    };
  });
  writeJson(TOKENS_FILE, tokens);
  redirect(res, "/index.html?connection=success");
}

async function syncGoogle(requestUrl, res) {
  const service = requestUrl.searchParams.get("service");
  if (!GOOGLE_SERVICES.includes(service)) {
    return sendJson(res, { error: "Service Google inconnu." }, 400);
  }

  const tokens = readJson(TOKENS_FILE, {});
  if (!tokens[service]) {
    return sendJson(res, { error: "Connexion non active.", service }, 409);
  }

  const state = readJson(STATE_FILE, seedState);
  if (service === "gmail") {
    state.mail = await fetchGmail(tokens.gmail, service);
  }
  if (service === "calendar") {
    state.agenda = await fetchCalendar(tokens.calendar, service);
  }
  if (service === "drive") {
    const driveItems = await fetchDriveInbox(tokens.drive, service);
    state.inbox = mergeInboxBySourceId(driveItems, state.inbox);
  }
  if (service === "tasks") {
    const googleTasks = await fetchGoogleTasks(tokens.tasks, service);
    state.tasks = mergeTasksBySourceId(googleTasks, state.tasks);
  }
  writeJson(STATE_FILE, state);
  sendJson(res, state);
}

async function syncAllGoogle(res) {
  const payload = await performGoogleSync({ mode: "manual" });
  sendJson(res, payload);
}

async function performGoogleSync({ mode = "auto" } = {}) {
  if (googleSyncInProgress) {
    return {
      state: readJson(STATE_FILE, seedState),
      results: {},
      errors: { global: "Synchronisation deja en cours." },
      status: getSyncStatus(),
    };
  }

  googleSyncInProgress = true;
  const startedAt = new Date().toISOString();
  updateSyncStatus({
    inProgress: true,
    lastMode: mode,
    lastStartedAt: startedAt,
  });

  const tokens = readJson(TOKENS_FILE, {});
  const state = readJson(STATE_FILE, seedState);
  const results = {};
  const errors = {};

  try {
    if (tokens.gmail) {
      try {
        state.mail = await fetchGmail(tokens.gmail, "gmail");
        results.gmail = state.mail.length;
      } catch (error) {
        errors.gmail = error.message;
      }
    }
    if (tokens.calendar) {
      try {
        state.agenda = await fetchCalendar(tokens.calendar, "calendar");
        results.calendar = state.agenda.length;
      } catch (error) {
        errors.calendar = error.message;
      }
    }
    if (tokens.drive) {
      try {
        const driveItems = await fetchDriveInbox(tokens.drive, "drive");
        state.inbox = mergeInboxBySourceId(driveItems, state.inbox);
        results.drive = driveItems.length;
      } catch (error) {
        errors.drive = error.message;
      }
    }
    if (tokens.tasks) {
      try {
        const googleTasks = await fetchGoogleTasks(tokens.tasks, "tasks");
        state.tasks = mergeTasksBySourceId(googleTasks, state.tasks);
        results.tasks = googleTasks.length;
      } catch (error) {
        errors.tasks = error.message;
      }
    }

    writeJson(STATE_FILE, state);
    const finishedAt = new Date().toISOString();
    const status = updateSyncStatus({
      inProgress: false,
      lastMode: mode,
      lastStartedAt: startedAt,
      lastFinishedAt: finishedAt,
      lastResults: results,
      lastErrors: errors,
      lastTokenServices: Object.keys(tokens).filter((service) => tokens[service]),
    });

    return { state, results, errors, status };
  } finally {
    googleSyncInProgress = false;
  }
}

function scheduleGoogleAutoSync() {
  setTimeout(() => {
    runAutoGoogleSync();
  }, 30_000);

  setInterval(() => {
    runAutoGoogleSync();
  }, AUTO_SYNC_INTERVAL_MINUTES * 60_000);
}

async function runAutoGoogleSync() {
  const tokens = readJson(TOKENS_FILE, {});
  const activeServices = GOOGLE_SERVICES.filter((service) => tokens[service]);
  if (!activeServices.length) return;

  try {
    const payload = await performGoogleSync({ mode: "auto" });
    const errorCount = Object.keys(payload.errors || {}).length;
    console.log(`Synchro Google auto terminee : ${JSON.stringify(payload.results)}${errorCount ? `, erreurs: ${errorCount}` : ""}`);
  } catch (error) {
    updateSyncStatus({
      inProgress: false,
      lastMode: "auto",
      lastFinishedAt: new Date().toISOString(),
      lastErrors: { global: error.message },
    });
    console.error(`Synchro Google auto impossible : ${error.message}`);
  }
}

function getSyncStatus() {
  return {
    ...readJson(SYNC_STATUS_FILE, {
      inProgress: false,
      lastMode: "",
      lastStartedAt: "",
      lastFinishedAt: "",
      lastResults: {},
      lastErrors: {},
      lastTokenServices: [],
    }),
    inProgress: googleSyncInProgress,
    autoSyncIntervalMinutes: AUTO_SYNC_INTERVAL_MINUTES,
  };
}

async function getSystemStatus() {
  const sync = getSyncStatus();
  const ai = getAiConfigStatus();
  const aiRuntime = await getAiRuntimeStatus(ai);
  const usage = getAiUsageSummary();
  const backup = getBackupStatus();
  const safety = getPublicRepoSafetyStatus();
  const syncErrors = Object.values(sync.lastErrors || {}).filter(Boolean);

  return {
    ok: true,
    app: {
      name: "Assistant Xavier",
      mode: process.env.NODE_ENV || "local",
      time: new Date().toISOString(),
      dataDir: DATA_DIR,
    },
    google: {
      ok: syncErrors.length === 0,
      inProgress: sync.inProgress,
      lastFinishedAt: sync.lastFinishedAt || "",
      intervalMinutes: sync.autoSyncIntervalMinutes,
      results: sync.lastResults || {},
      errors: sync.lastErrors || {},
      tokenServices: sync.lastTokenServices || [],
    },
    ai: {
      provider: ai.provider,
      model: ai.model || "",
      ready: ai.ready,
      online: aiRuntime.online,
      selectedModel: aiRuntime.selectedModel,
      availableModels: aiRuntime.models,
      error: aiRuntime.error,
      today: usage.today,
      month: usage.month,
    },
    backup,
    safety,
    updatedAt: new Date().toISOString(),
  };
}

async function getAiRuntimeStatus(config) {
  try {
    const models = await fetchAiModels(config);
    return {
      online: true,
      selectedModel: config.model || models[0] || "",
      models,
      error: "",
    };
  } catch (error) {
    return {
      online: false,
      selectedModel: config.model || "",
      models: [],
      error: error.message || "Moteur IA indisponible.",
    };
  }
}

function getBackupStatus() {
  const backupDir = path.join(ROOT, "backups");
  const files = listBackupFiles(backupDir);
  const latest = files[0] || null;
  return {
    directory: backupDir,
    count: files.length,
    latest,
    ok: Boolean(latest),
  };
}

function listBackupFiles(directory) {
  try {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(directory, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  } catch {
    return [];
  }
}

function getPublicRepoSafetyStatus() {
  const gitignorePath = path.join(ROOT, ".gitignore");
  const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  const requiredPatterns = [".env", ".env.production", "data/*.json", "*.log", "*.zip", "backups/"];
  const missingPatterns = requiredPatterns.filter((pattern) => !gitignore.includes(pattern));
  return {
    publicRepoReady: missingPatterns.length === 0,
    requiredPatterns,
    missingPatterns,
  };
}

function updateSyncStatus(patch) {
  const status = {
    ...getSyncStatus(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeJson(SYNC_STATUS_FILE, status);
  return status;
}

async function disconnectGoogle(req, res) {
  const body = await readBody(req);
  const service = body.service;
  const tokens = readJson(TOKENS_FILE, {});
  if (service === "all") {
    writeJson(TOKENS_FILE, {});
  } else {
    delete tokens[service];
    writeJson(TOKENS_FILE, tokens);
  }
  sendJson(res, getConnectionStatus());
}

async function fetchGmail(token, service) {
  const response = await googleFetch(token, service, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=newer_than:14d");
  const messages = response.messages || [];
  const details = await Promise.all(messages.map((message) => fetchGmailMessage(token, service, message.id)));
  return details.filter(Boolean);
}

async function fetchGmailMessage(token, service, messageId) {
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "Subject",
  });
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Date");
  const message = await googleFetch(token, service, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${params}`);
  const headers = Object.fromEntries((message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]));
  const subject = headers.subject || "(Sans objet)";
  const from = simplifySender(headers.from || "Expediteur inconnu");
  const date = headers.date ? new Date(headers.date) : null;
  return {
    id: message.id,
    title: subject,
    source: "Gmail",
    detail: `${from}${date && !Number.isNaN(date.valueOf()) ? ` - ${date.toLocaleDateString("fr-FR")}` : ""}${message.snippet ? ` - ${message.snippet}` : ""}`,
  };
}

async function fetchCalendar(token, service) {
  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + 30);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "30",
  });
  const response = await googleFetch(token, service, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
  return (response.items || []).map((event) => ({
    id: event.id,
    date: getEventDateKey(event.start),
    time: formatEventTime(event.start),
    title: event.summary || "Evenement sans titre",
  }));
}

async function fetchDriveInbox(token, service) {
  const folderId = await findDriveFolderId(token, service, "Assistant_A_Traiter");
  if (!folderId) return [];

  const params = new URLSearchParams({
    pageSize: "20",
    fields: "files(id,name,modifiedTime,webViewLink)",
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: "modifiedTime desc",
  });
  const response = await googleFetch(token, service, `https://www.googleapis.com/drive/v3/files?${params}`);
  return (response.files || []).map((file) => ({
    id: randomUUID(),
    sourceId: file.id,
    title: file.name,
    type: "Document",
    source: "Drive",
    excerpt: `Document recent modifie le ${new Date(file.modifiedTime).toLocaleDateString("fr-FR")}.`,
    createdAt: new Date().toISOString(),
    link: file.webViewLink,
  }));
}

async function fetchGoogleTasks(token, service) {
  const taskLists = await googleFetch(token, service, "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
  const allTasks = [];

  for (const taskList of taskLists.items || []) {
    const params = new URLSearchParams({
      maxResults: "100",
      showCompleted: "false",
      showDeleted: "false",
      showHidden: "false",
    });
    const response = await googleFetch(token, service, `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskList.id)}/tasks?${params}`);
    for (const task of response.items || []) {
      allTasks.push({
        id: `google-task-${task.id}`,
        sourceId: task.id,
        sourceListId: taskList.id,
        title: task.title || "Tache Google sans titre",
        status: task.status === "completed" ? "Termine" : "A faire",
        priority: "Normale",
        list: mapGoogleTaskList(taskList.title),
        source: "Google Tasks",
        due: task.due ? task.due.slice(0, 10) : "",
        notes: task.notes || "",
        updatedAt: task.updated || null,
      });
    }
  }

  return allTasks;
}

async function findDriveFolderId(token, service, folderName) {
  const params = new URLSearchParams({
    pageSize: "1",
    fields: "files(id,name)",
    q: `name = '${escapeDriveQueryValue(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  });
  const response = await googleFetch(token, service, `https://www.googleapis.com/drive/v3/files?${params}`);
  return response.files?.[0]?.id || null;
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mergeInboxBySourceId(incoming, existing) {
  const seen = new Set(existing.map((item) => item.sourceId).filter(Boolean));
  const fresh = incoming.filter((item) => !seen.has(item.sourceId));
  return [...fresh, ...existing];
}

function mergeTasksBySourceId(incoming, existing) {
  const localTasks = existing.filter((task) => task.source !== "Google Tasks");
  const seen = new Set();
  const cleanIncoming = incoming.filter((task) => {
    if (!task.sourceId) return true;
    if (seen.has(task.sourceId)) return false;
    seen.add(task.sourceId);
    return true;
  });
  return [...cleanIncoming, ...localTasks];
}

function mapGoogleTaskList(title) {
  const normalized = normalizeText(title);
  if (normalized.includes("dette")) return "Dettes";
  if (normalized.includes("cave") || normalized.includes("expe")) return "Cave Expé";
  if (normalized.includes("vigne") || normalized.includes("vignoble")) return "vignoble";
  if (normalized.includes("bureau")) return "bureau";
  if (normalized.includes("divers") || normalized.includes("perso")) return "divers et perso";
  return "divers et perso";
}

async function googleFetch(token, service, url) {
  const accessToken = await getValidAccessToken(token, service);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google API a refuse la demande: ${detail}`);
  }
  return response.json();
}

async function getValidAccessToken(token, service) {
  const expiresAt = Number(token.expiresAt || 0);
  const needsRefresh = token.refresh_token && expiresAt && Date.now() > expiresAt - 60_000;
  if (!needsRefresh) return token.access_token;

  const refreshed = await refreshGoogleToken(token.refresh_token);
  const tokens = readJson(TOKENS_FILE, {});
  tokens[service] = {
    ...tokens[service],
    ...refreshed,
    refresh_token: tokens[service].refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
  };
  writeJson(TOKENS_FILE, tokens);
  return tokens[service].access_token;
}

async function refreshGoogleToken(refreshToken) {
  const config = getGoogleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google OAuth n'a pas pu renouveler le jeton: ${detail}`);
  }
  return response.json();
}

function getConnectionStatus() {
  const config = getGoogleConfig();
  const tokens = readJson(TOKENS_FILE, {});
  return {
    googleConfigured: config.ready,
    redirectUri: config.redirectUri,
    services: Object.keys(GOOGLE_SCOPES).map((name) => ({
      id: name,
      label: name === "gmail" ? "Gmail" : name === "calendar" ? "Agenda" : name === "tasks" ? "Google Tasks" : "Drive",
      connected: Boolean(tokens[name]),
      connectedAt: tokens[name]?.connectedAt || null,
      scopes: GOOGLE_SCOPES[name],
    })),
  };
}

function getGoogleDebugInfo() {
  const tokens = readJson(TOKENS_FILE, {});
  const state = readJson(STATE_FILE, seedState);
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  return {
    stateFile: STATE_FILE,
    tokensFile: TOKENS_FILE,
    tokenServices: Object.keys(tokens),
    hasTasksToken: Boolean(tokens.tasks),
    tasksTokenHasReadonlyScope: Boolean(tokens.tasks?.scope?.includes("https://www.googleapis.com/auth/tasks.readonly")),
    taskCount: tasks.length,
    googleTaskCount: tasks.filter((task) => task.source === "Google Tasks").length,
    googleTaskLists: [...new Set(tasks.filter((task) => task.source === "Google Tasks").map((task) => task.list))],
  };
}

async function sendGoogleTasksDebug(res) {
  const tokens = readJson(TOKENS_FILE, {});
  if (!tokens.tasks) {
    return sendJson(res, {
      ok: false,
      error: "Google Tasks n'est pas connecte.",
      hasTasksToken: false,
    }, 409);
  }

  const taskListsResponse = await googleFetch(tokens.tasks, "tasks", "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
  const taskLists = taskListsResponse.items || [];
  const details = [];
  let totalOpenTasks = 0;

  for (const taskList of taskLists) {
    const params = new URLSearchParams({
      maxResults: "100",
      showCompleted: "false",
      showDeleted: "false",
      showHidden: "false",
    });
    const tasksResponse = await googleFetch(tokens.tasks, "tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskList.id)}/tasks?${params}`);
    const tasks = tasksResponse.items || [];
    totalOpenTasks += tasks.length;
    details.push({
      title: taskList.title,
      mappedList: mapGoogleTaskList(taskList.title),
      openTaskCount: tasks.length,
      sampleTasks: tasks.slice(0, 5).map((task) => ({
        title: task.title || "Tache sans titre",
        due: task.due ? task.due.slice(0, 10) : "",
        status: task.status || "",
      })),
    });
  }

  return sendJson(res, {
    ok: true,
    taskListCount: taskLists.length,
    totalOpenTasks,
    taskLists: details,
  });
}

async function sendGoogleCalendarDebug(res) {
  const tokens = readJson(TOKENS_FILE, {});
  const state = readJson(STATE_FILE, seedState);
  if (!tokens.calendar) {
    return sendJson(res, {
      ok: false,
      error: "Google Calendar n'est pas connecte.",
      hasCalendarToken: false,
      tokenServices: Object.keys(tokens),
    }, 409);
  }

  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + 30);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const response = await googleFetch(tokens.calendar, "calendar", `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
  const events = response.items || [];
  const agenda = Array.isArray(state.agenda) ? state.agenda : [];

  return sendJson(res, {
    ok: true,
    hasCalendarToken: true,
    calendarTokenHasReadonlyScope: Boolean(tokens.calendar?.scope?.includes("https://www.googleapis.com/auth/calendar.readonly")),
    tokenServices: Object.keys(tokens),
    serverAgendaCount: agenda.length,
    googleEventCountNext30Days: events.length,
    sampleEvents: events.slice(0, 8).map((event) => ({
      title: event.summary || "Evenement sans titre",
      start: event.start?.dateTime || event.start?.date || "",
      status: event.status || "",
    })),
  });
}

function getGoogleConfigStatus() {
  const config = getGoogleConfig();
  return {
    clientId: config.clientId,
    hasClientSecret: Boolean(config.clientSecret),
    redirectUri: config.redirectUri,
    ready: config.ready,
    requiredCallback: config.redirectUri,
  };
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${PORT}/auth/google/callback`;
  return {
    clientId,
    clientSecret,
    redirectUri,
    ready: Boolean(clientId && clientSecret && redirectUri),
  };
}

function getAiConfigStatus() {
  const provider = getAiProvider();
  return {
    provider,
    baseUrl: getAiBaseUrl(),
    model: getAiModel(provider),
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    ready: provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(getAiBaseUrl()),
  };
}

function getAiProvider() {
  return String(process.env.AI_PROVIDER || "lmstudio").toLowerCase() === "openai" ? "openai" : "lmstudio";
}

function getAiBaseUrl() {
  const provider = getAiProvider();
  const fallback = provider === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:1234/v1";
  return (process.env.AI_BASE_URL || process.env.LM_STUDIO_BASE_URL || fallback).replace(/\/+$/, "");
}

function getAiModel(provider = getAiProvider()) {
  if (provider === "openai") return process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
  return process.env.AI_MODEL || process.env.LM_STUDIO_MODEL || "";
}

function saveAiConfig(config) {
  const provider = String(config.provider || "lmstudio").toLowerCase() === "openai" ? "openai" : "lmstudio";
  const current = getEnvFileValues();
  const next = {
    ...current,
    AI_PROVIDER: provider,
    AI_BASE_URL: String(config.baseUrl || (provider === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:1234/v1")).trim(),
    AI_MODEL: String(config.model || (provider === "openai" ? "gpt-5.4-mini" : "")).trim(),
    OPENAI_API_KEY: String(config.openAiApiKey || current.OPENAI_API_KEY || "").trim(),
  };

  writeEnvFile(next);
  process.env.AI_PROVIDER = next.AI_PROVIDER;
  process.env.AI_BASE_URL = next.AI_BASE_URL;
  process.env.AI_MODEL = next.AI_MODEL;
  process.env.OPENAI_API_KEY = next.OPENAI_API_KEY;
}

async function sendAiStatus(res) {
  const config = getAiConfigStatus();
  try {
    const models = await fetchAiModels(config);
    return sendJson(res, {
      ok: true,
      provider: config.provider,
      baseUrl: config.baseUrl,
      selectedModel: config.model || models[0] || "",
      models,
    });
  } catch (error) {
    return sendJson(res, {
      ok: false,
      provider: config.provider,
      baseUrl: config.baseUrl,
      error: config.provider === "openai"
        ? "OpenAI n'est pas encore configure. Verifie la cle API."
        : "LM Studio ne repond pas encore. Demarre le serveur local dans LM Studio.",
    }, 503);
  }
}

async function sendAiChat(body, res) {
  const message = String(body.message || "").trim();
  if (!message) {
    return sendJson(res, { error: "Message vide." }, 400);
  }

  const config = getAiConfigStatus();
  try {
    const models = await fetchAiModels(config);
    const model = config.model || models[0];
    if (!model) {
      return sendJson(res, {
        error: config.provider === "openai" ? "Aucun modele OpenAI configure." : "Aucun modele LM Studio n'est charge.",
      }, 409);
    }

    const headers = { "Content-Type": "application/json" };
    if (config.provider === "openai") {
      headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 900,
        messages: buildAiMessages(message),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return sendJson(res, {
        error: `${config.provider === "openai" ? "OpenAI" : "LM Studio"} a refuse la demande: ${detail}`,
      }, 502);
    }

    const payload = await response.json();
    const answer = payload.choices?.[0]?.message?.content?.trim() || "Je n'ai pas recu de reponse du modele.";
    recordAiUsage(model, payload.usage, config.provider);
    rememberAiExchange(message, answer);
    return sendJson(res, { ok: true, model, answer });
  } catch {
    return sendJson(res, {
      error: config.provider === "openai"
        ? "OpenAI ne repond pas encore. Verifie la configuration API."
        : "LM Studio ne repond pas encore. Verifie que le serveur local est demarre.",
    }, 503);
  }
}

function buildAiMessages(message) {
  const memory = readAiMemory();
  const recentExchanges = memory.exchanges.slice(-8).flatMap((exchange) => [
    { role: "user", content: exchange.user },
    { role: "assistant", content: exchange.assistant },
  ]);
  const state = readJson(STATE_FILE, seedState);
  const knowledgeContext = findRelevantKnowledge(message);

  return [
    {
      role: "system",
      content: [
        "Tu es l'assistant personnel local de Xavier.",
        "Reponds en francais, de facon concrete et concise.",
        "Tu as une memoire courte des derniers echanges fournie dans le contexte.",
        "Si Xavier fait reference a une chose dite juste avant, utilise cette memoire.",
        knowledgeContext ? `Memoire documentaire utile: ${knowledgeContext}` : "",
        "Quand la demande ressemble a une tache, propose une prochaine action claire.",
        "Ne pretends pas avoir modifie l'agenda, les emails ou les fichiers si ce n'est pas fait par l'application.",
        getAiStateSummary(state),
      ].join(" "),
    },
    ...recentExchanges,
    { role: "user", content: message },
  ];
}

function getKnowledgeStatus() {
  const store = readKnowledgeStore();
  const documents = store.documents.map((document) => ({
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    chunkCount: document.chunks.length,
    uploadedAt: document.uploadedAt,
    summary: document.summary,
  })).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));

  return {
    count: documents.length,
    indexedCount: documents.filter((document) => document.status === "Indexe").length,
    pendingCount: documents.filter((document) => document.status !== "Indexe").length,
    documents,
  };
}

async function uploadKnowledgeDocument(req, res) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) {
    return sendJson(res, { error: "Fichier absent ou formulaire invalide." }, 400);
  }

  const buffer = await readRawBody(req, 20 * 1024 * 1024);
  const parts = parseMultipart(buffer, boundary);
  const filePart = parts.find((part) => part.filename);
  if (!filePart) {
    return sendJson(res, { error: "Aucun fichier recu." }, 400);
  }

  const originalName = sanitizeFileName(filePart.filename);
  const id = randomUUID();
  const ext = path.extname(originalName).toLowerCase();
  const storedName = `${id}${ext || ".bin"}`;
  const storedPath = path.join(KNOWLEDGE_DIR, storedName);
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  fs.writeFileSync(storedPath, filePart.content);

  const extractedText = extractKnowledgeText(filePart.content, originalName, filePart.contentType);
  const chunks = extractedText ? chunkText(extractedText) : [];
  const document = {
    id,
    title: path.basename(originalName, ext) || originalName,
    fileName: originalName,
    storedName,
    mimeType: filePart.contentType || "application/octet-stream",
    size: filePart.content.length,
    status: chunks.length ? "Indexe" : "A indexer",
    summary: chunks.length
      ? `${chunks.length} morceau(x) prepares pour la recherche.`
      : "Fichier conserve. Extraction automatique prevue dans une prochaine etape.",
    chunks,
    uploadedAt: new Date().toISOString(),
  };

  const store = readKnowledgeStore();
  store.documents.push(document);
  writeJson(KNOWLEDGE_FILE, store);

  return sendJson(res, { ok: true, document: getKnowledgeStatus().documents.find((item) => item.id === id) });
}

function deleteKnowledgeDocument(requestUrl, res) {
  const id = requestUrl.searchParams.get("id");
  if (!id) return sendJson(res, { error: "Identifiant manquant." }, 400);

  const store = readKnowledgeStore();
  const document = store.documents.find((item) => item.id === id);
  if (!document) return sendJson(res, { error: "Document introuvable." }, 404);

  const nextDocuments = store.documents.filter((item) => item.id !== id);
  const storedPath = path.join(KNOWLEDGE_DIR, document.storedName || "");
  if (document.storedName && fs.existsSync(storedPath)) {
    fs.unlinkSync(storedPath);
  }
  writeJson(KNOWLEDGE_FILE, { documents: nextDocuments });
  return sendJson(res, { ok: true, status: getKnowledgeStatus() });
}

function readKnowledgeStore() {
  const store = readJson(KNOWLEDGE_FILE, { documents: [] });
  return {
    documents: Array.isArray(store.documents) ? store.documents.map((document) => ({
      ...document,
      chunks: Array.isArray(document.chunks) ? document.chunks : [],
    })) : [],
  };
}

function extractKnowledgeText(buffer, fileName, mimeType) {
  const ext = path.extname(fileName).toLowerCase();
  const textLike = [
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".json",
    ".html",
    ".css",
    ".js",
  ].includes(ext) || String(mimeType || "").startsWith("text/");
  if (!textLike) return "";
  return buffer.toString("utf8").replace(/\0/g, "").trim();
}

function chunkText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  for (let index = 0; index < normalized.length; index += 1400) {
    chunks.push(normalized.slice(index, index + 1600));
  }
  return chunks.slice(0, 80);
}

function findRelevantKnowledge(message) {
  const words = normalizeSearchWords(message).slice(0, 12);
  if (!words.length) return "";
  const store = readKnowledgeStore();
  const scored = [];

  for (const document of store.documents) {
    for (const chunk of document.chunks || []) {
      const normalized = normalizeText(chunk);
      const score = words.reduce((count, word) => count + (normalized.includes(word) ? 1 : 0), 0);
      if (score > 0) {
        scored.push({ document, chunk, score });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => `[${item.document.title}] ${item.chunk.slice(0, 900)}`)
    .join(" ");
}

function normalizeSearchWords(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

function getAiStateSummary(state) {
  const openTasks = (state.tasks || []).filter((task) => task.status !== "Termine");
  const urgentTasks = openTasks
    .filter((task) => ["Urgente", "Importante"].includes(task.priority))
    .slice(0, 5)
    .map((task) => `${task.title} (${task.list || task.category || "sans liste"})`);
  const reports = (state.reports || [])
    .slice(0, 4)
    .map((report) => `${report.title}: ${report.status}`);

  return [
    `Contexte actuel: ${openTasks.length} taches ouvertes.`,
    urgentTasks.length ? `Taches importantes: ${urgentTasks.join("; ")}.` : "",
    reports.length ? `Travaux en cours: ${reports.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

function buildMorningBrief(state) {
  const today = todayISO();
  const yesterday = addDaysISO(-1);
  const tomorrow = addDaysISO(1);
  const openTasks = (state.tasks || []).filter((task) => task.status !== "Termine" && task.status !== "Inbox");
  const lateTasks = openTasks.filter((task) => task.due && task.due < today).sort(sortTasksForBrief);
  const yesterdayCarryOver = openTasks.filter((task) => task.due === yesterday).sort(sortTasksForBrief);
  const todayTasks = openTasks.filter((task) => task.due === today).sort(sortTasksForBrief);
  const tomorrowTasks = openTasks.filter((task) => task.due === tomorrow).sort(sortTasksForBrief);
  const noDateTasks = openTasks.filter((task) => !task.due).sort(sortTasksForBrief);
  const agendaToday = (state.agenda || [])
    .filter((event) => (event.date || inferDateKeyFromAgendaTime(event.time) || today) === today)
    .slice(0, 6)
    .map((event) => ({
      title: event.title || "Evenement sans titre",
      time: event.time || "Aujourd'hui",
    }));
  const priorities = [...lateTasks, ...todayTasks, ...noDateTasks]
    .filter(uniqueTaskById())
    .sort(sortTasksForBrief)
    .slice(0, 5)
    .map(taskToBriefItem);
  const loadScore = priorities.length + agendaToday.length + Math.min(lateTasks.length, 4);

  return {
    generatedAt: new Date().toISOString(),
    date: today,
    load: loadScore >= 9 ? "chargee" : loadScore >= 5 ? "normale" : "legere",
    headline: buildMorningHeadline(lateTasks, todayTasks, agendaToday),
    stats: {
      late: lateTasks.length,
      today: todayTasks.length,
      carryOver: yesterdayCarryOver.length,
      agenda: agendaToday.length,
      tomorrow: tomorrowTasks.length,
      open: openTasks.length,
    },
    priorities,
    carryOver: yesterdayCarryOver.slice(0, 5).map(taskToBriefItem),
    agenda: agendaToday,
    plannedTomorrow: tomorrowTasks.slice(0, 5).map(taskToBriefItem),
    planningReminder: tomorrowTasks.length
      ? `Tu as ${tomorrowTasks.length} tache(s) deja prevue(s) pour demain.`
      : "Aucune tache n'est prevue pour demain. Prevois 5 minutes ce soir pour organiser la journee suivante.",
    routine: [
      "Decharge mentale : note en vrac ce qui te prend de l'espace mental.",
      "Choisis une priorite principale, pas trois priorites principales.",
      "Traite d'abord une action courte pour lancer la dynamique.",
      "Verifie agenda, echeances et retards avant d'ouvrir de nouveaux sujets.",
      "Garde un vrai tampon dans la journee pour l'imprevu.",
    ],
  };
}

function buildMorningHeadline(lateTasks, todayTasks, agendaToday) {
  if (lateTasks.length) {
    return `Tu as ${lateTasks.length} tache(s) en retard. Je te conseille de commencer par reduire ce stock avant d'ajouter du nouveau.`;
  }
  if (todayTasks.length || agendaToday.length) {
    return `Journee active : ${todayTasks.length} tache(s) prevue(s) et ${agendaToday.length} rendez-vous a surveiller.`;
  }
  return "Journee plutot legere : bon moment pour clarifier, ranger et preparer la suite.";
}

function taskToBriefItem(task) {
  return {
    id: task.id,
    title: task.title || "Tache sans titre",
    list: task.list || task.category || "divers et perso",
    priority: task.priority || "Normale",
    due: task.due || "",
    source: task.source || "manuel",
  };
}

function uniqueTaskById() {
  const seen = new Set();
  return (task) => {
    const key = task.id || task.sourceId || task.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function sortTasksForBrief(a, b) {
  const priority = priorityRank(b.priority) - priorityRank(a.priority);
  if (priority) return priority;
  const dateA = a.due || "9999-12-31";
  const dateB = b.due || "9999-12-31";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return String(a.title || "").localeCompare(String(b.title || ""), "fr");
}

function priorityRank(priority) {
  return { Urgente: 4, Importante: 3, Normale: 2, Faible: 1 }[priority] || 0;
}

function readAiMemory() {
  const memory = readJson(AI_MEMORY_FILE, { exchanges: [] });
  return {
    exchanges: Array.isArray(memory.exchanges) ? memory.exchanges : [],
  };
}

function getAiMemoryStatus() {
  const memory = readAiMemory();
  const exchanges = memory.exchanges.slice(-20).reverse();
  return {
    count: memory.exchanges.length,
    exchanges,
  };
}

function rememberAiExchange(user, assistant) {
  const memory = readAiMemory();
  memory.exchanges.push({
    user,
    assistant,
    createdAt: new Date().toISOString(),
  });
  memory.exchanges = memory.exchanges.slice(-40);
  writeJson(AI_MEMORY_FILE, memory);
}

function recordAiUsage(model, usage = {}, provider = inferAiProvider(model)) {
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens || 0);
  if (!promptTokens && !completionTokens && !totalTokens) return;

  const usageLog = readAiUsage();
  usageLog.entries.push({
    createdAt: new Date().toISOString(),
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateAiCostUsd(model, promptTokens, completionTokens),
  });
  usageLog.entries = usageLog.entries.slice(-2000);
  writeJson(AI_USAGE_FILE, usageLog);
}

function readAiUsage() {
  const usage = readJson(AI_USAGE_FILE, { entries: [] });
  return {
    entries: Array.isArray(usage.entries) ? usage.entries : [],
  };
}

function getAiUsageSummary() {
  const entries = readAiUsage().entries;
  const today = todayISO();
  const month = today.slice(0, 7);
  const todayEntries = entries.filter((entry) => String(entry.createdAt || "").slice(0, 10) === today);
  const monthEntries = entries.filter((entry) => String(entry.createdAt || "").slice(0, 7) === month);
  return {
    today: summarizeAiUsage(todayEntries),
    month: summarizeAiUsage(monthEntries),
    recent: entries.slice(-20).reverse(),
    pricing: OPENAI_MODEL_PRICES,
  };
}

function summarizeAiUsage(entries) {
  const summary = entries.reduce((acc, entry) => {
    acc.requests += 1;
    acc.promptTokens += Number(entry.promptTokens || 0);
    acc.completionTokens += Number(entry.completionTokens || 0);
    acc.totalTokens += Number(entry.totalTokens || 0);
    acc.estimatedCostUsd += Number(entry.estimatedCostUsd || 0);
    acc.byModel[entry.model] = acc.byModel[entry.model] || {
      model: entry.model,
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    acc.byModel[entry.model].requests += 1;
    acc.byModel[entry.model].promptTokens += Number(entry.promptTokens || 0);
    acc.byModel[entry.model].completionTokens += Number(entry.completionTokens || 0);
    acc.byModel[entry.model].totalTokens += Number(entry.totalTokens || 0);
    acc.byModel[entry.model].estimatedCostUsd += Number(entry.estimatedCostUsd || 0);
    return acc;
  }, {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: {},
  });

  return {
    ...summary,
    estimatedCostUsd: roundMoney(summary.estimatedCostUsd),
    byModel: Object.values(summary.byModel).map((item) => ({
      ...item,
      estimatedCostUsd: roundMoney(item.estimatedCostUsd),
    })),
  };
}

function estimateAiCostUsd(model, promptTokens, completionTokens) {
  const price = getAiPrice(model);
  if (!price) return 0;
  return roundMoney((promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output);
}

function getAiPrice(model) {
  const normalized = String(model || "").toLowerCase();
  if (OPENAI_MODEL_PRICES[normalized]) return OPENAI_MODEL_PRICES[normalized];
  if (normalized.includes("gpt-5.4-mini")) return OPENAI_MODEL_PRICES["gpt-5.4-mini"];
  if (normalized.includes("gpt-5.4-nano")) return OPENAI_MODEL_PRICES["gpt-5.4-nano"];
  if (normalized.includes("gpt-5.4")) return OPENAI_MODEL_PRICES["gpt-5.4"];
  if (normalized.includes("gpt-5.5")) return OPENAI_MODEL_PRICES["gpt-5.5"];
  return null;
}

function inferAiProvider(model) {
  return getAiPrice(model) ? "OpenAI" : "Local";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100000) / 100000;
}

async function fetchAiModels(config) {
  if (config.provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Cle OpenAI absente.");
    }
    return [config.model || "gpt-5.4-mini"];
  }

  const response = await fetch(`${config.baseUrl}/models`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LM Studio a refuse la demande: ${detail}`);
  }
  const payload = await response.json();
  return (payload.data || []).map((model) => model.id).filter(Boolean);
}

function saveGoogleConfig(config) {
  const current = getEnvFileValues();
  const next = {
    ...current,
    GOOGLE_CLIENT_ID: String(config.clientId || "").trim(),
    GOOGLE_CLIENT_SECRET: String(config.clientSecret || current.GOOGLE_CLIENT_SECRET || "").trim(),
    GOOGLE_REDIRECT_URI: String(config.redirectUri || getGoogleConfig().redirectUri).trim(),
    PORT: String(PORT),
  };

  writeEnvFile(next);
  process.env.GOOGLE_CLIENT_ID = next.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = next.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_REDIRECT_URI = next.GOOGLE_REDIRECT_URI;
}

function getEnvFileValues() {
  const values = {};
  CONFIG_ENV_KEYS.forEach((key) => {
    if (process.env[key] !== undefined) values[key] = process.env[key];
  });
  readEnvFile(path.join(__dirname, ".env"), values);
  readEnvFile(RUNTIME_ENV_FILE, values);
  return values;
}

function writeEnvFile(values) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lines = [
    "# Assistant Xavier - configuration locale privee",
    "# Ne pas partager ce fichier.",
    ...CONFIG_ENV_KEYS.map((key) => `${key}=${values[key] || ""}`),
    "",
  ];
  fs.writeFileSync(RUNTIME_ENV_FILE, lines.join("\n"), "utf8");
}

function readEnvFile(envPath, target) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key) target[key] = value;
  });
}

function loadEnvFile(envPath, shouldOverwrite = false) {
  const values = {};
  readEnvFile(envPath, values);
  Object.entries(values).forEach(([key, value]) => {
    if (shouldOverwrite || process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function isAuthorized(req) {
  const password = process.env.ASSISTANT_PASSWORD || "";
  if (!password) return true;

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;
    const username = decoded.slice(0, separator);
    const providedPassword = decoded.slice(separator + 1);
    const expectedUser = process.env.ASSISTANT_USER || "xavier";
    return secureCompare(username, expectedUser) && secureCompare(providedPassword, password);
  } catch {
    return false;
  }
}

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requestAuthentication(res) {
  res.writeHead(401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Assistant Xavier"',
  });
  res.end("Connexion requise.");
}

function serveStatic(urlPath, res) {
  const cleanPath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    return sendText(res, "Acces refuse.", 403);
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendText(res, "Fichier introuvable.", 404);
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
  const legacyStateFile = path.join(ROOT, "app-state.json");
  const legacyTokensFile = path.join(ROOT, "google-tokens.json");

  if (!fs.existsSync(STATE_FILE)) {
    if (fs.existsSync(legacyStateFile)) {
      fs.copyFileSync(legacyStateFile, STATE_FILE);
    } else {
      writeJson(STATE_FILE, seedState);
    }
  }
  if (!fs.existsSync(TOKENS_FILE)) {
    if (fs.existsSync(legacyTokensFile)) {
      fs.copyFileSync(legacyTokensFile, TOKENS_FILE);
    } else {
      writeJson(TOKENS_FILE, {});
    }
  }
  if (!fs.existsSync(SYNC_STATUS_FILE)) {
    writeJson(SYNC_STATUS_FILE, {
      inProgress: false,
      lastMode: "",
      lastStartedAt: "",
      lastFinishedAt: "",
      lastResults: {},
      lastErrors: {},
      lastTokenServices: [],
      updatedAt: "",
    });
  }
  if (!fs.existsSync(KNOWLEDGE_FILE)) {
    writeJson(KNOWLEDGE_FILE, { documents: [] });
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Requete trop volumineuse."));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invalide."));
      }
    });
  });
}

function readRawBody(req, limitBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        req.destroy();
        reject(new Error("Fichier trop volumineux."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const partStart = buffer.indexOf(delimiter, cursor);
    if (partStart === -1) break;
    const contentStart = partStart + delimiter.length;
    if (buffer.slice(contentStart, contentStart + 2).toString() === "--") break;

    const headerStart = buffer.slice(contentStart, contentStart + 2).toString() === "\r\n"
      ? contentStart + 2
      : contentStart;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd === -1) break;

    const nextPart = buffer.indexOf(delimiter, headerEnd + 4);
    if (nextPart === -1) break;

    const headers = buffer.slice(headerStart, headerEnd).toString("utf8");
    let content = buffer.slice(headerEnd + 4, nextPart);
    if (content.slice(-2).toString() === "\r\n") {
      content = content.slice(0, -2);
    }

    const disposition = headers.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
    parts.push({ name, filename, contentType, content });
    cursor = nextPart;
  }

  return parts;
}

function sanitizeFileName(value) {
  const name = path.basename(String(value || "document"));
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 140) || "document";
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatEventTime(start) {
  if (start.date) {
    return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${start.date}T12:00:00`));
  }
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(start.dateTime));
}

function getEventDateKey(start) {
  if (start.date) return start.date;
  if (start.dateTime) return start.dateTime.slice(0, 10);
  return "";
}

function simplifySender(value) {
  const match = value.match(/"?([^"<]+)"?\s*(<.+>)?/);
  return match ? match[1].trim() : value;
}

function normalizeText(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
