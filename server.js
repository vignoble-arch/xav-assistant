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
const AGENT_INSTRUCTIONS_FILE = path.join(DATA_DIR, "agent-instructions.json");
const AUTO_SYNC_INTERVAL_MINUTES = Math.max(5, Number(process.env.AUTO_SYNC_INTERVAL_MINUTES || 15));
const DEFAULT_BAQIO_SYNC_MAX_PAGES = 30;
const ORDER_STATUSES = ["En commande", "Prete pour expedition", "En livraison", "Expedie"];

const GOOGLE_SCOPES = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  drive: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  tasks: ["https://www.googleapis.com/auth/tasks"],
};

const OPENAI_MODEL_PRICES = {
  "gpt-5.4-nano": { input: 0.20, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.50 },
  "gpt-5.4": { input: 2.50, output: 15.00 },
  "gpt-5.5": { input: 5.00, output: 30.00 },
};

const TASK_LISTS = ["Dettes", "Cave Expé", "vignoble", "bureau", "divers et perso"];

const GOOGLE_SERVICES = ["gmail", "calendar", "drive", "tasks"];

const DEFAULT_AGENT_INSTRUCTIONS = {
  fernand: [
    "Role: bras droit de Xavier et chef d'equipe des ouvriers IA.",
    "Mission: comprendre la demande, choisir le bon niveau de traitement, coordonner les ouvriers si necessaire, verifier la coherence et rendre une reponse utile.",
    "Hierarchie: Fernand recoit les demandes de Xavier, distribue aux services specialises, controle leur travail, puis rend une synthese claire. Les services ne commandent pas Fernand.",
    "Style: concret, calme, direct, en francais. Ne pas faire de grand rapport si Xavier pose une question simple.",
    "Regle: si une action n'a pas ete faite par l'application, ne jamais pretendre qu'elle a ete faite.",
  ].join("\n"),
  organisation: [
    "Nom: Paulo.",
    "Role: organisation du travail, journee, agenda, taches, productivite, routine du matin et equilibre mental.",
    "Mission: transformer le flou en prochaines actions, prioriser, tenir compte de l'agenda, des retards, de la charge mentale et du niveau de stress.",
    "Agenda: utiliser l'agenda Google synchronise comme source de verite. Ne pas inventer de rendez-vous ou de planning si les donnees d'agenda ne sont pas presentes dans le contexte.",
    "Hierarchie: quand Fernand coordonne, Paulo lui fournit une analyse courte et actionnable. Quand Xavier appelle directement ce service avec @paulo ou @organisation, repondre directement dans ce role.",
    "Style: pratique, court, apaisant quand necessaire, toujours oriente action.",
  ].join("\n"),
  secretaire: [
    "Nom: Suzette.",
    "Role: secretariat, emails, echeances, dossiers clients et administratif.",
    "Mission: reperer ce qui demande une reponse, preparer des syntheses, signaler les echeances et organiser les informations avant un appel.",
    "Hierarchie: quand Fernand coordonne, Suzette lui remonte les points administratifs utiles, risques, pieces manquantes et brouillons.",
    "Regle: ne pas dire qu'un email a ete envoye si l'envoi n'a pas ete confirme par Xavier.",
  ].join("\n"),
  commercial: [
    "Nom: Gaspard.",
    "Role: suivi clients, relances, statistiques commerciales et offres.",
    "Mission: utiliser les donnees Baqio synchronisees pour distinguer professionnels et particuliers, proposer des relances selon dernier achat, preparer des pistes commerciales et des brouillons d'offres.",
    "Hierarchie: quand Fernand coordonne, Gaspard fournit uniquement l'analyse client, les opportunites, les donnees de vente et les questions commerciales utiles.",
    "Regle: Baqio est lu en lecture seule. Ne jamais pretendre avoir modifie Baqio, envoye une relance ou cree une offre sans action explicite de l'application et validation de Xavier.",
  ].join("\n"),
};

const CONFIG_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "ASSISTANT_CALENDAR_ID",
  "PORT",
  "DATA_DIR",
  "ASSISTANT_USER",
  "ASSISTANT_PASSWORD",
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_MODEL",
  "OPENAI_API_KEY",
  "BAQIO_BASE_URL",
  "BAQIO_API_KEY",
  "BAQIO_PASSWORD",
  "BAQIO_SECRET",
  "BAQIO_SYNC_MAX_PAGES",
  "ORDER_WEBHOOK_SECRET",
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
  baqio: {
    customers: [],
    orders: [],
    summary: null,
    lastSyncedAt: null,
  },
  orderPipeline: [],
  timeclock: {
    employees: [],
    entries: [],
  },
  requests: [],
};

ensureDataFiles();

let googleSyncInProgress = false;

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (!isPublicRoute(requestUrl.pathname) && !isAuthorized(req)) {
      return requestAuthentication(res);
    }

    if (requestUrl.pathname === "/api/state" && req.method === "GET") {
      return sendJson(res, getAppState());
    }

    if (requestUrl.pathname === "/api/morning-brief" && req.method === "GET") {
      return sendJson(res, buildMorningBrief(getAppState()));
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
      writeJson(STATE_FILE, normalizeAppState(nextState));
      return sendJson(res, { ok: true });
    }

    if (requestUrl.pathname === "/api/notes/quick" && req.method === "POST") {
      return await saveQuickNoteFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/timeclock" && req.method === "GET") {
      return sendJson(res, getTimeClockStatus());
    }

    if (requestUrl.pathname === "/api/timeclock/public" && req.method === "GET") {
      return sendJson(res, getPublicTimeClockStatus());
    }

    if (requestUrl.pathname === "/api/timeclock/punch" && req.method === "POST") {
      return await saveTimeClockPunch(req, res);
    }

    if (requestUrl.pathname === "/api/reset" && req.method === "POST") {
      writeJson(STATE_FILE, seedState);
      return sendJson(res, getAppState());
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

    if (requestUrl.pathname === "/api/config/baqio" && req.method === "GET") {
      return sendJson(res, getBaqioConfigStatus());
    }

    if (requestUrl.pathname === "/api/config/baqio" && req.method === "PUT") {
      const config = await readBody(req);
      saveBaqioConfig(config);
      return sendJson(res, getBaqioConfigStatus());
    }

    if (requestUrl.pathname === "/api/baqio/status" && req.method === "GET") {
      return await sendBaqioStatus(res);
    }

    if (requestUrl.pathname === "/api/baqio/sync" && req.method === "POST") {
      return await syncBaqioCommercialData(res);
    }

    if (requestUrl.pathname === "/api/webhooks/orders" && req.method === "POST") {
      return await handleOrderWebhook(req, requestUrl, res);
    }

    if (requestUrl.pathname === "/api/orders/status" && req.method === "POST") {
      return await updateOrderPipelineStatus(req, res);
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

    if (requestUrl.pathname === "/api/agents/instructions" && req.method === "GET") {
      return sendJson(res, getAgentInstructionsStatus());
    }

    if (requestUrl.pathname === "/api/agents/instructions" && req.method === "PUT") {
      const body = await readBody(req);
      saveAgentInstructions(body);
      return sendJson(res, getAgentInstructionsStatus());
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

    if (requestUrl.pathname === "/api/tasks/save" && req.method === "POST") {
      return await saveTaskFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/tasks/delete" && req.method === "POST") {
      return await deleteTaskFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/agenda/save" && req.method === "POST") {
      return await saveAgendaEventFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/agenda/delete" && req.method === "POST") {
      return await deleteAgendaEventFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/mail/message" && req.method === "GET") {
      return await handleMailMessageFromApp(requestUrl, res);
    }

    if (requestUrl.pathname === "/api/mail/reply" && req.method === "POST") {
      return await handleMailReplyFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/mail/draft" && req.method === "POST") {
      return await handleMailDraftFromApp(req, res);
    }

    if (requestUrl.pathname === "/api/mail/action" && req.method === "POST") {
      return await handleMailActionFromApp(req, res);
    }

    return serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: "Erreur serveur locale.", detail: error.message }, 500);
  }
});

function isPublicRoute(pathname) {
  return pathname === "/api/health"
    || pathname === "/pointeuse.html"
    || pathname === "/pointeuse.css"
    || pathname === "/pointeuse.js"
    || pathname === "/qr-pointeuse.jpg"
    || pathname === "/api/timeclock/public"
    || pathname === "/api/timeclock/punch"
    || pathname === "/api/webhooks/orders";
}

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
  for (const name of services) {
    const token = {
      ...tokenPayload,
      connectedAt: new Date().toISOString(),
      expiresAt: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
    };
    if (name === "gmail") {
      const profile = await getGmailProfile(token);
      tokens.gmailAccounts = upsertGmailAccount(tokens.gmailAccounts || tokens.gmail, {
        ...token,
        emailAddress: profile.emailAddress || "Gmail",
      });
      tokens.gmail = tokens.gmailAccounts[0] || token;
      continue;
    }
    tokens[name] = {
      ...token,
    };
  }
  writeJson(TOKENS_FILE, tokens);
  redirect(res, "/index.html?connection=success");
}

async function syncGoogle(requestUrl, res) {
  const service = requestUrl.searchParams.get("service");
  if (!GOOGLE_SERVICES.includes(service)) {
    return sendJson(res, { error: "Service Google inconnu." }, 400);
  }

  const tokens = readJson(TOKENS_FILE, {});
  if (service !== "gmail" && !tokens[service]) {
    return sendJson(res, { error: "Connexion non active.", service }, 409);
  }

  const state = getAppState();
  if (service === "gmail") {
    const accounts = getGmailAccounts(tokens);
    if (!accounts.length) return sendJson(res, { error: "Connexion non active.", service }, 409);
    state.mail = await fetchAllGmail(accounts);
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
      state: getAppState(),
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
  const state = getAppState();
  const results = {};
  const errors = {};

  try {
    const gmailAccounts = getGmailAccounts(tokens);
    if (gmailAccounts.length) {
      try {
        state.mail = await fetchAllGmail(gmailAccounts);
        results.gmail = state.mail.length;
        results.gmailAccounts = gmailAccounts.length;
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

function getAppState() {
  return normalizeAppState(readJson(STATE_FILE, seedState));
}

function normalizeAppState(state) {
  return {
    ...structuredClone(seedState),
    ...state,
    tasks: Array.isArray(state.tasks) ? state.tasks : structuredClone(seedState.tasks),
    inbox: Array.isArray(state.inbox) ? state.inbox : structuredClone(seedState.inbox),
    reminders: Array.isArray(state.reminders) ? state.reminders : structuredClone(seedState.reminders),
    notes: Array.isArray(state.notes) ? state.notes : structuredClone(seedState.notes),
    mail: Array.isArray(state.mail) ? state.mail : structuredClone(seedState.mail),
    reports: Array.isArray(state.reports) ? state.reports : structuredClone(seedState.reports),
    baqio: state.baqio && typeof state.baqio === "object" ? state.baqio : structuredClone(seedState.baqio),
    orderPipeline: Array.isArray(state.orderPipeline) ? normalizeOrderPipeline(state.orderPipeline) : [],
    timeclock: normalizeTimeClockState(state.timeclock),
    requests: Array.isArray(state.requests) ? state.requests : [],
    lists: state.lists && typeof state.lists === "object" ? state.lists : structuredClone(seedState.lists),
    agenda: Array.isArray(state.agenda) ? state.agenda : structuredClone(seedState.agenda),
  };
}

function normalizeTimeClockState(timeclock) {
  const source = timeclock && typeof timeclock === "object" ? timeclock : {};
  return {
    employees: Array.isArray(source.employees)
      ? source.employees.map((employee) => ({
          id: employee.id || randomUUID(),
          name: String(employee.name || "").trim() || "Employe",
          code: String(employee.code || "").trim(),
          active: employee.active !== false,
          createdAt: employee.createdAt || new Date().toISOString(),
        }))
      : [],
    entries: Array.isArray(source.entries)
      ? source.entries.map((entry) => ({
          id: entry.id || randomUUID(),
          employeeId: entry.employeeId || "",
          employeeName: String(entry.employeeName || "Employe").trim(),
          action: normalizeTimeClockAction(entry.action),
          timestamp: entry.timestamp || new Date().toISOString(),
          source: entry.source || "app",
        }))
      : [],
  };
}

function getTimeClockStatus() {
  const state = getAppState();
  const timeclock = normalizeTimeClockState(state.timeclock);
  const entries = [...timeclock.entries].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const today = todayISO();
  return {
    ok: true,
    employees: timeclock.employees,
    entries: entries.slice(0, 200),
    todayEntries: entries.filter((entry) => entry.timestamp.slice(0, 10) === today),
    statusByEmployee: getTimeClockStatusByEmployee(timeclock),
    dailySummary: buildTimeClockDailySummary(timeclock.entries),
  };
}

function getPublicTimeClockStatus() {
  const timeclock = normalizeTimeClockState(getAppState().timeclock);
  return {
    ok: true,
    employees: timeclock.employees
      .filter((employee) => employee.active !== false)
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        requiresCode: Boolean(employee.code),
      })),
  };
}

async function saveTimeClockPunch(req, res) {
  const body = await readBody(req);
  const action = normalizeTimeClockAction(body.action);
  const employeeName = String(body.employeeName || "").trim();
  const employeeCode = String(body.code || "").trim();
  const state = getAppState();
  state.timeclock = normalizeTimeClockState(state.timeclock);

  let employee = state.timeclock.employees.find((item) => item.id === body.employeeId);
  if (!employee && employeeName) {
    employee = state.timeclock.employees.find((item) => normalizeText(item.name) === normalizeText(employeeName));
  }
  if (!employee && employeeName) {
    employee = {
      id: randomUUID(),
      name: employeeName,
      code: employeeCode,
      active: true,
      createdAt: new Date().toISOString(),
    };
    state.timeclock.employees.push(employee);
  }
  if (!employee) {
    return sendJson(res, { error: "Choisis ou saisis un employe." }, 400);
  }
  if (employee.active === false) {
    return sendJson(res, { error: "Cet employe est desactive dans la pointeuse." }, 403);
  }
  if (employee.code && employee.code !== employeeCode) {
    return sendJson(res, { error: "Code personnel incorrect." }, 403);
  }

  const entry = {
    id: randomUUID(),
    employeeId: employee.id,
    employeeName: employee.name,
    action,
    timestamp: new Date().toISOString(),
    source: body.source === "nfc" ? "nfc" : "app",
  };
  state.timeclock.entries.unshift(entry);
  writeJson(STATE_FILE, state);
  return sendJson(res, { ok: true, entry, timeclock: getTimeClockStatus() });
}

function normalizeTimeClockAction(action) {
  if (["arrival", "departure", "break_start", "break_end"].includes(action)) return action;
  return "arrival";
}

function getTimeClockStatusByEmployee(timeclock) {
  const latest = {};
  [...timeclock.entries]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .forEach((entry) => {
      if (!latest[entry.employeeId]) latest[entry.employeeId] = entry;
    });
  return latest;
}

function buildTimeClockDailySummary(entries) {
  const labels = {};
  entries.forEach((entry) => {
    const day = entry.timestamp.slice(0, 10);
    labels[day] = labels[day] || { date: day, arrivals: 0, departures: 0, breaks: 0, total: 0 };
    labels[day].total += 1;
    if (entry.action === "arrival") labels[day].arrivals += 1;
    if (entry.action === "departure") labels[day].departures += 1;
    if (entry.action === "break_start" || entry.action === "break_end") labels[day].breaks += 1;
  });
  return Object.values(labels).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
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
  } else if (service === "gmail") {
    delete tokens.gmail;
    delete tokens.gmailAccounts;
    writeJson(TOKENS_FILE, tokens);
  } else {
    delete tokens[service];
    writeJson(TOKENS_FILE, tokens);
  }
  sendJson(res, getConnectionStatus());
}

async function saveQuickNoteFromApp(req, res) {
  const body = await readBody(req);
  const text = String(body.text || body.body || "").trim();
  if (!text) {
    return sendJson(res, { ok: false, error: "Note vide." }, 400);
  }

  const state = getAppState();
  const note = {
    id: String(body.id || randomUUID()),
    title: makeQuickNoteTitle(text),
    body: text,
    category: "Idee",
    source: "note rapide mobile",
    createdAt: body.createdAt || new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };

  const existingIndex = state.notes.findIndex((item) => item.id === note.id);
  if (existingIndex >= 0) {
    state.notes[existingIndex] = { ...state.notes[existingIndex], ...note };
  } else {
    state.notes = [note, ...(state.notes || [])];
  }
  writeJson(STATE_FILE, state);
  return sendJson(res, { ok: true, note });
}

function makeQuickNoteTitle(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "Idee rapide";
  const cleaned = firstLine.replace(/\s+/g, " ").trim();
  return cleaned.length > 56 ? `${cleaned.slice(0, 53)}...` : cleaned;
}

async function saveTaskFromApp(req, res) {
  const body = await readBody(req);
  const state = getAppState();
  const title = String(body.title || "").trim();
  if (!title) return sendJson(res, { error: "Titre de tache manquant." }, 400);

  const existing = state.tasks.find((task) => task.id === body.id);
  const nextStatus = body.status || existing?.status || "A faire";
  const completedAt = nextStatus === "Termine"
    ? existing?.completedAt || new Date().toISOString()
    : "";
  const task = {
    id: existing?.id || randomUUID(),
    title,
    status: nextStatus,
    priority: body.priority || existing?.priority || "Normale",
    list: normalizeTaskList(body.list || existing?.list || existing?.category || "bureau"),
    source: existing?.source || "manuel",
    due: String(body.due || ""),
    notes: String(body.notes || existing?.notes || ""),
    sourceId: existing?.sourceId || "",
    sourceListId: existing?.sourceListId || "",
    completedAt,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (task.source === "Google Tasks" || (!existing && readJson(TOKENS_FILE, {}).tasks)) {
      const saved = existing
        ? await updateGoogleTask(task)
        : await createGoogleTask(task);
      Object.assign(task, saved);
    }
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }

  state.tasks = existing
    ? state.tasks.map((item) => item.id === task.id ? { ...item, ...task } : item)
    : [task, ...state.tasks];
  writeJson(STATE_FILE, state);
  sendJson(res, state);
}

async function deleteTaskFromApp(req, res) {
  const body = await readBody(req);
  const state = getAppState();
  const task = state.tasks.find((item) => item.id === body.id);
  if (!task) return sendJson(res, { error: "Tache introuvable." }, 404);

  try {
    if (task.source === "Google Tasks") {
      await deleteGoogleTask(task);
    }
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }

  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  writeJson(STATE_FILE, state);
  sendJson(res, state);
}

async function saveAgendaEventFromApp(req, res) {
  const body = await readBody(req);
  const state = getAppState();
  const title = String(body.title || "").trim();
  const date = String(body.date || "").slice(0, 10);
  const time = String(body.time || "").slice(0, 5);
  if (!title || !date) return sendJson(res, { error: "Titre et date obligatoires." }, 400);

  const existing = (state.agenda || []).find((event) => event.id === body.id);
  const event = {
    id: existing?.id || randomUUID(),
    sourceId: existing?.sourceId || "",
    title,
    date,
    time,
    source: existing?.source || "manuel",
    updatedAt: new Date().toISOString(),
  };

  try {
    if (existing?.source === "Google Calendar" || (!existing && readJson(TOKENS_FILE, {}).calendar)) {
      const saved = existing
        ? await updateGoogleCalendarEvent(event)
        : await createGoogleCalendarEvent(event);
      Object.assign(event, saved);
    }
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }

  state.agenda = existing
    ? state.agenda.map((item) => item.id === event.id ? { ...item, ...event } : item)
    : [event, ...(state.agenda || [])];
  writeJson(STATE_FILE, state);
  sendJson(res, state);
}

async function deleteAgendaEventFromApp(req, res) {
  const body = await readBody(req);
  const state = getAppState();
  const event = (state.agenda || []).find((item) => item.id === body.id);
  if (!event) return sendJson(res, { error: "Evenement introuvable." }, 404);

  try {
    if (event.source === "Google Calendar") {
      await deleteGoogleCalendarEvent(event);
    }
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }

  state.agenda = (state.agenda || []).filter((item) => item.id !== event.id);
  writeJson(STATE_FILE, state);
  sendJson(res, state);
}

async function handleMailMessageFromApp(requestUrl, res) {
  const mailId = String(requestUrl.searchParams.get("id") || "").trim();
  const state = getAppState();
  const mail = findMailItem(state, mailId);
  if (!mail) return sendJson(res, { error: "Email introuvable." }, 404);

  if (String(mail.source || "").startsWith("Gmail") && mail.sourceId) {
    try {
      const tokens = readJson(TOKENS_FILE, {});
      const token = findGmailAccount(tokens, mail.mailbox);
      if (!token?.access_token) throw new Error("Gmail n'est pas connecte.");
      const full = await fetchFullGmailMessage(token, "gmail", mail.sourceId);
      const scopes = String(token.scope || "").split(/\s+/).filter(Boolean);
      return sendJson(res, {
        ok: true,
        message: {
          id: mail.id,
          sourceId: mail.sourceId,
          threadId: full.threadId,
          mailbox: mail.mailbox || "",
          title: full.subject || mail.title || "(Sans objet)",
          from: full.from || "",
          to: full.to || "",
          date: full.date || mail.createdAt || "",
          body: full.body || mail.detail || "",
          snippet: full.snippet || mail.detail || "",
          canReply: Boolean(full.from),
          needsSendScope: !hasGoogleScope(scopes, "https://www.googleapis.com/auth/gmail.send"),
        },
      });
    } catch (error) {
      return sendJson(res, { error: error.message }, 409);
    }
  }

  return sendJson(res, {
    ok: true,
    message: {
      id: mail.id,
      title: mail.title || "(Sans objet)",
      from: mail.source || "",
      to: "",
      date: mail.createdAt || "",
      body: mail.body || mail.excerpt || mail.detail || "",
      snippet: mail.detail || mail.excerpt || "",
      canReply: false,
      needsSendScope: false,
    },
  });
}

async function handleMailReplyFromApp(req, res) {
  const body = await readBody(req);
  const mailId = String(body.id || "").trim();
  const messageBody = String(body.body || "").trim();
  if (!messageBody) return sendJson(res, { error: "La reponse est vide." }, 400);

  const state = getAppState();
  const mail = findMailItem(state, mailId);
  if (!mail) return sendJson(res, { error: "Email introuvable." }, 404);
  if (!String(mail.source || "").startsWith("Gmail") || !mail.sourceId) {
    return sendJson(res, { error: "Seuls les emails Gmail connectes peuvent recevoir une reponse depuis l'app." }, 409);
  }

  try {
    const tokens = readJson(TOKENS_FILE, {});
    const token = requireGmailSendToken(findGmailAccount(tokens, mail.mailbox));
    const full = await fetchFullGmailMessage(token, "gmail", mail.sourceId);
    const to = full.replyTo || full.from;
    if (!to) return sendJson(res, { error: "Adresse de reponse introuvable." }, 409);

    const raw = buildGmailReplyRaw({
      to,
      subject: buildReplySubject(full.subject || mail.title || ""),
      inReplyTo: full.messageId,
      references: [full.references, full.messageId].filter(Boolean).join(" "),
      body: messageBody,
    });

    await googleFetch(token, "gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      body: {
        raw,
        threadId: full.threadId,
      },
    });

    return sendJson(res, { ok: true });
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }
}

async function handleMailDraftFromApp(req, res) {
  const body = await readBody(req);
  const mailId = String(body.id || "").trim();
  const messageBody = String(body.body || "").trim();
  if (!messageBody) return sendJson(res, { error: "Le brouillon est vide." }, 400);

  try {
    const draft = await createGmailReplyDraft(mailId, messageBody);
    return sendJson(res, { ok: true, draft });
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }
}

async function createGmailReplyDraft(mailId, messageBody) {
  const state = getAppState();
  const mail = findMailItem(state, mailId);
  if (!mail) throw new Error("Email introuvable.");
  if (!String(mail.source || "").startsWith("Gmail") || !mail.sourceId) {
    throw new Error("Seuls les emails Gmail connectes peuvent recevoir un brouillon depuis l'app.");
  }

  const tokens = readJson(TOKENS_FILE, {});
  const token = requireGmailSendToken(findGmailAccount(tokens, mail.mailbox));
  const full = await fetchFullGmailMessage(token, "gmail", mail.sourceId);
  const to = full.replyTo || full.from;
  if (!to) throw new Error("Adresse de reponse introuvable.");

  const raw = buildGmailReplyRaw({
    to,
    subject: buildReplySubject(full.subject || mail.title || ""),
    inReplyTo: full.messageId,
    references: [full.references, full.messageId].filter(Boolean).join(" "),
    body: messageBody,
  });

  const created = await googleFetch(token, "gmail", "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    body: {
      message: {
        raw,
        threadId: full.threadId,
      },
    },
  });

  return {
    id: created.id || "",
    messageId: created.message?.id || "",
    threadId: created.message?.threadId || full.threadId || "",
    mailId: mail.id,
    title: full.subject || mail.title || "(Sans objet)",
    to,
  };
}

async function handleMailActionFromApp(req, res) {
  const body = await readBody(req);
  const action = String(body.action || "").trim();
  const mailId = String(body.id || "").trim();
  const state = getAppState();
  const mail = findMailItem(state, mailId);
  if (!mail) return sendJson(res, { error: "Email introuvable." }, 404);

  try {
    if (String(mail.source || "").startsWith("Gmail") && mail.sourceId) {
      if (action === "archive") {
        await modifyGmailMessage(mail.sourceId, ["INBOX", "UNREAD"], mail.mailbox);
      } else if (action === "read") {
        await modifyGmailMessage(mail.sourceId, ["UNREAD"], mail.mailbox);
      } else {
        return sendJson(res, { error: "Action email inconnue." }, 400);
      }
    }
  } catch (error) {
    return sendJson(res, { error: error.message }, 409);
  }

  state.mail = (state.mail || []).filter((item) => item.id !== mail.id);
  writeJson(STATE_FILE, state);
  return sendJson(res, state);
}

async function fetchGmail(token, service) {
  const response = await googleFetch(token, service, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=newer_than:14d");
  const messages = response.messages || [];
  const details = await Promise.all(messages.map((message) => fetchGmailMessage(token, service, message.id)));
  return details.filter(Boolean);
}

async function fetchAllGmail(accounts) {
  const batches = await Promise.all(accounts.map(async (account, index) => {
    const mailbox = account.emailAddress || `Gmail ${index + 1}`;
    const mails = await fetchGmail(account, "gmail");
    return mails.map((mail) => ({
      ...mail,
      id: `gmail-${mailbox}-${mail.sourceId || mail.id}`,
      mailbox,
      source: `Gmail - ${mailbox}`,
    }));
  }));
  return batches.flat()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);
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
    sourceId: message.id,
    title: subject,
    source: "Gmail",
    labelIds: message.labelIds || [],
    unread: (message.labelIds || []).includes("UNREAD"),
    createdAt: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : new Date().toISOString(),
    detail: `${from}${date && !Number.isNaN(date.valueOf()) ? ` - ${date.toLocaleDateString("fr-FR")}` : ""}${message.snippet ? ` - ${message.snippet}` : ""}`,
  };
}

async function fetchFullGmailMessage(token, service, messageId) {
  const message = await googleFetch(token, service, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`);
  const headers = getGmailHeaders(message);
  const date = headers.date ? new Date(headers.date) : null;
  return {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds || [],
    subject: headers.subject || "(Sans objet)",
    from: headers.from || "",
    replyTo: headers["reply-to"] || "",
    to: headers.to || "",
    date: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : "",
    messageId: headers["message-id"] || "",
    references: headers.references || "",
    snippet: message.snippet || "",
    body: extractGmailBody(message.payload) || message.snippet || "",
  };
}

function getGmailHeaders(message) {
  return Object.fromEntries((message.payload?.headers || []).map((header) => [String(header.name || "").toLowerCase(), header.value || ""]));
}

function extractGmailBody(payload) {
  const plainParts = [];
  const htmlParts = [];

  function walk(part) {
    if (!part) return;
    const mimeType = String(part.mimeType || "").toLowerCase();
    const data = part.body?.data ? decodeGmailData(part.body.data) : "";
    if (data && mimeType === "text/plain") plainParts.push(data);
    if (data && mimeType === "text/html") htmlParts.push(htmlToText(data));
    for (const child of part.parts || []) walk(child);
  }

  walk(payload);
  return (plainParts.length ? plainParts : htmlParts)
    .join("\n\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function decodeGmailData(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function htmlToText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildGmailReplyRaw({ to, subject, inReplyTo, references, body }) {
  const lines = [
    headerLine("To", to),
    headerLine("Subject", encodeMailHeader(subject)),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (inReplyTo) lines.push(headerLine("In-Reply-To", inReplyTo));
  if (references) lines.push(headerLine("References", references));
  lines.push("", String(body || "").replace(/\r\n/g, "\n"));
  return base64UrlEncode(Buffer.from(lines.join("\r\n"), "utf8"));
}

function buildReplySubject(subject) {
  const clean = sanitizeHeaderValue(subject || "(Sans objet)");
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
}

function headerLine(name, value) {
  return `${name}: ${sanitizeHeaderValue(value)}`;
}

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function encodeMailHeader(value) {
  const clean = sanitizeHeaderValue(value);
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function base64UrlEncode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function findMailItem(state, mailId) {
  return (state.mail || []).find((item) => item.id === mailId || item.sourceId === mailId);
}

async function modifyGmailMessage(messageId, removeLabelIds = [], mailbox = "") {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(findGmailAccount(tokens, mailbox), "gmail");
  return googleFetch(token, "gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
    method: "POST",
    body: { removeLabelIds },
  });
}

async function getGmailProfile(token) {
  try {
    return await googleFetch(token, "gmail", "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  } catch {
    return { emailAddress: "" };
  }
}

function getGmailAccounts(tokens) {
  if (Array.isArray(tokens.gmailAccounts)) return tokens.gmailAccounts.filter((token) => token?.access_token);
  if (tokens.gmail?.access_token) return [{ ...tokens.gmail, emailAddress: tokens.gmail.emailAddress || "Gmail" }];
  return [];
}

function upsertGmailAccount(existing, nextAccount) {
  const accounts = Array.isArray(existing)
    ? existing
    : existing?.access_token ? [{ ...existing, emailAddress: existing.emailAddress || "Gmail" }] : [];
  const email = normalizeText(nextAccount.emailAddress || "");
  const filtered = accounts.filter((account) => normalizeText(account.emailAddress || "") !== email);
  return [{ ...nextAccount }, ...filtered];
}

function findGmailAccount(tokens, mailbox = "") {
  const accounts = getGmailAccounts(tokens);
  if (!accounts.length) return null;
  const normalizedMailbox = normalizeText(mailbox);
  return accounts.find((account) => normalizeText(account.emailAddress || "") === normalizedMailbox) || accounts[0];
}

async function fetchCalendar(token, service) {
  const calendarIds = getCalendarReadIds();
  const batches = await Promise.all(calendarIds.map((calendarId) => fetchCalendarFromId(token, service, calendarId)));
  return batches.flat()
    .sort((a, b) => {
      const dateA = `${a.date || ""} ${a.time || ""}`;
      const dateB = `${b.date || ""} ${b.time || ""}`;
      return dateA.localeCompare(dateB);
    })
    .slice(0, 60);
}

async function fetchCalendarFromId(token, service, calendarId) {
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
  const response = await googleFetch(token, service, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return (response.items || []).map((event) => ({
    id: `google-calendar-${calendarId}-${event.id}`,
    sourceId: event.id,
    sourceCalendarId: calendarId,
    date: getEventDateKey(event.start),
    time: formatEventTime(event.start),
    title: event.summary || "Evenement sans titre",
    source: calendarId === "primary" ? "Google Calendar - Personnel" : "Google Calendar - Assistants",
  }));
}

function getCalendarReadIds() {
  const assistantCalendarId = getAssistantCalendarId();
  return [...new Set(["primary", assistantCalendarId].filter(Boolean))];
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
        completedAt: task.completed || "",
        updatedAt: task.updated || null,
      });
    }
  }

  return allTasks;
}

async function createGoogleTask(task) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.tasks, "tasks");
  const listId = await getGoogleTaskListId(token, task.list);
  const payload = taskToGooglePayload(task);
  const saved = await googleFetch(token, "tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    body: payload,
  });
  return googleTaskToAppTask(saved, listId, task.list);
}

async function updateGoogleTask(task) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.tasks, "tasks");
  const listId = task.sourceListId || await getGoogleTaskListId(token, task.list);
  const payload = taskToGooglePayload(task);
  const saved = await googleFetch(token, "tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.sourceId)}`, {
    method: "PATCH",
    body: payload,
  });
  return googleTaskToAppTask(saved, listId, task.list);
}

async function deleteGoogleTask(task) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.tasks, "tasks");
  const listId = task.sourceListId || await getGoogleTaskListId(token, task.list);
  await googleFetch(token, "tasks", `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.sourceId)}`, {
    method: "DELETE",
  });
}

function taskToGooglePayload(task) {
  const payload = {
    title: task.title,
    notes: task.notes || "",
    status: task.status === "Termine" ? "completed" : "needsAction",
  };
  if (task.due) payload.due = `${task.due}T00:00:00.000Z`;
  if (payload.status === "completed") payload.completed = new Date().toISOString();
  return payload;
}

function googleTaskToAppTask(task, listId, listName) {
  return {
    id: `google-task-${task.id}`,
    sourceId: task.id,
    sourceListId: listId,
    title: task.title || "Tache Google sans titre",
    status: task.status === "completed" ? "Termine" : "A faire",
    priority: "Normale",
    list: normalizeTaskList(listName),
    source: "Google Tasks",
    due: task.due ? task.due.slice(0, 10) : "",
    notes: task.notes || "",
    completedAt: task.completed || "",
    updatedAt: task.updated || new Date().toISOString(),
  };
}

async function getGoogleTaskListId(token, appListName) {
  const response = await googleFetch(token, "tasks", "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
  const lists = response.items || [];
  const wanted = normalizeText(appListName || "");
  const match = lists.find((list) => mapGoogleTaskList(list.title) === normalizeTaskList(appListName))
    || lists.find((list) => normalizeText(list.title).includes(wanted))
    || lists[0];
  if (!match) throw new Error("Aucune liste Google Tasks disponible.");
  return match.id;
}

async function createGoogleCalendarEvent(event) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.calendar, "calendar");
  const calendarId = getAssistantCalendarId();
  const saved = await googleFetch(token, "calendar", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: calendarEventToGooglePayload(event),
  });
  return googleEventToAppEvent(saved, calendarId);
}

async function updateGoogleCalendarEvent(event) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.calendar, "calendar");
  const eventId = event.sourceId || event.id;
  const calendarId = event.sourceCalendarId || getAssistantCalendarId();
  const saved = await googleFetch(token, "calendar", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: calendarEventToGooglePayload(event),
  });
  return googleEventToAppEvent(saved, calendarId);
}

async function deleteGoogleCalendarEvent(event) {
  const tokens = readJson(TOKENS_FILE, {});
  const token = requireWritableGoogleToken(tokens.calendar, "calendar");
  const eventId = event.sourceId || event.id;
  const calendarId = event.sourceCalendarId || getAssistantCalendarId();
  await googleFetch(token, "calendar", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
}

function calendarEventToGooglePayload(event) {
  const payload = { summary: event.title };
  if (event.time) {
    payload.start = { dateTime: `${event.date}T${event.time}:00`, timeZone: "Europe/Paris" };
    payload.end = { dateTime: `${event.date}T${addMinutesToTime(event.time, 60)}:00`, timeZone: "Europe/Paris" };
  } else {
    payload.start = { date: event.date };
    payload.end = { date: addDaysToISO(event.date, 1) };
  }
  return payload;
}

function googleEventToAppEvent(event, calendarId = getAssistantCalendarId()) {
  return {
    id: `google-calendar-${calendarId}-${event.id}`,
    sourceId: event.id,
    sourceCalendarId: calendarId,
    title: event.summary || "Evenement sans titre",
    date: getEventDateKey(event.start),
    time: formatEventTime(event.start),
    source: calendarId === "primary" ? "Google Calendar - Personnel" : "Google Calendar - Assistants",
    updatedAt: event.updated || new Date().toISOString(),
  };
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

function normalizeTaskList(value) {
  const normalized = normalizeText(value || "");
  if (normalized.includes("dette")) return "Dettes";
  if (normalized.includes("cave") || normalized.includes("expe")) return "Cave ExpÃ©";
  if (normalized.includes("vigne") || normalized.includes("vignoble")) return "vignoble";
  if (normalized.includes("bureau")) return "bureau";
  if (normalized.includes("divers") || normalized.includes("perso")) return "divers et perso";
  return TASK_LISTS.includes(value) ? value : "bureau";
}

function addDaysToISO(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMinutesToTime(time, minutes) {
  const [hours, mins] = String(time || "09:00").split(":").map(Number);
  const date = new Date(2000, 0, 1, hours || 9, mins || 0);
  date.setMinutes(date.getMinutes() + minutes);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function googleFetch(token, service, url, options = {}) {
  const accessToken = await getValidAccessToken(token, service);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return {};
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google API a refuse la demande: ${detail}`);
  }
  return response.json();
}

function requireWritableGoogleToken(token, service) {
  if (!token?.access_token) {
    if (service === "calendar") throw new Error("Agenda Google n'est pas connecte.");
    if (service === "gmail") throw new Error("Gmail n'est pas connecte.");
    throw new Error("Google Tasks n'est pas connecte.");
  }
  const scopes = String(token.scope || "").split(/\s+/).filter(Boolean);
  const readonlyScope = {
    calendar: "https://www.googleapis.com/auth/calendar.readonly",
    tasks: "https://www.googleapis.com/auth/tasks.readonly",
    gmail: "https://www.googleapis.com/auth/gmail.readonly",
  }[service];
  const writeScope = {
    calendar: "https://www.googleapis.com/auth/calendar.events",
    tasks: "https://www.googleapis.com/auth/tasks",
    gmail: "https://www.googleapis.com/auth/gmail.modify",
  }[service];
  if (scopes.includes(readonlyScope) && !scopes.includes(writeScope)) {
    if (service === "calendar") throw new Error("Agenda est encore connecte en lecture seule. Reconnecte Agenda dans Connexions.");
    if (service === "gmail") throw new Error("Gmail est encore connecte en lecture seule. Reconnecte Gmail dans Connexions.");
    throw new Error("Google Tasks est encore connecte en lecture seule. Reconnecte Tasks dans Connexions.");
  }
  return token;
}

function requireGmailSendToken(token) {
  if (!token?.access_token) throw new Error("Gmail n'est pas connecte.");
  const scopes = String(token.scope || "").split(/\s+/).filter(Boolean);
  if (!hasGoogleScope(scopes, "https://www.googleapis.com/auth/gmail.send")) {
    throw new Error("Pour envoyer une reponse, reconnecte Gmail dans Connexions afin d'autoriser l'envoi.");
  }
  return token;
}

function hasGoogleScope(scopes, scope) {
  return scopes.includes(scope) || scopes.includes("https://mail.google.com/");
}

async function getValidAccessToken(token, service) {
  const expiresAt = Number(token.expiresAt || 0);
  const needsRefresh = token.refresh_token && expiresAt && Date.now() > expiresAt - 60_000;
  if (!needsRefresh) return token.access_token;

  const refreshed = await refreshGoogleToken(token.refresh_token);
  const tokens = readJson(TOKENS_FILE, {});
  if (service === "gmail" && token.emailAddress) {
    tokens.gmailAccounts = upsertGmailAccount(tokens.gmailAccounts || tokens.gmail, {
      ...token,
      ...refreshed,
      refresh_token: token.refresh_token,
      expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    });
    tokens.gmail = tokens.gmailAccounts[0] || tokens.gmail;
    writeJson(TOKENS_FILE, tokens);
    return tokens.gmailAccounts.find((account) => account.emailAddress === token.emailAddress)?.access_token || refreshed.access_token;
  }
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
    services: Object.keys(GOOGLE_SCOPES).map((name) => {
      const gmailAccounts = name === "gmail" ? getGmailAccounts(tokens) : [];
      const primaryToken = name === "gmail" ? gmailAccounts[0] : tokens[name];
      const actualScopes = parseScopeList(primaryToken?.scope);
      const missingScopes = GOOGLE_SCOPES[name].filter((scope) => !actualScopes.includes(scope));
      const needsReconnect = Boolean(primaryToken) && missingScopes.length > 0;
      return {
        id: name,
        label: name === "gmail" ? "Gmail" : name === "calendar" ? "Agenda" : name === "tasks" ? "Google Tasks" : "Drive",
        connected: Boolean(primaryToken),
        connectedAt: primaryToken?.connectedAt || null,
        scopes: GOOGLE_SCOPES[name],
        actualScopes,
        missingScopes,
        needsReconnect,
        accounts: gmailAccounts.map((account) => account.emailAddress || "Gmail"),
        accountCount: gmailAccounts.length,
      };
    }),
  };
}

function parseScopeList(scope) {
  return String(scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getGoogleDebugInfo() {
  const tokens = readJson(TOKENS_FILE, {});
  const state = getAppState();
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
  const state = getAppState();
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

  const calendarIds = getCalendarReadIds();
  const calendarResults = await Promise.all(calendarIds.map(async (calendarId) => {
    const response = await googleFetch(tokens.calendar, "calendar", `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    return {
      calendarId,
      events: response.items || [],
    };
  }));
  const events = calendarResults.flatMap((result) => result.events.map((event) => ({ ...event, calendarId: result.calendarId })));
  const agenda = Array.isArray(state.agenda) ? state.agenda : [];

  return sendJson(res, {
    ok: true,
    hasCalendarToken: true,
    assistantCalendarId: getAssistantCalendarId(),
    readCalendarIds: calendarIds,
    calendarTokenHasReadonlyScope: Boolean(tokens.calendar?.scope?.includes("https://www.googleapis.com/auth/calendar.readonly")),
    tokenServices: Object.keys(tokens),
    serverAgendaCount: agenda.length,
    googleEventCountNext30Days: events.length,
    eventsByCalendar: calendarResults.map((result) => ({
      calendarId: result.calendarId,
      count: result.events.length,
    })),
    sampleEvents: events.slice(0, 8).map((event) => ({
      title: event.summary || "Evenement sans titre",
      start: event.start?.dateTime || event.start?.date || "",
      calendarId: event.calendarId,
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
    assistantCalendarId: config.assistantCalendarId,
    ready: config.ready,
    requiredCallback: config.redirectUri,
  };
}

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${PORT}/auth/google/callback`;
  const assistantCalendarId = getAssistantCalendarId();
  return {
    clientId,
    clientSecret,
    redirectUri,
    assistantCalendarId,
    ready: Boolean(clientId && clientSecret && redirectUri),
  };
}

function getAssistantCalendarId() {
  return String(process.env.ASSISTANT_CALENDAR_ID || "primary").trim() || "primary";
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
  return "openai";
}

function getAiBaseUrl() {
  const configured = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || "";
  const baseUrl = configured.includes("openai.com") ? configured : "https://api.openai.com/v1";
  return baseUrl.replace(/\/+$/, "");
}

function getAiModel() {
  const configured = process.env.OPENAI_MODEL || process.env.AI_MODEL || "";
  return configured.toLowerCase().startsWith("gpt-") ? configured : "gpt-5.4-mini";
}

function saveAiConfig(config) {
  const current = getEnvFileValues();
  const next = {
    ...current,
    AI_PROVIDER: "openai",
    AI_BASE_URL: String(config.baseUrl || "https://api.openai.com/v1").trim(),
    AI_MODEL: String(config.model || "gpt-5.4-mini").trim(),
    OPENAI_API_KEY: String(config.openAiApiKey || current.OPENAI_API_KEY || "").trim(),
  };

  writeEnvFile(next);
  process.env.AI_PROVIDER = next.AI_PROVIDER;
  process.env.AI_BASE_URL = next.AI_BASE_URL;
  process.env.AI_MODEL = next.AI_MODEL;
  process.env.OPENAI_API_KEY = next.OPENAI_API_KEY;
}

function getBaqioConfigStatus() {
  const config = getBaqioConfig();
  return {
    baseUrl: config.baseUrl,
    syncMaxPages: config.syncMaxPages,
    hasApiKey: Boolean(config.apiKey),
    hasPassword: Boolean(config.password),
    hasSecret: Boolean(config.secret),
    hasOrderWebhookSecret: Boolean(config.orderWebhookSecret),
    orderWebhookUrl: getPublicAppUrl("/api/webhooks/orders"),
    ready: config.ready,
  };
}

function getBaqioConfig() {
  const baseUrl = (process.env.BAQIO_BASE_URL || "https://app.baqio.com/api/v1").replace(/\/+$/, "");
  const apiKey = process.env.BAQIO_API_KEY || "";
  const password = process.env.BAQIO_PASSWORD || "";
  const secret = process.env.BAQIO_SECRET || "";
  const orderWebhookSecret = process.env.ORDER_WEBHOOK_SECRET || "";
  const syncMaxPages = getBaqioSyncMaxPages();
  return {
    baseUrl,
    apiKey,
    password,
    secret,
    orderWebhookSecret,
    syncMaxPages,
    ready: Boolean(baseUrl && apiKey && password && secret),
  };
}

function getBaqioSyncMaxPages() {
  const value = Number(process.env.BAQIO_SYNC_MAX_PAGES || DEFAULT_BAQIO_SYNC_MAX_PAGES);
  return Math.min(200, Math.max(1, Number.isFinite(value) ? Math.round(value) : DEFAULT_BAQIO_SYNC_MAX_PAGES));
}

function saveBaqioConfig(config) {
  const current = getEnvFileValues();
  const next = {
    ...current,
    BAQIO_BASE_URL: String(config.baseUrl || current.BAQIO_BASE_URL || "https://app.baqio.com/api/v1").trim().replace(/\/+$/, ""),
    BAQIO_API_KEY: String(config.apiKey || current.BAQIO_API_KEY || "").trim(),
    BAQIO_PASSWORD: String(config.password || current.BAQIO_PASSWORD || "").trim(),
    BAQIO_SECRET: String(config.secret || current.BAQIO_SECRET || "").trim(),
    BAQIO_SYNC_MAX_PAGES: String(getBaqioSyncMaxPagesFromConfig(config.syncMaxPages || current.BAQIO_SYNC_MAX_PAGES)),
    ORDER_WEBHOOK_SECRET: String(config.orderWebhookSecret || current.ORDER_WEBHOOK_SECRET || "").trim(),
  };

  writeEnvFile(next);
  process.env.BAQIO_BASE_URL = next.BAQIO_BASE_URL;
  process.env.BAQIO_API_KEY = next.BAQIO_API_KEY;
  process.env.BAQIO_PASSWORD = next.BAQIO_PASSWORD;
  process.env.BAQIO_SECRET = next.BAQIO_SECRET;
  process.env.BAQIO_SYNC_MAX_PAGES = next.BAQIO_SYNC_MAX_PAGES;
  process.env.ORDER_WEBHOOK_SECRET = next.ORDER_WEBHOOK_SECRET;
}

function getBaqioSyncMaxPagesFromConfig(value) {
  const parsed = Number(value || DEFAULT_BAQIO_SYNC_MAX_PAGES);
  return Math.min(200, Math.max(1, Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_BAQIO_SYNC_MAX_PAGES));
}

async function sendBaqioStatus(res) {
  const config = getBaqioConfig();
  if (!config.ready) {
    return sendJson(res, {
      ok: false,
      ...getBaqioConfigStatus(),
      error: "Baqio n'est pas encore configure.",
    }, 409);
  }

  try {
    const customers = await baqioFetch("/customers?page=1", { method: "GET" });
    return sendJson(res, {
      ok: true,
      baseUrl: config.baseUrl,
      sampleCount: Array.isArray(customers) ? customers.length : 0,
      message: "Connexion Baqio valide.",
    });
  } catch (error) {
    return sendJson(res, {
      ok: false,
      baseUrl: config.baseUrl,
      error: error.message || "Baqio ne repond pas.",
    }, 502);
  }
}

async function syncBaqioCommercialData(res) {
  const config = getBaqioConfig();
  if (!config.ready) {
    return sendJson(res, {
      ok: false,
      error: "Baqio n'est pas encore configure.",
      state: getAppState(),
    }, 409);
  }

  try {
    const snapshot = await fetchBaqioCommercialSnapshot();
    const state = getAppState();
    state.baqio = snapshot;
    writeJson(STATE_FILE, state);
    return sendJson(res, { ok: true, baqio: snapshot, state });
  } catch (error) {
    return sendJson(res, {
      ok: false,
      error: error.message || "Synchronisation Baqio impossible.",
      state: getAppState(),
    }, 502);
  }
}

async function fetchBaqioCommercialSnapshot() {
  const [customersRaw, ordersRaw] = await Promise.all([
    baqioFetchPages("/customers", getBaqioSyncMaxPages()),
    baqioFetchPages("/orders", getBaqioSyncMaxPages()),
  ]);
  const customers = Array.isArray(customersRaw) ? customersRaw.map(normalizeBaqioCustomer) : [];
  const orders = Array.isArray(ordersRaw) ? ordersRaw.map(normalizeBaqioOrder) : [];
  return {
    customers,
    orders,
    summary: buildBaqioSummary(customers, orders),
    lastSyncedAt: new Date().toISOString(),
  };
}

async function baqioFetchPages(endpoint, maxPages = 3) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const payload = await baqioFetch(`${endpoint}${separator}page=${page}`);
    if (!Array.isArray(payload) || payload.length === 0) break;
    items.push(...payload);
    if (payload.length < 50) break;
  }
  return items;
}

function normalizeBaqioCustomer(customer) {
  const billing = customer.billing_information || {};
  const category = customer.customer_category || {};
  const isProfessional = Boolean(billing.company_name) || category.individual === false;
  const addressLines = [
    billing.address,
    billing.address1,
    billing.address_1,
    billing.street,
    billing.address2,
    billing.address_2,
  ].filter(Boolean);
  return {
    id: customer.id,
    name: customer.name || [billing.first_name, billing.last_name].filter(Boolean).join(" ") || billing.company_name || "Client sans nom",
    companyName: billing.company_name || "",
    email: customer.email || billing.email || "",
    phone: billing.mobile || billing.phone || "",
    address: addressLines.join(", "),
    city: billing.city || "",
    zip: billing.zip || "",
    country: billing.country || billing.country_name || "",
    category: category.name || "",
    type: isProfessional ? "Pro" : "Particulier",
    acceptsEmailing: Boolean(customer.accepts_emailing || customer.accepts_mailing),
    createdAt: customer.created_at || "",
    updatedAt: customer.updated_at || "",
  };
}

function normalizeBaqioOrder(order) {
  const customer = order.customer || {};
  return {
    id: order.id,
    name: order.name || order.number || `Commande ${order.id}`,
    customerId: order.customer_id || customer.id || null,
    customerName: customer.name || "Client inconnu",
    date: order.date || String(order.created_at || "").slice(0, 10),
    state: order.state || "",
    paymentStatus: order.payment_status || "",
    totalCents: Number(order.total_price_cents || 0),
    currency: order.total_price_currency || "EUR",
    bottleQuantity: Number.parseFloat(order.bottle_quantity || order.quantity || "0") || 0,
    channel: order.channel || "",
    orderType: order.order_type || "",
  };
}

function buildBaqioSummary(customers, orders) {
  const proCount = customers.filter((customer) => customer.type === "Pro").length;
  const individualCount = customers.filter((customer) => customer.type === "Particulier").length;
  const emailingCount = customers.filter((customer) => customer.acceptsEmailing).length;
  const totalRevenueCents = orders.reduce((sum, order) => sum + Number(order.totalCents || 0), 0);
  const bottleQuantity = orders.reduce((sum, order) => sum + Number(order.bottleQuantity || 0), 0);
  const byCustomer = new Map();

  orders.forEach((order) => {
    const key = order.customerId || order.customerName;
    const current = byCustomer.get(key) || {
      customerId: order.customerId,
      customerName: order.customerName,
      totalCents: 0,
      orderCount: 0,
      bottleQuantity: 0,
      lastOrderDate: "",
    };
    current.totalCents += Number(order.totalCents || 0);
    current.orderCount += 1;
    current.bottleQuantity += Number(order.bottleQuantity || 0);
    if (String(order.date || "") > String(current.lastOrderDate || "")) current.lastOrderDate = order.date || "";
    byCustomer.set(key, current);
  });

  return {
    customerCount: customers.length,
    proCount,
    individualCount,
    emailingCount,
    orderCount: orders.length,
    totalRevenueCents,
    bottleQuantity,
    topCustomers: [...byCustomer.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 5),
    recentOrders: [...orders]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 5),
    opportunities: buildBaqioOpportunities(customers, orders),
  };
}

function buildBaqioOpportunities(customers, orders) {
  const orderedCustomerIds = new Set(orders.map((order) => order.customerId).filter(Boolean));
  const byCustomer = new Map();
  orders.forEach((order) => {
    const key = order.customerId || order.customerName;
    const current = byCustomer.get(key) || {
      customerId: order.customerId,
      customerName: order.customerName,
      totalCents: 0,
      orderCount: 0,
      bottleQuantity: 0,
      lastOrderDate: "",
    };
    current.totalCents += Number(order.totalCents || 0);
    current.orderCount += 1;
    current.bottleQuantity += Number(order.bottleQuantity || 0);
    if (String(order.date || "") > String(current.lastOrderDate || "")) current.lastOrderDate = order.date || "";
    byCustomer.set(key, current);
  });

  const bestCustomers = [...byCustomer.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 3)
    .map((customer) => ({
      id: `best-${customer.customerId || normalizeText(customer.customerName)}`,
      title: `Preparer une attention commerciale pour ${customer.customerName}`,
      type: "Fidelisation",
      priority: "Importante",
      detail: `${formatEuroCentsServer(customer.totalCents)} de CA lu, ${customer.orderCount} commande(s), dernier achat ${customer.lastOrderDate || "date inconnue"}.`,
      taskTitle: `Relance fidelisation : ${customer.customerName}`,
    }));

  const proProspects = customers
    .filter((customer) => customer.type === "Pro" && customer.acceptsEmailing && !orderedCustomerIds.has(customer.id))
    .slice(0, 3)
    .map((customer) => ({
      id: `pro-${customer.id}`,
      title: `Relancer le prospect pro ${customer.name}`,
      type: "Relance pro",
      priority: "Normale",
      detail: `${customer.category || "Categorie inconnue"}${customer.city ? ` - ${customer.city}` : ""}${customer.email ? ` - ${customer.email}` : ""}.`,
      taskTitle: `Relance pro Baqio : ${customer.name}`,
    }));

  const recentBigOrders = [...orders]
    .filter((order) => order.totalCents >= 30000)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 3)
    .map((order) => ({
      id: `order-${order.id}`,
      title: `Suivi apres commande ${order.name}`,
      type: "Suivi commande",
      priority: "Normale",
      detail: `${order.customerName} - ${formatEuroCentsServer(order.totalCents)} - ${Number(order.bottleQuantity || 0).toFixed(0)} bouteille(s) - ${order.date || "date inconnue"}.`,
      taskTitle: `Suivi commande Baqio : ${order.customerName}`,
    }));

  return [...bestCustomers, ...proProspects, ...recentBigOrders].slice(0, 8);
}

function formatEuroCentsServer(value) {
  return `${Math.round(Number(value || 0) / 100).toLocaleString("fr-FR")} EUR`;
}

async function handleOrderWebhook(req, requestUrl, res) {
  const config = getBaqioConfig();
  const expectedSecret = String(config.orderWebhookSecret || "").trim();
  const providedSecret = String(
    req.headers["x-order-webhook-secret"]
      || req.headers["x-webhook-secret"]
      || requestUrl.searchParams.get("secret")
      || ""
  ).trim();

  if (!expectedSecret) {
    return sendJson(res, { error: "Webhook commandes non configure: ajoute un secret dans Connexions > Baqio." }, 409);
  }
  if (!safeCompare(expectedSecret, providedSecret)) {
    return sendJson(res, { error: "Secret webhook invalide." }, 401);
  }

  const body = await readBody(req);
  const state = getAppState();
  const order = normalizeIncomingOrder(body);
  const existing = state.orderPipeline.find((item) =>
    item.sourceId && order.sourceId ? item.sourceId === order.sourceId : item.reference === order.reference
  );
  const now = new Date().toISOString();
  const event = {
    id: randomUUID(),
    status: order.status,
    note: body.note || body.notes || body.message || "Commande recue par webhook.",
    source: order.source,
    createdAt: now,
  };

  const savedOrder = existing
    ? {
        ...existing,
        ...order,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
        closedAt: order.status === "Expedie" ? (existing.closedAt || now) : "",
        events: [...(existing.events || []), event],
      }
    : {
        ...order,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        closedAt: order.status === "Expedie" ? now : "",
        events: [event],
      };

  state.orderPipeline = existing
    ? state.orderPipeline.map((item) => item.id === existing.id ? savedOrder : item)
    : [savedOrder, ...state.orderPipeline];
  state.requests = upsertOrderAssistantRequest(state.requests || [], savedOrder, existing ? "mise a jour" : "nouvelle");
  writeJson(STATE_FILE, normalizeAppState(state));

  return sendJson(res, {
    ok: true,
    order: savedOrder,
    assistantNotice: "Commande transmise a Fernand, Gaspard, Suzette et Paulo via le suivi des demandes.",
  });
}

async function updateOrderPipelineStatus(req, res) {
  const body = await readBody(req);
  const state = getAppState();
  const id = String(body.id || "").trim();
  const status = normalizeOrderStatus(body.status);
  const order = state.orderPipeline.find((item) => item.id === id || item.sourceId === id || item.reference === id);
  if (!order) return sendJson(res, { error: "Commande introuvable." }, 404);

  const now = new Date().toISOString();
  const next = {
    ...order,
    status,
    updatedAt: now,
    closedAt: status === "Expedie" ? (order.closedAt || now) : "",
    events: [
      ...(order.events || []),
      {
        id: randomUUID(),
        status,
        note: String(body.note || "Statut mis a jour depuis l'application.").trim(),
        source: "Assistant Xavier",
        createdAt: now,
      },
    ],
  };
  state.orderPipeline = state.orderPipeline.map((item) => item.id === order.id ? next : item);
  state.requests = upsertOrderAssistantRequest(state.requests || [], next, "mise a jour");
  writeJson(STATE_FILE, normalizeAppState(state));
  return sendJson(res, { ok: true, order: next, state: normalizeAppState(state) });
}

function normalizeIncomingOrder(body) {
  const customer = body.customer || body.client || {};
  const delivery = body.delivery || body.shipping || {};
  const address = body.address || body.deliveryAddress || delivery.address || customer.address || "";
  const reference = String(body.reference || body.ref || body.number || body.orderNumber || body.name || body.id || "").trim();
  const sourceId = String(body.sourceId || body.orderId || body.id || "").trim();
  const customerName = String(
    body.customerName
      || body.clientName
      || customer.name
      || customer.companyName
      || body.companyName
      || "Client non renseigne"
  ).trim();
  const totalCents = Number(body.totalCents ?? body.total_cents ?? body.total_amount_cents ?? 0);
  const total = body.total || body.amount || body.totalAmount || "";
  const items = normalizeOrderItems(body.items || body.lines || body.orderItems || body.products || []);
  return {
    sourceId,
    reference: reference || sourceId || `commande-${Date.now()}`,
    status: normalizeOrderStatus(body.status || body.state || body.workflowStatus || "En commande"),
    customerName,
    customerEmail: String(body.customerEmail || customer.email || "").trim(),
    customerPhone: String(body.customerPhone || customer.phone || "").trim(),
    deliveryAddress: String(address || "").trim(),
    deliveryCity: String(body.deliveryCity || body.city || delivery.city || customer.city || "").trim(),
    deliveryZip: String(body.deliveryZip || body.zip || body.postalCode || delivery.zip || customer.zip || "").trim(),
    deliveryDate: String(body.deliveryDate || body.shippingDate || body.expeditionDate || body.dueDate || "").slice(0, 10),
    totalCents,
    totalLabel: total ? String(total) : (totalCents ? formatEuroCentsServer(totalCents) : ""),
    items,
    raw: body,
    source: String(body.source || "Webhook commande").trim(),
  };
}

function normalizeOrderPipeline(orders) {
  return orders.map((order) => ({
    id: order.id || randomUUID(),
    sourceId: String(order.sourceId || "").trim(),
    reference: String(order.reference || order.name || order.id || "commande").trim(),
    status: normalizeOrderStatus(order.status),
    customerName: String(order.customerName || "Client non renseigne").trim(),
    customerEmail: String(order.customerEmail || "").trim(),
    customerPhone: String(order.customerPhone || "").trim(),
    deliveryAddress: String(order.deliveryAddress || "").trim(),
    deliveryCity: String(order.deliveryCity || "").trim(),
    deliveryZip: String(order.deliveryZip || "").trim(),
    deliveryDate: String(order.deliveryDate || "").slice(0, 10),
    totalCents: Number(order.totalCents || 0),
    totalLabel: String(order.totalLabel || "").trim(),
    items: normalizeOrderItems(order.items || []),
    raw: order.raw || {},
    source: String(order.source || "Webhook commande").trim(),
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
    closedAt: normalizeOrderStatus(order.status) === "Expedie" ? (order.closedAt || order.updatedAt || new Date().toISOString()) : "",
    events: Array.isArray(order.events) ? order.events : [],
  }));
}

function normalizeOrderItems(items) {
  return Array.isArray(items) ? items.slice(0, 40).map((item) => ({
    name: String(item.name || item.title || item.productName || item.product_name || "Article").trim(),
    quantity: Number(item.quantity || item.qty || item.count || 0),
    sku: String(item.sku || item.reference || item.productReference || "").trim(),
  })) : [];
}

function normalizeOrderStatus(value) {
  const compact = normalizeText(value || "").replace(/[^a-z0-9]/g, "");
  if (["prete", "pret", "pretepourexpedition", "pretpourexpedition", "ready", "readytoship", "aexpedier"].includes(compact)) return "Prete pour expedition";
  if (["livraison", "enlivraison", "delivery", "outfordelivery"].includes(compact)) return "En livraison";
  if (["expedie", "expediee", "expediees", "shipped", "done", "closed", "termine"].includes(compact)) return "Expedie";
  return "En commande";
}

function upsertOrderAssistantRequest(requests, order, mode) {
  const marker = `order:${order.id}`;
  const original = [
    `${mode === "nouvelle" ? "Nouvelle commande" : "Mise a jour commande"} ${order.reference}`,
    `Client: ${order.customerName}`,
    `Statut: ${order.status}`,
    order.deliveryDate ? `Date prevue: ${order.deliveryDate}` : "",
    order.deliveryAddress || order.deliveryCity ? `Adresse: ${[order.deliveryAddress, order.deliveryZip, order.deliveryCity].filter(Boolean).join(", ")}` : "",
    order.items?.length ? `Articles: ${order.items.map((item) => `${item.quantity || ""} ${item.name}`.trim()).join("; ")}` : "",
  ].filter(Boolean).join("\n");
  const existing = requests.find((request) => request.orderId === order.id || request.marker === marker);
  const next = {
    ...(existing || {}),
    id: existing?.id || randomUUID(),
    marker,
    orderId: order.id,
    title: `Commande ${order.reference} - ${order.customerName}`.slice(0, 90),
    original,
    status: order.status === "Expedie" ? "Clos" : "Demande a traiter",
    agents: ["Gaspard", "Suzette", "Paulo"],
    report: existing?.report || "",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return existing
    ? requests.map((request) => request.id === existing.id ? next : request)
    : [next, ...requests];
}

function safeCompare(expected, provided) {
  const expectedBuffer = Buffer.from(String(expected));
  const providedBuffer = Buffer.from(String(provided));
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function getPublicAppUrl(pathname = "") {
  const base = String(process.env.APP_URL || process.env.PUBLIC_APP_URL || "https://vps-b6bb35e6.vps.ovh.net").replace(/\/+$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function baqioFetch(endpoint, options = {}) {
  const config = getBaqioConfig();
  const url = `${config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.password}`).toString("base64")}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : payload?.error || payload?.message || response.statusText;
    throw new Error(`Baqio a refuse la demande (${response.status}) : ${detail}`);
  }
  return payload;
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
      error: "OpenAI n'est pas encore configure. Verifie la cle API.",
    }, 503);
  }
}

async function sendAiChat(body, res) {
  const routed = parseWorkerMention(String(body.message || ""));
  const message = routed.message.trim();
  const mode = body.mode === "report" ? "report" : "quick";
  if (!message) {
    return sendJson(res, { error: "Message vide." }, 400);
  }

  const directAnswer = await tryHandleDirectWorker(message, mode, routed.worker);
  if (directAnswer) {
    rememberAiExchange(message, directAnswer.answer);
    return sendJson(res, {
      ok: true,
      model: directAnswer.worker,
      mode,
      routedTo: directAnswer.worker,
      cost: 0,
      answer: directAnswer.answer,
    });
  }

  const config = getAiConfigStatus();
  try {
    const models = await fetchAiModels(config);
    const model = config.model || models[0];
    if (!model) {
      return sendJson(res, {
        error: "Aucun modele OpenAI configure.",
      }, 409);
    }

    if (mode === "report" && !routed.worker) {
      const workflow = await runFernandTeamWorkflow(message, config, model);
      rememberAiExchange(message, workflow.finalReport);
      return sendJson(res, {
        ok: true,
        model,
        mode,
        routedTo: "fernand",
        answer: workflow.finalReport,
        workflow,
      });
    }

    const { answer } = await callAiChatCompletion(config, model, buildAiMessages(message, mode, routed.worker));
    rememberAiExchange(message, answer);
    return sendJson(res, { ok: true, model, mode, routedTo: routed.worker || "fernand", answer });
  } catch (error) {
    return sendJson(res, {
      error: error.message || "OpenAI ne repond pas encore. Verifie la configuration API.",
    }, 503);
  }
}

async function callAiChatCompletion(config, model, messages, maxCompletionTokens = 900) {
  const headers = { "Content-Type": "application/json" };
  headers.Authorization = `Bearer ${process.env.OPENAI_API_KEY}`;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_completion_tokens: maxCompletionTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI a refuse la demande: ${detail}`);
  }

  const payload = await response.json();
  const answer = payload.choices?.[0]?.message?.content?.trim() || "Je n'ai pas recu de reponse du modele.";
  recordAiUsage(model, payload.usage, config.provider);
  return { answer, payload };
}

async function runFernandTeamWorkflow(message, config, model) {
  const serviceQuestion = buildFernandServiceQuestion(message);
  const managerBrief = [
    `Demande originale de Xavier: ${message}`,
    `Question de Fernand aux services: ${serviceQuestion}`,
  ].join("\n\n");
  const workers = getReportWorkers(message);
  const workerResponses = [];

  for (const worker of workers) {
    const { answer } = await callAiChatCompletion(
      config,
      model,
      buildWorkerConsultationMessages(message, worker.key, serviceQuestion),
      650
    );
    workerResponses.push({
      worker: worker.key,
      label: worker.label,
      serviceQuestion,
      answer,
      createdAt: new Date().toISOString(),
    });
  }

  const { answer: finalReport } = await callAiChatCompletion(
    config,
    model,
    buildFernandFinalReportMessages(message, serviceQuestion, workerResponses),
    1100
  );

  return {
    managerBrief,
    serviceQuestion,
    workerResponses,
    finalReport,
    createdAt: new Date().toISOString(),
  };
}

function getReportWorkers() {
  return [
    { key: "organisation", label: "Paulo" },
    { key: "secretaire", label: "Suzette" },
    { key: "commercial", label: "Gaspard" },
  ];
}

function buildFernandServiceQuestion(message) {
  return [
    "Fernand transmet cette demande de Xavier aux services concernes.",
    `Demande de Xavier: ${message}`,
    "Reponds dans ton role uniquement.",
    "Dis clairement si tu es concerne ou non.",
    "Donne les points utiles, les risques, les informations manquantes et les prochaines actions que Fernand doit prendre en compte.",
  ].join("\n");
}

function parseWorkerMention(rawMessage) {
  const text = String(rawMessage || "").trim();
  const match = text.match(/^@([a-zA-ZÀ-ÿ]+)\s+(.+)$/);
  if (!match) return { worker: "", message: text };
  const worker = normalizeWorkerName(match[1]);
  return {
    worker,
    message: worker ? match[2] : text,
  };
}

function normalizeWorkerName(value) {
  const normalized = normalizeText(value);
  if (["fernand", "chef", "brasdroit", "bras-droit"].includes(normalized)) return "fernand";
  if (["paulo", "agenda", "planning", "calendrier", "rdv", "coach", "mental", "stress", "organisation", "orga", "taches", "productivite"].includes(normalized)) return "organisation";
  if (["suzette", "secretaire", "secretariat", "email", "emails", "admin"].includes(normalized)) return "secretaire";
  if (["gaspard", "commercial", "commerce", "client", "clients", "baqio"].includes(normalized)) return "commercial";
  return "";
}

function getWorkerDisplayName(worker) {
  return {
    fernand: "Fernand",
    organisation: "Paulo",
    secretaire: "Suzette",
    commercial: "Gaspard",
  }[worker] || worker || "Fernand";
}

async function tryHandleDirectWorker(message, mode, forcedWorker = "") {
  if (mode !== "quick") return null;
  const normalized = normalizeText(message);
  const asksAgenda = /(rendez[-\s]?vous|rdv|agenda|planning|calendrier)/.test(normalized);
  if (isMailDraftConfirmation(message)) {
    return await tryHandleSecretaryMailDirect(message, forcedWorker || "secretaire");
  }
  const mailAnswer = await tryHandleSecretaryMailDirect(message, forcedWorker);
  if (mailAnswer) return mailAnswer;

  if (forcedWorker && !["fernand", "organisation"].includes(forcedWorker)) return null;
  if (!asksAgenda) return null;

  const state = getAppState();
  if (/(prochain|suivant|apres)/.test(normalized)) {
    return {
      worker: "agenda-direct",
      answer: getNextAgendaAnswer(state),
    };
  }
  if (/(demain|tomorrow)/.test(normalized)) {
    return {
      worker: "agenda-direct",
      answer: getAgendaForDateAnswer(state, addDaysISO(1), "demain"),
    };
  }
  if (/(aujourd|ce jour|journee)/.test(normalized)) {
    return {
      worker: "agenda-direct",
      answer: getAgendaForDateAnswer(state, todayISO(), "aujourd'hui"),
    };
  }

  return null;
}

async function tryHandleSecretaryMailDirect(message, forcedWorker = "") {
  const normalized = normalizeText(message);
  const state = getAppState();
  const hasPendingDraft = state.pendingMailDraft?.status === "awaiting_confirmation";
  const isSecretary = forcedWorker === "secretaire"
    || /(suzette|secretaire|secretariat|email|emails|mail|mails|gmail)/.test(normalized)
    || (hasPendingDraft && isMailDraftConfirmation(message));
  if (!isSecretary) return null;

  if (isMailDraftConfirmation(message)) {
    const pending = state.pendingMailDraft;
    if (!pending?.mailId || !pending?.body || pending.status !== "awaiting_confirmation") {
      return {
        worker: "secretaire",
        answer: "Je n'ai pas de brouillon email en attente de validation. Demande-moi d'abord de preparer une reponse a un email precis.",
      };
    }
    const draft = await createGmailReplyDraft(pending.mailId, pending.body);
    const nextState = getAppState();
    nextState.pendingMailDraft = {
      ...pending,
      status: "draft_created",
      gmailDraftId: draft.id,
      updatedAt: new Date().toISOString(),
    };
    writeJson(STATE_FILE, nextState);
    return {
      worker: "secretaire",
      answer: `C'est fait : j'ai cree le brouillon Gmail pour "${draft.title}". Il est dans les brouillons, rien n'a ete envoye.`,
    };
  }

  if (/(reponds|réponds|repondre|répondre|prepare|prépare).*(email|mail)|(?:email|mail).*(reponds|réponds|repondre|répondre|prepare|prépare)/.test(normalized)) {
    const mail = findRelevantMailForMessage(state, message);
    if (!mail) {
      return {
        worker: "secretaire",
        answer: "Je n'arrive pas a identifier l'email auquel tu veux repondre. Donne-moi le nom de l'expediteur ou quelques mots de l'objet, et je prepare le brouillon dans le chat.",
      };
    }
    const body = buildSecretaryReplyDraft(mail, message);
    const nextState = getAppState();
    nextState.pendingMailDraft = {
      id: randomUUID(),
      mailId: mail.id,
      sourceId: mail.sourceId || "",
      mailbox: mail.mailbox || "",
      title: mail.title || "(Sans objet)",
      body,
      status: "awaiting_confirmation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeJson(STATE_FILE, nextState);
    return {
      worker: "secretaire",
      answer: [
        `J'ai prepare une reponse pour l'email "${mail.title || "(Sans objet)"}".`,
        "",
        "Brouillon propose :",
        body,
        "",
        "Si c'est bon, reponds simplement : c'est bon.",
        "Je le mettrai alors dans les brouillons Gmail, sans l'envoyer.",
      ].join("\n"),
    };
  }

  const asksImportant = /(important|prioritaire|urgent|a traiter|repondre|reponse|mail|email)/.test(normalized)
    && /(important|prioritaire|urgent|recu|recus|nouveau|nouveaux|mail|email)/.test(normalized);
  if (asksImportant) {
    return {
      worker: "secretaire",
      answer: buildImportantMailAnswer(state),
    };
  }

  return null;
}

function isMailDraftConfirmation(message) {
  const normalized = normalizeText(message);
  return /(c.?est bon|cest bon|c est bon|ok|valide|valides|tu peux|vas y|mets le en brouillon|met le en brouillon|cree le brouillon|crée le brouillon)/.test(normalized);
}

function buildImportantMailAnswer(state) {
  const mails = rankImportantMails(state.mail || []).slice(0, 5);
  if (!mails.length) return "Je ne vois aucun email synchronise pour le moment. La synchro Gmail est peut-etre a relancer.";
  return [
    `Je vois ${mails.length} email(s) a regarder en priorite :`,
    ...mails.map((mail, index) => `${index + 1}. ${mail.unread ? "[Non lu] " : ""}${mail.title || "(Sans objet)"} - ${mail.source || "Gmail"} - ${formatDateTimeServer(mail.createdAt)}\n   ${trimText(mail.detail || mail.excerpt || "", 180)}`),
    "",
    "Je peux ensuite preparer une reponse dans le chat. Je ne l'enverrai pas : apres ton accord, je la placerai seulement dans les brouillons Gmail.",
  ].join("\n");
}

function rankImportantMails(mails) {
  const importantWords = /(commande|urgent|devis|facture|reglement|règlement|paiement|livraison|client|reservation|réservation|rendez|rdv|relance|contrat|echeance|échéance)/i;
  return [...mails]
    .map((mail) => {
      const haystack = `${mail.title || ""} ${mail.detail || ""} ${mail.source || ""}`;
      let score = 0;
      if (mail.unread) score += 5;
      if (importantWords.test(haystack)) score += 4;
      if (String(mail.source || "").startsWith("Gmail")) score += 1;
      score += Math.max(0, 3 - Math.floor((Date.now() - new Date(mail.createdAt || 0).getTime()) / 86400000));
      return { mail, score };
    })
    .sort((a, b) => b.score - a.score || String(b.mail.createdAt || "").localeCompare(String(a.mail.createdAt || "")))
    .map((item) => item.mail);
}

function findRelevantMailForMessage(state, message) {
  const mails = state.mail || [];
  if (!mails.length) return null;
  const words = normalizeSearchWords(message)
    .filter((word) => !["email", "emails", "mail", "mails", "reponds", "repondre", "prepare", "preparer", "reponse", "brouillon", "suzette", "secretaire"].includes(word));
  if (!words.length || /(dernier|premier|recent|récent)/.test(normalizeText(message))) return rankImportantMails(mails)[0] || mails[0];
  const scored = mails.map((mail) => {
    const haystack = normalizeText([mail.title, mail.source, mail.detail, mail.mailbox].filter(Boolean).join(" "));
    return {
      mail,
      score: words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0),
    };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].mail : null;
}

function buildSecretaryReplyDraft(mail, message) {
  const subject = normalizeText(`${mail.title || ""} ${mail.detail || ""}`);
  const asksOrder = /(commande|livraison|carton|bouteille|prix|tarif)/.test(subject);
  const asksInfo = /(question|renseignement|information|devis)/.test(subject);
  const tone = /court|rapide|simple/.test(normalizeText(message)) ? "court" : "normal";
  const lines = ["Bonjour,"];
  lines.push("");
  if (asksOrder) {
    lines.push("Merci pour votre message et pour votre commande.");
    lines.push("Je l'ai bien recue et je reviens vers vous rapidement avec la confirmation et les informations pratiques.");
  } else if (asksInfo) {
    lines.push("Merci pour votre message.");
    lines.push("Je prends connaissance de votre demande et je reviens vers vous rapidement avec les elements utiles.");
  } else {
    lines.push("Merci pour votre message.");
    lines.push("Je reviens vers vous rapidement.");
  }
  if (tone !== "court") {
    lines.push("");
    lines.push("Bien cordialement,");
    lines.push("Xavier");
  }
  return lines.join("\n");
}

function getNextAgendaAnswer(state) {
  const next = getUpcomingAgendaEvents(state)[0];
  if (!next) return "Je ne vois aucun rendez-vous a venir dans l'agenda synchronise.";
  return `Ton prochain rendez-vous est : ${next.time || formatDateLabel(next.date)} - ${next.title}${next.source ? ` (${next.source})` : ""}.`;
}

function getAgendaForDateAnswer(state, dateKey, label) {
  const events = getUpcomingAgendaEvents(state).filter((event) => event.date === dateKey);
  if (!events.length) return `Je ne vois aucun rendez-vous ${label} dans l'agenda synchronise.`;
  const details = events.map((event) => `${event.time || formatDateLabel(event.date)} - ${event.title}`).join("; ");
  return events.length === 1
    ? `Tu as 1 rendez-vous ${label} : ${details}.`
    : `Tu as ${events.length} rendez-vous ${label} : ${details}.`;
}

function getUpcomingAgendaEvents(state) {
  const today = todayISO();
  return (state.agenda || [])
    .map((event) => ({
      date: event.date || inferDateKeyFromAgendaTime(event.time) || today,
      time: event.time || "",
      title: event.title || "Evenement sans titre",
      source: event.source || "",
      sourceCalendarId: event.sourceCalendarId || "",
    }))
    .filter((event) => event.date >= today)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return String(a.time).localeCompare(String(b.time), "fr");
    });
}

function formatDateLabel(dateKey) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${dateKey}T12:00:00`));
}

function buildAiMessages(message, mode = "quick", worker = "") {
  const memory = readAiMemory();
  const recentExchanges = memory.exchanges.slice(-8).flatMap((exchange) => [
    { role: "user", content: exchange.user },
    { role: "assistant", content: exchange.assistant },
  ]);
  const state = getAppState();
  const knowledgeContext = findRelevantKnowledge(message);
  const agentInstructions = getAgentInstructionContext(worker || (mode === "report" ? "fernand" : "fernand"));
  const commercialContext = getCommercialAiContext(state, message, worker, mode);
  const secretaryMailContext = getSecretaryMailContext(state, message, worker, mode);

  return [
    {
      role: "system",
      content: [
        mode === "report" || worker === "fernand"
          ? [
              "Tu es Fernand, le bras droit de Xavier et le chef d'equipe de ses assistants internes.",
              "Chaque message de Xavier est une demande-projet a traiter serieusement.",
              "Commence par reformuler la demande en une phrase courte.",
              "Puis consulte mentalement tes services internes: Paulo pour l'organisation, Suzette pour le secretariat, Gaspard pour le commercial.",
              "Chaque service doit donner uniquement ce qui est utile; indique 'non concerne' si un service n'apporte rien.",
              "Les services peuvent se repondre entre eux uniquement pour clarifier une dependance, mais Fernand tranche et synthetise.",
              "Ensuite, controle la coherence du travail comme chef d'equipe et rends un rapport clair a Xavier.",
              "Structure toujours la reponse avec: Reformulation, Services consultes, Rapport Fernand, Prochaines actions.",
            ].join(" ")
          : [
              "Tu es Fernand, le bras droit de Xavier.",
              "Mode question rapide: reponds directement a la question, sans rapport, sans reformulation longue et sans consulter les services internes.",
              "Si la question demande une information simple comme le prochain rendez-vous, donne simplement la reponse utile en une ou deux phrases.",
            ].join(" "),
        worker && worker !== "fernand" ? `La demande est adressee au service interne: ${getWorkerDisplayName(worker)}. Reste dans ce role et repond simplement.` : "",
        "Hierarchie permanente: Xavier decide; Fernand coordonne; Paulo, Suzette et Gaspard sont des services specialises. Un service peut signaler qu'un autre service doit etre consulte, mais il ne parle pas a sa place.",
        "Ne dis pas que tu as envoye des emails, modifie l'agenda, appele Baqio ou change des fichiers si l'application ne l'a pas vraiment fait.",
        "Gaspard utilise Baqio seulement comme base lue et synchronisee; il propose des relances, brouillons et priorites, mais ne promet aucune action automatique.",
        "Paulo integre agenda, taches, routine, priorites et charge mentale sans faire de diagnostic medical.",
        "Agenda Google: l'application lit l'agenda personnel Google et l'agenda assistants. Les nouveaux evenements crees par l'application vont dans l'agenda assistants. Utilise les rendez-vous fournis dans le contexte; si aucun rendez-vous n'apparait, dis que l'agenda synchronise est vide ou pas encore synchronise, et ne fabrique jamais de planning.",
        "Reponds en francais, de facon concrete.",
        "Tu as une memoire courte des derniers echanges fournie dans le contexte.",
        "Si Xavier fait reference a une chose dite juste avant, utilise cette memoire.",
        agentInstructions ? `Consignes permanentes du role: ${agentInstructions}` : "",
        knowledgeContext ? `Memoire documentaire utile: ${knowledgeContext}` : "",
        secretaryMailContext ? `Contexte email Gmail synchronise pour Suzette: ${secretaryMailContext}` : "",
        commercialContext ? `Contexte commercial Baqio synchronise: ${commercialContext}` : "",
        commercialContext ? "Regle prioritaire commercial: Baqio est connecte et des donnees sont disponibles dans le contexte ci-dessus. Ignore toute ancienne consigne disant que Baqio n'est pas connecte." : "",
        "Quand la demande ressemble a une tache, propose une prochaine action claire.",
        "Ne pretends pas avoir modifie l'agenda, les emails ou les fichiers si ce n'est pas fait par l'application.",
        getAiStateSummary(state),
      ].join(" "),
    },
    ...recentExchanges,
    { role: "user", content: message },
  ];
}

function buildWorkerConsultationMessages(originalMessage, worker, serviceQuestion) {
  const state = getAppState();
  const knowledgeContext = findRelevantKnowledge(originalMessage);
  const agentInstructions = getAgentInstructionContext(worker);
  const commercialContext = getCommercialAiContext(state, originalMessage, worker, "report");
  const secretaryMailContext = getSecretaryMailContext(state, originalMessage, worker, "report");

  return [
    {
      role: "system",
      content: [
        `Tu es ${getWorkerDisplayName(worker)}, service interne de l'equipe de Xavier.`,
        "Tu reponds a la fois a Fernand et a Xavier: Xavier doit pouvoir verifier que tu as compris la question de Fernand.",
        "Commence par un court en-tete 'Question de Fernand comprise' puis reformule en une phrase la question que Fernand t'a posee.",
        "Ensuite reponds dans ton role uniquement. Si ton service n'est pas concerne, dis-le clairement et explique en une phrase pourquoi.",
        "Ne promets aucune action reelle si l'application ne l'a pas faite.",
        "Structure ta reponse avec: Ce que j'ai compris, Reponse du service, Points a transmettre a Fernand.",
        "Reste concis: 8 a 14 lignes maximum.",
        agentInstructions ? `Consignes permanentes du role: ${agentInstructions}` : "",
        knowledgeContext ? `Memoire documentaire utile: ${knowledgeContext}` : "",
        secretaryMailContext ? `Contexte email Gmail synchronise pour Suzette: ${secretaryMailContext}` : "",
        commercialContext ? `Contexte commercial Baqio synchronise: ${commercialContext}` : "",
        getAiStateSummary(state),
      ].filter(Boolean).join(" "),
    },
    { role: "user", content: serviceQuestion },
  ];
}

function buildFernandFinalReportMessages(originalMessage, serviceQuestion, workerResponses) {
  const state = getAppState();
  const services = workerResponses.map((response) => [
    `Service: ${response.label}`,
    `Question recue: ${response.serviceQuestion}`,
    `Reponse: ${response.answer}`,
  ].join("\n")).join("\n\n---\n\n");

  return [
    {
      role: "system",
      content: [
        "Tu es Fernand, bras droit de Xavier et chef d'equipe.",
        "Tu as envoye une question aux services internes et tu as recu leurs reponses.",
        "Ton role est de verifier la coherence, corriger les malentendus, signaler les limites, puis rendre une synthese claire a Xavier.",
        "N'invente pas d'action executee. Si un service n'est pas concerne, ne force pas son avis.",
        "Structure avec: Controle de comprehension, Synthese des services, Decision Fernand, Prochaines actions.",
        "Le rapport final doit etre lisible et actionnable.",
        getAiStateSummary(state),
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Demande originale de Xavier:\n${originalMessage}`,
        `Question envoyee par Fernand aux services:\n${serviceQuestion}`,
        `Reponses des services:\n${services}`,
      ].join("\n\n"),
    },
  ];
}

function getSecretaryMailContext(state, message, worker = "", mode = "quick") {
  const normalized = normalizeText(`${worker} ${message}`);
  const mentionsMail = worker === "secretaire"
    || mode === "report"
    || /(suzette|secretaire|secretariat|email|emails|mail|mails|gmail|inbox|boite|boîte|repondre|répondre|brouillon|important|urgent)/.test(normalized);
  const mails = Array.isArray(state.mail) ? state.mail : [];
  if (!mentionsMail || !mails.length) return "";

  const important = rankImportantMails(mails).slice(0, 8).map((mail, index) => [
    `${index + 1}. ${mail.title || "(Sans objet)"}`,
    mail.source ? `source ${mail.source}` : "",
    mail.mailbox ? `boite ${mail.mailbox}` : "",
    mail.unread ? "non lu" : "deja lu",
    mail.createdAt ? `date ${formatDateTimeServer(mail.createdAt)}` : "",
    mail.detail ? `extrait ${trimText(mail.detail, 220)}` : "",
  ].filter(Boolean).join(", "));

  const pending = state.pendingMailDraft?.status === "awaiting_confirmation"
    ? `Brouillon email en attente de validation pour "${state.pendingMailDraft.title}". Si Xavier dit "c'est bon", l'application peut creer un brouillon Gmail, sans envoyer.`
    : "";

  return [
    `${mails.length} email(s) Gmail synchronise(s) dans l'application.`,
    important.length ? `Emails a regarder en priorite: ${important.join(" | ")}.` : "",
    pending,
    "Regle Suzette: tu peux analyser et preparer une reponse dans le chat. Tu ne dois jamais dire qu'un email est envoye. Apres validation de Xavier, l'application cree seulement un brouillon Gmail.",
  ].filter(Boolean).join(" ");
}

function getCommercialAiContext(state, message, worker = "", mode = "quick") {
  const baqio = state.baqio || {};
  const summary = baqio.summary;
  const orderPipeline = Array.isArray(state.orderPipeline) ? state.orderPipeline : [];
  if (!summary && !orderPipeline.length) return "";

  const normalized = normalizeText(`${worker} ${message}`);
  const mentionsCommercial = worker === "commercial"
    || mode === "report"
    || /(commercial|commerce|client|clients|prospect|relance|relancer|vente|ventes|commande|commandes|baqio|chiffre|ca|offre|particulier|pro\b|professionnel|livraison|livrer|tournee|adresse|adresses|facture|factures|reglement|paiement)/.test(normalized);
  if (!mentionsCommercial) return "";

  const activeOrders = orderPipeline
    .filter((order) => order.status !== "Expedie")
    .slice(0, 8)
    .map((order) => [
      `${order.reference}: ${order.customerName}`,
      `statut ${order.status}`,
      order.deliveryDate ? `date ${order.deliveryDate}` : "",
      order.deliveryAddress || order.deliveryCity ? `adresse ${[order.deliveryAddress, order.deliveryZip, order.deliveryCity].filter(Boolean).join(", ")}` : "",
      order.items?.length ? `articles ${order.items.map((item) => `${item.quantity || ""} ${item.name}`.trim()).join("; ")}` : "",
    ].filter(Boolean).join(", "));
  const shippedToday = orderPipeline
    .filter((order) => order.status === "Expedie" && String(order.closedAt || order.updatedAt || "").slice(0, 10) === todayISO())
    .slice(0, 5)
    .map((order) => `${order.reference}: ${order.customerName}`);

  const topCustomers = (summary?.topCustomers || []).slice(0, 5).map((customer) =>
    `${customer.customerName}: ${formatEuroCentsServer(customer.totalCents)}, ${customer.orderCount} commande(s), dernier achat ${customer.lastOrderDate || "inconnu"}`
  );
  const recentOrders = (summary?.recentOrders || []).slice(0, 5).map((order) =>
    `${order.customerName}: ${formatEuroCentsServer(order.totalCents)}, ${Number(order.bottleQuantity || 0).toFixed(0)} bouteille(s), ${order.date || "date inconnue"}`
  );
  const opportunities = (summary?.opportunities || []).slice(0, 8).map((opportunity) =>
    `${opportunity.priority || "Priorite"} - ${opportunity.title}: ${opportunity.detail}`
  );
  const matchingCustomers = findRelevantBaqioCustomers(baqio, message).map((customer) =>
    [
      `${customer.name} (${customer.type})`,
      customer.companyName ? `societe ${customer.companyName}` : "",
      customer.address ? `adresse ${customer.address}` : "",
      customer.zip || customer.city ? `${customer.zip || ""} ${customer.city || ""}`.trim() : "",
      customer.email ? `email ${customer.email}` : "",
      customer.phone ? `tel ${customer.phone}` : "",
      `${customer.orderCount} commande(s), CA ${formatEuroCentsServer(customer.totalCents)}, dernier achat ${customer.lastOrderDate || "inconnu"}`,
    ].filter(Boolean).join(", ")
  );

  return [
    activeOrders.length ? `Commandes operationnelles en cours: ${activeOrders.join(" | ")}.` : "",
    shippedToday.length ? `Commandes expediees aujourd'hui: ${shippedToday.join(" | ")}.` : "",
    summary ? `Derniere synchronisation: ${baqio.lastSyncedAt || "inconnue"}.` : "",
    summary ? `${summary.customerCount || 0} client(s), dont ${summary.proCount || 0} pro(s) et ${summary.individualCount || 0} particulier(s).` : "",
    summary ? `${summary.orderCount || 0} commande(s), CA lu ${formatEuroCentsServer(summary.totalRevenueCents)}, ${Number(summary.bottleQuantity || 0).toFixed(0)} bouteille(s).` : "",
    matchingCustomers.length ? `Clients pertinents retrouves dans Baqio: ${matchingCustomers.join(" | ")}.` : "",
    topCustomers.length ? `Meilleurs clients: ${topCustomers.join(" | ")}.` : "",
    recentOrders.length ? `Commandes recentes: ${recentOrders.join(" | ")}.` : "",
    opportunities.length ? `Opportunites calculees: ${opportunities.join(" | ")}.` : "",
    "Limite: ces donnees viennent de l'echantillon synchronise Baqio et peuvent etre incompletes; annoncer une recommandation plutot qu'une certitude si besoin.",
  ].filter(Boolean).join(" ");
}

function findRelevantBaqioCustomers(baqio, message) {
  const customers = Array.isArray(baqio.customers) ? baqio.customers : [];
  const orders = Array.isArray(baqio.orders) ? baqio.orders : [];
  if (!customers.length) return [];

  const words = normalizeSearchWords(message)
    .filter((word) => !["client", "clients", "livraison", "livrer", "adresse", "adresses", "commande", "commandes", "temps", "tournee", "optimiser", "estimer"].includes(word));
  const orderStats = buildBaqioOrderStats(orders);

  const scored = customers.map((customer) => {
    const haystack = normalizeText([
      customer.name,
      customer.companyName,
      customer.email,
      customer.phone,
      customer.address,
      customer.city,
      customer.zip,
      customer.category,
      customer.type,
    ].filter(Boolean).join(" "));
    const score = words.reduce((sum, word) => {
      if (!word) return sum;
      if (haystack.includes(word)) return sum + (word.length > 4 ? 3 : 1);
      return sum;
    }, 0);
    return { customer, score };
  }).filter((item) => item.score > 0);

  const topFromSummary = new Set((baqio.summary?.topCustomers || []).slice(0, 3).map((item) => String(item.customerId || item.customerName || "")));
  const selected = scored.length
    ? scored.sort((a, b) => b.score - a.score).slice(0, 8).map((item) => item.customer)
    : customers.filter((customer) => topFromSummary.has(String(customer.id)) || topFromSummary.has(customer.name)).slice(0, 5);

  return selected.map((customer) => ({
    ...customer,
    ...(orderStats.get(String(customer.id)) || orderStats.get(customer.name) || {
      totalCents: 0,
      orderCount: 0,
      bottleQuantity: 0,
      lastOrderDate: "",
    }),
  }));
}

function buildBaqioOrderStats(orders) {
  const stats = new Map();
  for (const order of orders) {
    const keys = [String(order.customerId || ""), order.customerName].filter(Boolean);
    for (const key of keys) {
      const current = stats.get(key) || {
        totalCents: 0,
        orderCount: 0,
        bottleQuantity: 0,
        lastOrderDate: "",
      };
      current.totalCents += Number(order.totalCents || 0);
      current.orderCount += 1;
      current.bottleQuantity += Number(order.bottleQuantity || 0);
      if (String(order.date || "") > String(current.lastOrderDate || "")) current.lastOrderDate = order.date || "";
      stats.set(key, current);
    }
  }
  return stats;
}

function getAgentInstructionsStatus() {
  return {
    agents: readAgentInstructions(),
    defaults: DEFAULT_AGENT_INSTRUCTIONS,
  };
}

function readAgentInstructions() {
  const saved = readJson(AGENT_INSTRUCTIONS_FILE, {});
  return Object.fromEntries(Object.entries(DEFAULT_AGENT_INSTRUCTIONS).map(([key, defaultText]) => [
    key,
    typeof saved[key] === "string" ? saved[key] : defaultText,
  ]));
}

function saveAgentInstructions(body) {
  const current = readAgentInstructions();
  const incoming = body?.agents && typeof body.agents === "object" ? body.agents : body;
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_AGENT_INSTRUCTIONS)) {
    if (typeof incoming?.[key] === "string") {
      next[key] = incoming[key].slice(0, 12000).trim();
    }
  }
  writeJson(AGENT_INSTRUCTIONS_FILE, next);
}

function getAgentInstructionContext(worker) {
  const instructions = readAgentInstructions();
  const selected = instructions[worker] || instructions.fernand || "";
  if (worker && worker !== "fernand" && instructions.fernand) {
    return `Fernand: ${instructions.fernand}\nService ${getWorkerDisplayName(worker)}: ${selected}`;
  }
  return selected;
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

function trimText(value, maxLength = 180) {
  const clean = htmlToText(String(value || "")).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}...` : clean;
}

function formatDateTimeServer(value) {
  if (!value) return "date inconnue";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function getAiStateSummary(state) {
  const openTasks = (state.tasks || []).filter((task) => task.status !== "Termine");
  const activeOrders = (state.orderPipeline || []).filter((order) => order.status !== "Expedie");
  const urgentTasks = openTasks
    .filter((task) => ["Urgente", "Importante"].includes(task.priority))
    .slice(0, 5)
    .map((task) => `${task.title} (${task.list || task.category || "sans liste"})`);
  const reports = (state.reports || [])
    .slice(0, 4)
    .map((report) => `${report.title}: ${report.status}`);
  const upcomingAgenda = getUpcomingAgendaItems(state).slice(0, 5);

  return [
    `Contexte actuel: ${openTasks.length} taches ouvertes.`,
    urgentTasks.length ? `Taches importantes: ${urgentTasks.join("; ")}.` : "",
    upcomingAgenda.length ? `Agenda Google synchronise: lecture de l'agenda personnel et de l'agenda assistants. Prochains rendez-vous: ${upcomingAgenda.join("; ")}.` : "Agenda Google synchronise: aucun rendez-vous lu dans les 30 prochains jours, ou synchronisation a relancer.",
    activeOrders.length ? `Commandes en cours: ${activeOrders.slice(0, 5).map((order) => `${order.reference} - ${order.customerName} (${order.status})`).join("; ")}.` : "",
    reports.length ? `Travaux en cours: ${reports.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

function getUpcomingAgendaItems(state) {
  return getUpcomingAgendaEvents(state)
    .map((event) => `${event.time || event.date} - ${event.title}${event.source ? ` (${event.source})` : ""}`);
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
    zenPhrase: chooseOrganizationZenPhrase(lateTasks, todayTasks, agendaToday, loadScore),
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

function chooseOrganizationZenPhrase(lateTasks, todayTasks, agendaToday, loadScore) {
  if (lateTasks.length) {
    return "On ne rattrape pas tout d'un coup : on choisit la premiere pierre et on la pose bien.";
  }
  if (loadScore >= 9) {
    return "Une journee chargee demande moins de vitesse et plus de cap.";
  }
  if (agendaToday.length >= 3) {
    return "Entre deux rendez-vous, garde un vrai souffle pour redevenir disponible.";
  }
  if (todayTasks.length) {
    return "La bonne priorite est celle qui rend la suite plus simple.";
  }
  return "Quand le calme apparait, profite-en pour clarifier avant de remplir.";
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
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Cle OpenAI absente.");
  }
  return [config.model || "gpt-5.4-mini"];
}

function saveGoogleConfig(config) {
  const current = getEnvFileValues();
  const next = {
    ...current,
    GOOGLE_CLIENT_ID: String(config.clientId || "").trim(),
    GOOGLE_CLIENT_SECRET: String(config.clientSecret || current.GOOGLE_CLIENT_SECRET || "").trim(),
    GOOGLE_REDIRECT_URI: String(config.redirectUri || getGoogleConfig().redirectUri).trim(),
    ASSISTANT_CALENDAR_ID: String(config.assistantCalendarId || current.ASSISTANT_CALENDAR_ID || "primary").trim() || "primary",
    PORT: String(PORT),
  };

  writeEnvFile(next);
  process.env.GOOGLE_CLIENT_ID = next.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = next.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_REDIRECT_URI = next.GOOGLE_REDIRECT_URI;
  process.env.ASSISTANT_CALENDAR_ID = next.ASSISTANT_CALENDAR_ID;
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
  if (!fs.existsSync(AGENT_INSTRUCTIONS_FILE)) {
    writeJson(AGENT_INSTRUCTIONS_FILE, DEFAULT_AGENT_INSTRUCTIONS);
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
