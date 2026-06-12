const STORAGE_KEY = "assistant-xavier-v01";
const NOTIFICATION_PREFS_KEY = "assistant-xavier-notifications-v1";

const statuses = ["Inbox", "A faire", "En cours", "En attente", "Termine"];
const TASK_LISTS = ["Dettes", "Cave Expé", "vignoble", "bureau", "divers et perso"];
let currentTaskFilter = "today";

const seedState = {
  tasks: [
    {
      id: crypto.randomUUID(),
      title: "Valider le perimetre de la V0.1",
      status: "En cours",
      priority: "Importante",
      list: "bureau",
      source: "manuel",
      due: todayISO(),
    },
    {
      id: crypto.randomUUID(),
      title: "Lister les dossiers Drive autorises",
      status: "A faire",
      priority: "Normale",
      list: "bureau",
      source: "Drive",
      due: addDaysISO(2),
    },
    {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
      title: "Email client transfere a traiter",
      type: "Email",
      source: "Gmail mock",
      excerpt: "Demande a relire puis transformer en action si necessaire.",
      createdAt: new Date().toISOString(),
    },
  ],
  reminders: [
    {
      id: crypto.randomUUID(),
      title: "Faire le point sur le nom de l'application",
      due: todayISO(),
      source: "roadmap",
    },
    {
      id: crypto.randomUUID(),
      title: "Verifier les informations Google OAuth",
      due: addDaysISO(3),
      source: "Google",
    },
  ],
  notes: [
    {
      id: crypto.randomUUID(),
      title: "Principe produit",
      body: "Si le systeme comprend, il cree. Si c'est ambigu, il met dans l'Inbox. Rien ne doit etre perdu.",
      category: "Produit",
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
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
    { id: crypto.randomUUID(), time: "09:00", title: "Revue du dashboard V0.1" },
    { id: crypto.randomUUID(), time: "14:30", title: "Point architecture Google OAuth" },
  ],
  mail: [
    { id: crypto.randomUUID(), title: "3 emails importants", source: "Gmail mock", detail: "A ouvrir quand la connexion Gmail sera active." },
    { id: crypto.randomUUID(), title: "1 email non lu a qualifier", source: "Gmail mock", detail: "Peut devenir une tache ou rester dans l'Inbox." },
  ],
  reports: [
    {
      id: crypto.randomUUID(),
      title: "Assistant Xavier V0.1",
      status: "En cours",
      progress: 35,
      summary: "Base locale creee : dashboard, taches, Inbox, notes, listes et assistant texte.",
    },
    {
      id: crypto.randomUUID(),
      title: "Preparation Google V0.2",
      status: "A cadrer",
      progress: 10,
      summary: "Decider les labels Gmail, calendriers et dossiers autorises.",
    },
    {
      id: crypto.randomUUID(),
      title: "Architecture serveur",
      status: "A venir",
      progress: 5,
      summary: "Choisir hebergeur, domaine, backend et sauvegardes.",
    },
  ],
};

const API_ENABLED = location.protocol === "http:" || location.protocol === "https:";

let state = structuredClone(seedState);
let connectionState = null;
let googleConfigState = null;
let aiConfigState = null;
let aiMemoryState = { count: 0, exchanges: [] };
let knowledgeState = { count: 0, indexedCount: 0, pendingCount: 0, documents: [] };
let aiUsageState = null;
let morningBriefState = null;
let syncStatusState = null;
let systemStatusState = null;
let notificationPrefs = loadNotificationPrefs();
let morningNotificationTimer = null;
let autoRefreshTimer = null;

const el = {
  todayLabel: document.querySelector("#todayLabel"),
  priorityList: document.querySelector("#priorityList"),
  morningBrief: document.querySelector("#morningBrief"),
  refreshMorningBrief: document.querySelector("#refreshMorningBrief"),
  morningNotificationStatus: document.querySelector("#morningNotificationStatus"),
  morningNotificationTime: document.querySelector("#morningNotificationTime"),
  enableMorningNotification: document.querySelector("#enableMorningNotification"),
  activeTasks: document.querySelector("#activeTasks"),
  agendaList: document.querySelector("#agendaList"),
  mailList: document.querySelector("#mailList"),
  mailCount: document.querySelector("#mailCount"),
  quickLists: document.querySelector("#quickLists"),
  reportsList: document.querySelector("#reportsList"),
  taskBoard: document.querySelector("#taskBoard"),
  taskSummary: document.querySelector("#taskSummary"),
  taskListFilter: document.querySelector("#taskListFilter"),
  taskSearch: document.querySelector("#taskSearch"),
  fullInbox: document.querySelector("#fullInbox"),
  notesGrid: document.querySelector("#notesGrid"),
  memorySummary: document.querySelector("#memorySummary"),
  memoryList: document.querySelector("#memoryList"),
  knowledgeUploadForm: document.querySelector("#knowledgeUploadForm"),
  knowledgeFile: document.querySelector("#knowledgeFile"),
  knowledgeSummary: document.querySelector("#knowledgeSummary"),
  knowledgeList: document.querySelector("#knowledgeList"),
  refreshKnowledge: document.querySelector("#refreshKnowledge"),
  usageSummary: document.querySelector("#usageSummary"),
  usageList: document.querySelector("#usageList"),
  refreshMemory: document.querySelector("#refreshMemory"),
  clearMemory: document.querySelector("#clearMemory"),
  refreshUsage: document.querySelector("#refreshUsage"),
  listColumns: document.querySelector("#listColumns"),
  connectionsGrid: document.querySelector("#connectionsGrid"),
  connectionNotice: document.querySelector("#connectionNotice"),
  syncStatusCard: document.querySelector("#syncStatusCard"),
  systemStatusCard: document.querySelector("#systemStatusCard"),
  connectionSystemStatus: document.querySelector("#connectionSystemStatus"),
  googleConfigForm: document.querySelector("#googleConfigForm"),
  googleClientId: document.querySelector("#googleClientId"),
  googleClientSecret: document.querySelector("#googleClientSecret"),
  googleRedirectUri: document.querySelector("#googleRedirectUri"),
  aiConfigForm: document.querySelector("#aiConfigForm"),
  aiProvider: document.querySelector("#aiProvider"),
  aiBaseUrl: document.querySelector("#aiBaseUrl"),
  aiModel: document.querySelector("#aiModel"),
  openAiApiKey: document.querySelector("#openAiApiKey"),
  aiStatusBadge: document.querySelector("#aiStatusBadge"),
  aiConnectionResult: document.querySelector("#aiConnectionResult"),
  testAiConnection: document.querySelector("#testAiConnection"),
  copyCallback: document.querySelector("#copyCallback"),
  syncAllGoogle: document.querySelector("#syncAllGoogle"),
  assistantDialog: document.querySelector("#assistantDialog"),
  assistantText: document.querySelector("#assistantText"),
  assistantPreview: document.querySelector("#assistantPreview"),
  askLocalAi: document.querySelector("#askLocalAi"),
  taskDialog: document.querySelector("#taskDialog"),
  toast: document.querySelector("#toast"),
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  state = await loadState();
  await loadMorningBrief();
  render();
  await loadConnections();
  await loadSyncStatus();
  await loadSystemStatus();
  await loadGoogleConfig();
  await loadAiConfig();
  await loadAiMemory();
  await loadKnowledge();
  await loadAiUsage();
  handleConnectionNotice();
  startMorningNotificationLoop();
  startAutoRefreshLoop();
});

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelector("#openAssistant").addEventListener("click", openAssistant);
  document.querySelector("#submitAssistant").addEventListener("click", handleAssistantSubmit);
  el.askLocalAi.addEventListener("click", askLocalAi);
  document.querySelector("#assistantText").addEventListener("input", updateAssistantPreview);
  document.querySelector("#quickForm").addEventListener("submit", handleQuickCapture);
  document.querySelector("#taskForm").addEventListener("submit", handleTaskSubmit);
  document.querySelector("#addNote").addEventListener("click", addManualNote);
  el.refreshMorningBrief.addEventListener("click", loadMorningBrief);
  el.enableMorningNotification.addEventListener("click", toggleMorningNotification);
  el.morningNotificationTime.addEventListener("change", updateMorningNotificationTime);
  el.refreshMemory.addEventListener("click", loadAiMemory);
  el.clearMemory.addEventListener("click", clearAiMemory);
  el.refreshKnowledge.addEventListener("click", loadKnowledge);
  el.knowledgeUploadForm.addEventListener("submit", uploadKnowledgeDocument);
  el.refreshUsage.addEventListener("click", loadAiUsage);
  document.querySelector("#resetDemo").addEventListener("click", resetDemo);
  document.querySelector("#connectAllGoogle").addEventListener("click", () => startGoogleConnection("all"));
  el.syncAllGoogle.addEventListener("click", syncAllGoogleServices);
  el.googleConfigForm.addEventListener("submit", saveGoogleConfig);
  el.aiConfigForm.addEventListener("submit", saveAiConfig);
  el.aiProvider.addEventListener("change", applyAiProviderDefaults);
  el.testAiConnection.addEventListener("click", testAiConnection);
  el.copyCallback.addEventListener("click", copyCallbackUrl);
  el.taskListFilter.addEventListener("change", renderTasks);
  el.taskSearch.addEventListener("input", renderTasks);
  document.querySelectorAll("[data-refresh-system-status]").forEach((button) => {
    button.addEventListener("click", loadSystemStatus);
  });
  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentTaskFilter = button.dataset.taskFilter;
      document.querySelectorAll("[data-task-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderTasks();
    });
  });

  document.querySelectorAll("[data-open-task-form]").forEach((button) => {
    button.addEventListener("click", () => el.taskDialog.showModal());
  });
}

function render() {
  el.todayLabel.textContent = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  renderPriorities();
  renderMorningBrief();
  renderInbox();
  renderTasks();
  renderAgenda();
  renderMail();
  renderReports();
  renderLists();
  renderNotes();
  renderMemory();
  renderKnowledge();
  renderUsage();
  renderSystemStatus();
  renderNotificationControls();
  saveState();
}

function renderPriorities() {
  const priorities = state.tasks
    .filter((task) => task.status !== "Termine")
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 3);

  el.priorityList.innerHTML = priorities.length
    ? priorities.map((task) => priorityCard(task)).join("")
    : emptyState("Rien d'urgent pour l'instant.");
}

function renderMorningBrief() {
  if (!el.morningBrief) return;
  const brief = morningBriefState || buildMorningBriefClient(state);
  const priorities = brief.priorities || [];
  const carryOver = brief.carryOver || [];
  const agenda = brief.agenda || [];
  const tomorrow = brief.plannedTomorrow || [];
  const stats = brief.stats || {};
  el.morningBrief.innerHTML = `
    <div class="morning-headline">
      <span class="source-pill">${escapeHTML(loadLabel(brief.load))}</span>
      <p>${escapeHTML(brief.headline)}</p>
    </div>
    <div class="morning-metrics">
      <span><strong>${Number(stats.late || 0)}</strong> retard</span>
      <span><strong>${Number(stats.today || 0)}</strong> aujourd'hui</span>
      <span><strong>${Number(stats.agenda || 0)}</strong> agenda</span>
      <span><strong>${Number(stats.tomorrow || 0)}</strong> demain</span>
    </div>
    <div class="morning-grid">
      <section>
        <h3>Priorites</h3>
        ${briefList(priorities, "Aucune priorite immediate.")}
      </section>
      <section>
        <h3>Report d'hier</h3>
        ${briefList(carryOver, "Rien a reprendre d'hier.")}
      </section>
      <section>
        <h3>Agenda</h3>
        ${agenda.length ? `<ul>${agenda.map((item) => `<li><strong>${escapeHTML(item.time)}</strong> ${escapeHTML(item.title)}</li>`).join("")}</ul>` : "<p class=\"empty-state\">Aucun rendez-vous aujourd'hui.</p>"}
      </section>
      <section>
        <h3>Demain</h3>
        ${briefList(tomorrow, "Rien de prevu pour demain.")}
      </section>
    </div>
    <div class="morning-routine">
      <h3>Routine courte</h3>
      <ol>${(brief.routine || []).slice(0, 5).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ol>
      <p class="card-meta">${escapeHTML(brief.planningReminder)}</p>
    </div>
  `;
}

function briefList(items, emptyMessage) {
  if (!items.length) return `<p class="empty-state">${escapeHTML(emptyMessage)}</p>`;
  return `<ul>${items.map((item) => `<li><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.list || "")}${item.due ? ` - ${formatDate(item.due)}` : ""}</span></li>`).join("")}</ul>`;
}

function loadLabel(load) {
  if (load === "chargee") return "Journee chargee";
  if (load === "normale") return "Journee normale";
  return "Journee legere";
}

function renderInbox() {
  el.fullInbox.innerHTML = state.inbox.length
    ? state.inbox.map((item) => inboxCard(item, true)).join("")
    : emptyState("Aucun element a trier.");
}

function renderTasks() {
  const active = state.tasks.filter((task) => !["Termine", "Inbox"].includes(task.status)).slice(0, 5);
  el.activeTasks.innerHTML = active.length ? active.map(taskCard).join("") : emptyState("Aucune tache active.");

  renderTaskFilters();
  renderTaskSummary();

  const filteredTasks = getFilteredTasks();
  if (!filteredTasks.length) {
    el.taskBoard.innerHTML = emptyState("Aucune tache ne correspond a cette vue.");
    return;
  }

  el.taskBoard.innerHTML = TASK_LISTS
    .map((listName) => {
      const tasks = filteredTasks.filter((task) => taskListName(task) === listName);
      if (!tasks.length) return "";
      return `
        <section class="task-section">
          <h3>${escapeHTML(listName)}<span class="count-pill">${tasks.length}</span></h3>
          <div class="item-list">${tasks.map(taskCard).join("")}</div>
        </section>
      `;
    })
    .join("");
}

function renderTaskFilters() {
  const current = el.taskListFilter.value || "all";
  el.taskListFilter.innerHTML = [
    `<option value="all">Toutes les listes</option>`,
    ...TASK_LISTS.map((list) => `<option value="${escapeHTML(list)}">${escapeHTML(list)}</option>`),
  ].join("");
  el.taskListFilter.value = TASK_LISTS.includes(current) ? current : "all";
}

function renderTaskSummary() {
  const openTasks = state.tasks.filter((task) => task.status !== "Termine");
  const today = todayISO();
  const late = openTasks.filter((task) => task.due && task.due < today).length;
  const dueToday = openTasks.filter((task) => task.due === today).length;
  const noDate = openTasks.filter((task) => !task.due).length;
  const google = openTasks.filter((task) => task.source === "Google Tasks").length;
  el.taskSummary.innerHTML = `
    <article><strong>${dueToday}</strong><span>Aujourd'hui</span></article>
    <article><strong>${late}</strong><span>En retard</span></article>
    <article><strong>${noDate}</strong><span>Sans date</span></article>
    <article><strong>${google}</strong><span>Google Tasks</span></article>
  `;
}

function getFilteredTasks() {
  const today = todayISO();
  const selectedList = el.taskListFilter.value || "all";
  const search = normalizeText(el.taskSearch.value || "");
  return state.tasks
    .filter((task) => task.status !== "Termine" && task.status !== "Inbox")
    .filter((task) => selectedList === "all" || taskListName(task) === selectedList)
    .filter((task) => {
      if (currentTaskFilter === "today") return task.due === today || (task.due && task.due < today);
      if (currentTaskFilter === "late") return task.due && task.due < today;
      if (currentTaskFilter === "nodate") return !task.due;
      return true;
    })
    .filter((task) => !search || normalizeText(`${task.title} ${task.notes || ""} ${taskListName(task)} ${task.source || ""}`).includes(search))
    .sort(sortTasksForFocus);
}

function sortTasksForFocus(a, b) {
  const dateA = a.due || "9999-12-31";
  const dateB = b.due || "9999-12-31";
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  const priority = priorityWeight(b.priority) - priorityWeight(a.priority);
  if (priority) return priority;
  return taskListName(a).localeCompare(taskListName(b), "fr");
}

function renderAgenda() {
  const planningItems = getPlanningItems();
  el.agendaList.innerHTML = planningItems.length
    ? planningItems.map(planningItem).join("")
    : emptyState("Aucun rendez-vous ou tache planifiee sur les 30 prochains jours.");
}

function getPlanningItems() {
  const today = todayISO();
  const maxDate = addDaysISO(30);
  const calendarItems = (state.agenda || []).map((event) => ({
    type: "event",
    title: event.title,
    dateKey: event.date || inferDateKeyFromAgendaTime(event.time) || today,
    time: event.time || "",
    meta: "Rendez-vous Calendar",
  }));

  const taskItems = (state.tasks || [])
    .filter((task) => task.status !== "Termine" && task.due && task.due >= today && task.due <= maxDate)
    .map((task) => ({
      type: "task",
      title: task.title,
      dateKey: task.due,
      time: formatDate(task.due),
      meta: `${taskListName(task)} - ${task.source || "manuel"}`,
    }));

  return [...calendarItems, ...taskItems]
    .filter((item) => item.dateKey <= maxDate)
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      if (a.type !== b.type) return a.type === "event" ? -1 : 1;
      return String(a.time).localeCompare(String(b.time), "fr");
    })
    .slice(0, 12);
}

function planningItem(item) {
  const badge = item.type === "task" ? "Tache" : "Agenda";
  return `
    <article class="timeline-item ${item.type === "task" ? "is-task" : "is-event"}">
      <div class="timeline-time">${escapeHTML(item.time || formatDate(item.dateKey))}</div>
      <div>
        <div class="card-top">
          <p class="card-title">${escapeHTML(item.title)}</p>
          <span class="source-pill">${badge}</span>
        </div>
        <p class="card-meta">${escapeHTML(item.meta)}</p>
      </div>
    </article>
  `;
}

function inferDateKeyFromAgendaTime(value) {
  if (!value) return "";
  const normalized = normalizeText(value);
  if (normalized.includes("aujourd")) return todayISO();
  return "";
}

function renderMail() {
  el.mailCount.textContent = state.mail.length;
  el.mailList.innerHTML = state.mail.length
    ? state.mail.map((item) => externalCard(item, "mail-card")).join("")
    : emptyState("Aucun email prioritaire.");
}

function renderReports() {
  const reports = [...buildAutomaticReports(), ...(state.reports || [])];
  el.reportsList.innerHTML = reports.map((report) => `
    <article class="report-card">
      <div class="card-top">
        <p class="card-title">${escapeHTML(report.title)}</p>
        <span class="source-pill">${escapeHTML(report.status)}</span>
      </div>
      <p class="card-meta">${escapeHTML(report.summary)}</p>
      <div class="progress-track" aria-label="Avancement ${report.progress}%">
        <span style="width: ${report.progress}%"></span>
      </div>
      <p class="card-meta">${report.progress}% d'avancement</p>
    </article>
  `).join("");
}

function buildAutomaticReports() {
  const today = todayISO();
  const openTasks = state.tasks.filter((task) => task.status !== "Termine" && task.status !== "Inbox");
  const lateTasks = openTasks.filter((task) => task.due && task.due < today);
  const todayTasks = openTasks.filter((task) => task.due === today);
  const completedToday = state.tasks.filter((task) => task.completedAt?.slice(0, 10) === today);
  const syncErrors = Object.values(syncStatusState?.lastErrors || {}).filter(Boolean);
  const syncResults = syncStatusState?.lastResults || {};
  const todayUsage = aiUsageState?.today || emptyUsageSummary();

  return [
    {
      id: "auto-day",
      title: "Pilotage du jour",
      status: lateTasks.length ? "A surveiller" : "Stable",
      progress: openTasks.length ? Math.max(5, Math.round((completedToday.length / (openTasks.length + completedToday.length)) * 100)) : 100,
      summary: `${openTasks.length} tache(s) ouverte(s), ${todayTasks.length} prevue(s) aujourd'hui, ${lateTasks.length} en retard, ${completedToday.length} terminee(s) aujourd'hui.`,
    },
    {
      id: "auto-sync",
      title: "Synchronisation Google",
      status: syncErrors.length ? "Erreur" : "Active",
      progress: syncStatusState?.lastFinishedAt ? (syncErrors.length ? 60 : 100) : 20,
      summary: syncStatusState?.lastFinishedAt
        ? `Derniere synchro ${formatDateTime(syncStatusState.lastFinishedAt)} : ${syncResults.gmail || 0} mail(s), ${syncResults.calendar || 0} evenement(s), ${syncResults.tasks || 0} tache(s), ${syncResults.drive || 0} document(s).`
        : "La synchronisation automatique attend son premier passage serveur.",
    },
    {
      id: "auto-ai",
      title: "Assistant IA",
      status: todayUsage.requests ? "Utilise" : "Pret",
      progress: todayUsage.requests ? 100 : 25,
      summary: `${todayUsage.requests || 0} demande(s) aujourd'hui, cout estime ${formatUsd(todayUsage.estimatedCostUsd || 0)}.`,
    },
  ];
}

function renderSystemStatus() {
  const targets = [el.systemStatusCard, el.connectionSystemStatus].filter(Boolean);
  if (!targets.length) return;

  if (!API_ENABLED) {
    targets.forEach((target) => {
      target.innerHTML = `<p class="empty-state">Etat systeme disponible en mode serveur.</p>`;
    });
    return;
  }

  if (!systemStatusState) {
    targets.forEach((target) => {
      target.innerHTML = `<p class="empty-state">Chargement de l'etat systeme.</p>`;
    });
    return;
  }

  const google = systemStatusState.google || {};
  const ai = systemStatusState.ai || {};
  const backup = systemStatusState.backup || {};
  const safety = systemStatusState.safety || {};
  const results = google.results || {};
  const errors = Object.values(google.errors || {}).filter(Boolean);
  const lastSync = google.lastFinishedAt ? formatDateTime(google.lastFinishedAt) : "jamais";
  const latestBackup = backup.latest?.modifiedAt ? formatDateTime(backup.latest.modifiedAt) : "aucune sauvegarde";
  const aiCost = ai.today?.estimatedCostUsd || 0;

  const rows = [
    {
      label: "Application",
      value: "En ligne",
      state: systemStatusState.ok ? "ok" : "warning",
    },
    {
      label: "Google",
      value: `${lastSync} - ${results.gmail || 0} mail(s), ${results.calendar || 0} agenda, ${results.tasks || 0} tache(s)`,
      state: errors.length ? "warning" : "ok",
    },
    {
      label: "IA",
      value: `${ai.provider || "non configure"}${ai.model ? ` - ${ai.model}` : ""} - ${ai.today?.requests || 0} demande(s), ${formatUsd(aiCost)}`,
      state: ai.ready ? "ok" : "muted",
    },
    {
      label: "Sauvegarde VPS",
      value: backup.count ? `${backup.count} archive(s), derniere ${latestBackup}` : "Aucune archive locale detectee",
      state: backup.ok ? "ok" : "warning",
    },
    {
      label: "GitHub public",
      value: safety.publicRepoReady ? "Fichiers sensibles proteges" : `A verifier : ${safety.missingPatterns?.join(", ") || "regles manquantes"}`,
      state: safety.publicRepoReady ? "ok" : "warning",
    },
  ];

  const html = `
    <div class="system-status-list">
      ${rows.map((row) => `
        <article class="system-status-row">
          <span class="system-dot is-${row.state}" aria-hidden="true"></span>
          <div>
            <strong>${escapeHTML(row.label)}</strong>
            <p>${escapeHTML(row.value)}</p>
          </div>
        </article>
      `).join("")}
    </div>
    <p class="card-meta">Mis a jour ${escapeHTML(formatDateTime(systemStatusState.updatedAt))}</p>
  `;

  targets.forEach((target) => {
    target.innerHTML = html;
  });
}

function renderConnections() {
  if (!el.connectionsGrid || !el.connectionNotice || !el.googleConfigForm) return;

  if (!API_ENABLED) {
    el.connectionNotice.innerHTML = `
      <strong>Mode fichier HTML.</strong>
      Lance l'application avec le serveur local pour activer les connexions Gmail, Agenda et Drive.
    `;
    el.connectionsGrid.innerHTML = connectionCard({
      id: "local",
      label: "Serveur local",
      connected: false,
      scopes: ["Sauvegarde durable", "OAuth Google", "Synchronisation"],
    });
    el.googleConfigForm.hidden = true;
    return;
  }

  el.googleConfigForm.hidden = false;

  if (!connectionState) {
    el.connectionNotice.textContent = "Chargement des connexions...";
    el.connectionsGrid.innerHTML = "";
    return;
  }

  el.connectionNotice.innerHTML = connectionState.googleConfigured
    ? `Google OAuth est configure. Callback : <code>${escapeHTML(connectionState.redirectUri)}</code>`
    : `Google OAuth n'est pas encore configure. Cree un client OAuth Google, colle les identifiants ici, puis connecte Gmail, Agenda et Drive.`;

  el.connectionsGrid.innerHTML = connectionState.services.map(connectionCard).join("");

  document.querySelectorAll("[data-connect-service]").forEach((button) => {
    button.addEventListener("click", () => startGoogleConnection(button.dataset.connectService));
  });
  document.querySelectorAll("[data-sync-service]").forEach((button) => {
    button.addEventListener("click", () => syncGoogleService(button.dataset.syncService));
  });
  document.querySelectorAll("[data-disconnect-service]").forEach((button) => {
    button.addEventListener("click", () => disconnectGoogleService(button.dataset.disconnectService));
  });

  connectionState.services.forEach((service) => {
    const status = document.querySelector(`[data-sync-status="${service.id}"]`);
    if (status) {
      status.textContent = service.connected ? "OK" : "V0.2";
      status.classList.toggle("is-connected", service.connected);
    }
  });

  renderSyncStatus();
}

function renderSyncStatus() {
  if (!el.syncStatusCard) return;

  if (!API_ENABLED) {
    el.syncStatusCard.textContent = "Synchronisation auto disponible en mode serveur.";
    return;
  }

  if (!syncStatusState) {
    el.syncStatusCard.textContent = "Synchronisation auto : chargement.";
    return;
  }

  const lastFinished = syncStatusState.lastFinishedAt
    ? formatDateTime(syncStatusState.lastFinishedAt)
    : "pas encore executee";
  const results = syncStatusState.lastResults || {};
  const errors = syncStatusState.lastErrors || {};
  const errorLabels = Object.keys(errors).filter((key) => errors[key]);
  const resultText = [
    results.gmail != null ? `${results.gmail} mail(s)` : "",
    results.calendar != null ? `${results.calendar} evenement(s)` : "",
    results.tasks != null ? `${results.tasks} tache(s)` : "",
    results.drive != null ? `${results.drive} doc(s)` : "",
  ].filter(Boolean).join(", ");

  el.syncStatusCard.innerHTML = `
    <strong>Synchronisation auto</strong>
    <span>${syncStatusState.inProgress ? "En cours" : `Derniere : ${escapeHTML(lastFinished)}`}</span>
    <span>${escapeHTML(resultText || "Aucun service synchronise pour le moment.")}</span>
    <span>${errorLabels.length ? `Erreurs : ${escapeHTML(errorLabels.join(", "))}` : `Toutes les ${syncStatusState.autoSyncIntervalMinutes || 15} min`}</span>
  `;
}

function renderGoogleConfig() {
  if (!googleConfigState || !el.googleConfigForm) return;
  el.googleClientId.value = googleConfigState.clientId || "";
  el.googleClientSecret.value = "";
  el.googleClientSecret.placeholder = googleConfigState.hasClientSecret ? "Secret deja enregistre" : "Coller le secret OAuth";
  el.googleRedirectUri.value = googleConfigState.redirectUri || googleConfigState.requiredCallback || "";
}

function renderAiConfig() {
  if (!el.aiConfigForm) return;
  el.aiProvider.value = aiConfigState?.provider || "openai";
  el.aiBaseUrl.value = aiConfigState?.baseUrl || (el.aiProvider.value === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:1234/v1");
  el.aiModel.value = aiConfigState?.model || (el.aiProvider.value === "openai" ? "gpt-5.4-mini" : "");
  el.openAiApiKey.value = "";
  el.openAiApiKey.placeholder = aiConfigState?.hasOpenAiKey ? "Cle API deja enregistree" : "Coller la cle API OpenAI";
  applyAiProviderDefaults(false);
}

function applyAiProviderDefaults(shouldOverwrite = true) {
  const provider = el.aiProvider.value;
  if (shouldOverwrite) {
    el.aiBaseUrl.value = provider === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:1234/v1";
    el.aiModel.value = provider === "openai" ? "gpt-5.4-mini" : "";
  }
  el.openAiApiKey.closest("label").hidden = provider !== "openai";
}

function connectionCard(service) {
  return `
    <article class="connection-card">
      <div class="card-top">
        <div>
          <h3>${escapeHTML(service.label)}</h3>
          <p class="card-meta">${service.connected ? "Connecte" : "Non connecte"}</p>
        </div>
        <span class="source-pill">${service.connected ? "Actif" : "Pret"}</span>
      </div>
      <ul class="scope-list">
        ${service.scopes.map((scope) => `<li>${escapeHTML(scope.replace("https://www.googleapis.com/auth/", ""))}</li>`).join("")}
      </ul>
      <div class="card-actions">
        <button class="item-action" type="button" data-connect-service="${service.id}" ${service.id === "local" ? "disabled" : ""}>Connecter</button>
        <button class="item-action" type="button" data-sync-service="${service.id}" ${service.connected ? "" : "disabled"}>Synchroniser</button>
        <button class="item-action" type="button" data-disconnect-service="${service.id}" ${service.connected ? "" : "disabled"}>Deconnecter</button>
      </div>
    </article>
  `;
}

function renderLists() {
  const entries = TASK_LISTS.map((name) => [name, state.tasks.filter((task) => taskListName(task) === name)]);
  if (el.quickLists) {
    el.quickLists.innerHTML = entries.map(([name, tasks]) => `
      <div class="quick-list-row">
        <strong>${escapeHTML(name)}</strong>
        <span class="count-pill">${tasks.length}</span>
      </div>
    `).join("");
  }

  el.listColumns.innerHTML = entries.map(([name, items]) => `
    <article class="list-card">
      <div class="card-top">
        <h3>${escapeHTML(name)}</h3>
        <span class="count-pill">${items.length}</span>
      </div>
      <ul>${items.length ? items.map((task) => `<li>${escapeHTML(task.title)} <span class="card-meta">${escapeHTML(task.status)}</span></li>`).join("") : "<li>Aucune tache</li>"}</ul>
    </article>
  `).join("");
}

function renderNotes() {
  el.notesGrid.innerHTML = state.notes.map((note) => `
    <article class="note-card">
      <div class="card-top">
        <h3>${escapeHTML(note.title)}</h3>
        <span class="source-pill">${escapeHTML(note.category)}</span>
      </div>
      <p>${escapeHTML(note.body)}</p>
    </article>
  `).join("");
}

function renderMemory() {
  if (!el.memorySummary || !el.memoryList) return;
  const exchanges = aiMemoryState?.exchanges || [];
  const count = aiMemoryState?.count || 0;
  el.memorySummary.innerHTML = `
    <article><strong>${count}</strong><span>Echanges retenus</span></article>
    <article><strong>${exchanges.length}</strong><span>Affiches</span></article>
  `;
  el.memoryList.innerHTML = exchanges.length
    ? exchanges.map(memoryCard).join("")
    : emptyState("Aucun echange IA memorise pour l'instant.");
}

function renderKnowledge() {
  if (!el.knowledgeSummary || !el.knowledgeList) return;
  const documents = knowledgeState?.documents || [];
  el.knowledgeSummary.innerHTML = `
    <article><strong>${knowledgeState?.count || 0}</strong><span>Documents</span></article>
    <article><strong>${knowledgeState?.indexedCount || 0}</strong><span>Utilisables par l'IA</span></article>
    <article><strong>${knowledgeState?.pendingCount || 0}</strong><span>En attente</span></article>
  `;
  el.knowledgeList.innerHTML = documents.length
    ? documents.map(knowledgeCard).join("")
    : emptyState("Aucun document ajoute pour l'instant.");
}

function knowledgeCard(document) {
  const size = formatBytes(document.size || 0);
  const uploaded = document.uploadedAt ? formatDateTime(document.uploadedAt) : "date inconnue";
  return `
    <article class="knowledge-card">
      <div class="card-top">
        <div>
          <p class="card-title">${escapeHTML(document.title || document.fileName || "Document")}</p>
          <p class="card-meta">${escapeHTML(document.fileName || "")} - ${size} - ${uploaded}</p>
        </div>
        <span class="source-pill">${escapeHTML(document.status || "Pret")}</span>
      </div>
      <p class="card-meta">${escapeHTML(document.summary || "")}</p>
      <div class="card-actions">
        <button class="item-action" type="button" onclick="deleteKnowledgeDocument('${document.id}')">Supprimer</button>
      </div>
    </article>
  `;
}

function renderUsage() {
  if (!el.usageSummary || !el.usageList) return;
  const today = aiUsageState?.today || emptyUsageSummary();
  const month = aiUsageState?.month || emptyUsageSummary();
  el.usageSummary.innerHTML = `
    <article><strong>${today.totalTokens}</strong><span>Tokens aujourd'hui</span></article>
    <article><strong>${formatUsd(today.estimatedCostUsd)}</strong><span>Cout aujourd'hui</span></article>
    <article><strong>${formatUsd(month.estimatedCostUsd)}</strong><span>Cout mois</span></article>
    <article><strong>${today.requests}</strong><span>Demandes aujourd'hui</span></article>
  `;

  const models = today.byModel?.length ? today.byModel : month.byModel || [];
  el.usageList.innerHTML = models.length
    ? models.map(usageModelCard).join("")
    : emptyState("Aucun usage IA mesure pour l'instant.");
}

function usageModelCard(item) {
  return `
    <article class="usage-card">
      <div class="card-top">
        <p class="card-title">${escapeHTML(item.model || "Modele inconnu")}</p>
        <span class="source-pill">${formatUsd(item.estimatedCostUsd)}</span>
      </div>
      <p class="card-meta">${item.requests} demande(s) - ${item.totalTokens} tokens - entree ${item.promptTokens}, sortie ${item.completionTokens}</p>
    </article>
  `;
}

function emptyUsageSummary() {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: [],
  };
}

function memoryCard(exchange) {
  return `
    <article class="memory-card">
      <div class="card-top">
        <p class="card-title">${escapeHTML(formatMemoryDate(exchange.createdAt))}</p>
        <span class="source-pill">IA locale</span>
      </div>
      <p class="memory-label">Xavier</p>
      <p class="card-meta">${escapeHTML(exchange.user || "")}</p>
      <p class="memory-label">Assistant</p>
      <p class="card-meta">${escapeHTML(exchange.assistant || "")}</p>
    </article>
  `;
}

function priorityCard(task) {
  return `
    <article class="priority-card">
      <div class="card-top">
        <p class="card-title">${escapeHTML(task.title)}</p>
        ${priorityTag(task.priority)}
      </div>
      <p class="card-meta">${escapeHTML(taskListName(task))} - ${formatDate(task.due)} - ${escapeHTML(task.source)}</p>
      <div class="card-actions">
        <button class="item-action" type="button" onclick="completeTask('${task.id}')">Terminer</button>
        <button class="item-action" type="button" onclick="moveTask('${task.id}', 'En attente')">Reporter</button>
      </div>
    </article>
  `;
}

function taskCard(task) {
  const dueClass = getDueClass(task);
  return `
    <article class="task-card ${dueClass}">
      <div class="card-top">
        <p class="card-title">${escapeHTML(task.title)}</p>
        ${priorityTag(task.priority)}
      </div>
      <p class="card-meta">${escapeHTML(taskListName(task))} - ${escapeHTML(task.status)} - ${task.due ? formatDate(task.due) : "Sans echeance"} - ${escapeHTML(task.source || "manuel")}</p>
      ${task.notes ? `<p class="card-meta">${escapeHTML(task.notes)}</p>` : ""}
      <div class="card-actions">
        ${task.status !== "Termine" ? `<button class="item-action" type="button" onclick="completeTask('${task.id}')">Terminer</button>` : ""}
        ${task.status !== "En cours" && task.status !== "Termine" ? `<button class="item-action" type="button" onclick="moveTask('${task.id}', 'En cours')">Demarrer</button>` : ""}
        ${task.status !== "En attente" && task.status !== "Termine" ? `<button class="item-action" type="button" onclick="moveTask('${task.id}', 'En attente')">Attente</button>` : ""}
      </div>
    </article>
  `;
}

function getDueClass(task) {
  if (!task.due || task.status === "Termine") return "";
  if (task.due < todayISO()) return "is-late";
  if (task.due === todayISO()) return "is-today";
  return "";
}

function inboxCard(item, full) {
  return `
    <article class="inbox-card">
      <div class="card-top">
        <p class="card-title">${escapeHTML(item.title)}</p>
        <span class="source-pill">${escapeHTML(item.type)}</span>
      </div>
      <p class="card-meta">${escapeHTML(item.source)} - ${new Date(item.createdAt).toLocaleDateString("fr-FR")}</p>
      <p class="card-meta">${escapeHTML(item.excerpt)}</p>
      <div class="card-actions">
        <button class="item-action" type="button" onclick="inboxToTask('${item.id}')">Transformer en tache</button>
        <button class="item-action" type="button" onclick="archiveInbox('${item.id}')">Archiver</button>
        ${full ? `<button class="item-action" type="button" onclick="inboxToNote('${item.id}')">Note</button>` : ""}
      </div>
    </article>
  `;
}

function externalCard(item, className) {
  return `
    <article class="${className}">
      <p class="card-title">${escapeHTML(item.title)}</p>
      <p class="card-meta">${escapeHTML(item.source)}${item.detail ? ` - ${escapeHTML(item.detail)}` : ""}</p>
    </article>
  `;
}

function priorityTag(priority) {
  const className = {
    Urgente: "urgent",
    Importante: "important",
    Normale: "normal",
    Faible: "low",
  }[priority] || "normal";
  return `<span class="tag ${className}">${escapeHTML(priority)}</span>`;
}

function handleQuickCapture(event) {
  event.preventDefault();
  const input = document.querySelector("#quickInput");
  const text = input.value.trim();
  if (!text) return;
  processAssistantText(text, "capture rapide");
  input.value = "";
}

function openAssistant() {
  el.assistantText.value = "";
  updateAssistantPreview();
  el.assistantDialog.showModal();
  setTimeout(() => el.assistantText.focus(), 0);
}

function updateAssistantPreview() {
  const parsed = parseIntent(el.assistantText.value);
  el.assistantPreview.textContent = parsed.preview;
}

function handleAssistantSubmit() {
  const text = el.assistantText.value.trim();
  if (!text) return;
  processAssistantText(text, "assistant");
  el.assistantDialog.close();
}

async function askLocalAi() {
  const text = el.assistantText.value.trim();
  if (!text) return;
  if (!API_ENABLED) {
    el.assistantPreview.textContent = "Lance d'abord le serveur local de l'application.";
    return;
  }

  el.askLocalAi.disabled = true;
  el.assistantPreview.textContent = "L'IA locale reflechit...";
  el.assistantText.value = "";
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const payload = await response.json();
    if (!response.ok) {
      el.assistantPreview.textContent = payload.error || "LM Studio ne repond pas.";
      return;
    }
    el.assistantPreview.textContent = payload.answer;
    await loadAiMemory();
    await loadAiUsage();
  } catch {
    el.assistantPreview.textContent = "Impossible de joindre LM Studio pour l'instant.";
  } finally {
    el.askLocalAi.disabled = false;
  }
}

function processAssistantText(text, source) {
  const intent = parseIntent(text);
  if (intent.type === "task") {
    state.tasks.unshift({
      id: crypto.randomUUID(),
      title: intent.title,
      status: "A faire",
      priority: intent.priority,
      list: intent.list,
      source,
      due: intent.due,
    });
    showToast("Tache ajoutee.");
  } else if (intent.type === "reminder") {
    state.reminders.unshift({
      id: crypto.randomUUID(),
      title: intent.title,
      due: intent.due,
      source,
    });
    showToast("Rappel ajoute.");
  } else if (intent.type === "note") {
    state.notes.unshift({
      id: crypto.randomUUID(),
      title: intent.title,
      body: intent.body,
      category: intent.category,
      createdAt: new Date().toISOString(),
    });
    showToast("Note ajoutee.");
  } else if (intent.type === "list") {
    state.lists[intent.list] = state.lists[intent.list] || [];
    state.lists[intent.list].push(intent.item);
    showToast(`Ajoute dans ${intent.list}.`);
  } else {
    state.inbox.unshift({
      id: crypto.randomUUID(),
      title: text,
      type: "Ambigu",
      source,
      excerpt: "Demande conservee dans l'Inbox pour ne rien perdre.",
      createdAt: new Date().toISOString(),
    });
    showToast("Demande placee dans l'Inbox.");
  }
  render();
}

function parseIntent(rawText) {
  const text = rawText.trim();
  const normalized = normalizeText(text);

  if (!text) {
    return { type: "empty", preview: "La demande sera analysee localement. Si elle est ambigue, elle ira dans l'Inbox." };
  }

  const listMatch = normalized.match(/^(ajoute|mettre|mets)\s+(.+?)\s+(aux|a la|dans la|dans les|dans)\s+(.+)$/);
  if (listMatch && /(dette|cave|expe|vigne|vignoble|bureau|divers|perso|maison|admin|administratif)/.test(listMatch[4])) {
    const list = normalizeListName(listMatch[4]);
    const title = cleanTitle(listMatch[2]);
    return {
      type: "task",
      title,
      priority: "Normale",
      list,
      due: "",
      preview: `Tache prevue dans ${list} : ${title}`,
    };
  }

  if (/^(rappelle|rappel|me rappeler)/.test(normalized)) {
    const title = cleanTitle(text.replace(/^(rappelle|rappel|me rappeler)(-moi)?\s*(de|d'|a|a)?\s*/i, ""));
    const due = inferDueDate(normalized);
    return { type: "reminder", title, due, preview: `Rappel prevu : ${title} (${formatDate(due)})` };
  }

  if (/^(note|idee)/.test(normalized)) {
    const body = cleanTitle(text.replace(/^(note|idee)\s*:?\s*/i, ""));
    return {
      type: "note",
      title: body.slice(0, 56) || "Note rapide",
      body,
      category: normalized.includes("pro") ? "Pro" : "Perso",
      preview: `Note prevue : ${body}`,
    };
  }

  if (/^(tache|todo|a faire|appeler|preparer|verifier|faire)/.test(normalized)) {
    const due = inferDueDate(normalized);
    const priority = normalized.includes("urgent") ? "Urgente" : normalized.includes("important") ? "Importante" : "Normale";
    return {
      type: "task",
      title: cleanTitle(text.replace(/^(tache|todo|a faire)\s*:?\s*/i, "")),
      priority,
      list: inferTaskList(normalized),
      due,
      preview: `Tache prevue : ${cleanTitle(text)} (${priority})`,
    };
  }

  return { type: "inbox", preview: "Intention ambigue : l'element sera conserve dans l'Inbox a trier." };
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const title = document.querySelector("#taskTitle").value.trim();
  if (!title) return;
  state.tasks.unshift({
    id: crypto.randomUUID(),
    title,
    status: "A faire",
    priority: document.querySelector("#taskPriority").value,
    list: document.querySelector("#taskCategory").value,
    source: "manuel",
    due: document.querySelector("#taskDue").value || "",
  });
  event.currentTarget.reset();
  el.taskDialog.close();
  showToast("Tache ajoutee.");
  render();
}

function addManualNote() {
  const title = prompt("Titre de la note");
  if (!title) return;
  const body = prompt("Contenu");
  if (!body) return;
  state.notes.unshift({
    id: crypto.randomUUID(),
    title,
    body,
    category: "Manuel",
    createdAt: new Date().toISOString(),
  });
  showToast("Note ajoutee.");
  render();
}

function switchView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== view;
  });
  if (view === "connections") loadConnections();
  if (view === "memory") {
    loadAiMemory();
    loadAiUsage();
  }
}

function completeTask(id) {
  moveTask(id, "Termine");
}

function moveTask(id, status) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = status;
  task.completedAt = status === "Termine" ? new Date().toISOString() : "";
  showToast(status === "Termine" ? "Tache terminee." : `Tache deplacee : ${status}.`);
  render();
}

function inboxToTask(id) {
  const item = state.inbox.find((entry) => entry.id === id);
  if (!item) return;
  state.tasks.unshift({
    id: crypto.randomUUID(),
    title: item.title,
    status: "A faire",
    priority: "Normale",
    list: "bureau",
    source: item.source,
    due: "",
  });
  archiveInbox(id, false);
  showToast("Inbox transformee en tache.");
  render();
}

function inboxToNote(id) {
  const item = state.inbox.find((entry) => entry.id === id);
  if (!item) return;
  state.notes.unshift({
    id: crypto.randomUUID(),
    title: item.title,
    body: item.excerpt,
    category: item.type,
    createdAt: new Date().toISOString(),
  });
  archiveInbox(id, false);
  showToast("Inbox transformee en note.");
  render();
}

function archiveInbox(id, rerender = true) {
  state.inbox = state.inbox.filter((entry) => entry.id !== id);
  if (rerender) {
    showToast("Element archive.");
    render();
  }
}

async function resetDemo() {
  if (!confirm("Reinitialiser les donnees de demonstration ?")) return;
  if (API_ENABLED) {
    const response = await fetch("/api/reset", { method: "POST" });
    state = migrateState(await response.json());
  } else {
    localStorage.removeItem(STORAGE_KEY);
    state = structuredClone(seedState);
  }
  showToast("Donnees reinitialisees.");
  render();
}

async function loadState() {
  if (API_ENABLED) {
    try {
      const response = await fetch("/api/state");
      return migrateState(await response.json());
    } catch {
      showToast("Serveur local indisponible, mode navigateur utilise.");
    }
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? migrateState(JSON.parse(saved)) : structuredClone(seedState);
  } catch {
    return structuredClone(seedState);
  }
}

async function loadMorningBrief() {
  if (API_ENABLED) {
    try {
      const response = await fetch("/api/morning-brief");
      morningBriefState = await response.json();
      renderMorningBrief();
      return;
    } catch {
      morningBriefState = buildMorningBriefClient(state);
    }
  } else {
    morningBriefState = buildMorningBriefClient(state);
  }
  renderMorningBrief();
}

function loadNotificationPrefs() {
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    return saved ? { enabled: false, time: "08:00", lastSentDate: "", ...JSON.parse(saved) } : { enabled: false, time: "08:00", lastSentDate: "" };
  } catch {
    return { enabled: false, time: "08:00", lastSentDate: "" };
  }
}

function saveNotificationPrefs() {
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(notificationPrefs));
}

function renderNotificationControls() {
  if (!el.enableMorningNotification || !el.morningNotificationStatus || !el.morningNotificationTime) return;

  const supported = "Notification" in window && "serviceWorker" in navigator;
  el.morningNotificationTime.value = notificationPrefs.time || "08:00";

  if (!supported) {
    el.enableMorningNotification.disabled = true;
    el.morningNotificationStatus.textContent = "Notif indisponible";
    return;
  }

  const permission = Notification.permission;
  const active = notificationPrefs.enabled && permission === "granted";
  el.enableMorningNotification.disabled = false;
  el.enableMorningNotification.textContent = active ? "Desactiver notif" : "Activer notif";
  el.morningNotificationStatus.textContent = active
    ? `Notif ${notificationPrefs.time || "08:00"}`
    : permission === "denied"
      ? "Notif bloquee"
      : "Notif inactive";
  el.morningNotificationStatus.classList.toggle("is-connected", active);
}

async function toggleMorningNotification() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    showToast("Notifications non disponibles sur cet appareil.");
    return;
  }

  if (notificationPrefs.enabled && Notification.permission === "granted") {
    notificationPrefs.enabled = false;
    saveNotificationPrefs();
    renderNotificationControls();
    showToast("Notification du matin desactivee.");
    return;
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") {
    notificationPrefs.enabled = false;
    saveNotificationPrefs();
    renderNotificationControls();
    showToast("Autorisation de notification refusee.");
    return;
  }

  notificationPrefs.enabled = true;
  notificationPrefs.time = el.morningNotificationTime.value || "08:00";
  saveNotificationPrefs();
  renderNotificationControls();
  showToast("Notification du matin activee.");
  await sendMorningNotification(true);
}

function updateMorningNotificationTime() {
  notificationPrefs.time = el.morningNotificationTime.value || "08:00";
  saveNotificationPrefs();
  renderNotificationControls();
}

function startMorningNotificationLoop() {
  clearInterval(morningNotificationTimer);
  checkMorningNotificationDue();
  morningNotificationTimer = setInterval(checkMorningNotificationDue, 60 * 1000);
}

async function checkMorningNotificationDue() {
  if (!notificationPrefs.enabled || !("Notification" in window) || Notification.permission !== "granted") return;

  const today = todayISO();
  const currentTime = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  if (notificationPrefs.lastSentDate === today || currentTime < (notificationPrefs.time || "08:00")) return;

  await sendMorningNotification(false);
  notificationPrefs.lastSentDate = today;
  saveNotificationPrefs();
}

async function sendMorningNotification(isTest) {
  const brief = morningBriefState || buildMorningBriefClient(state);
  const firstPriority = (brief.priorities || [])[0]?.title;
  const body = firstPriority
    ? `${brief.headline} Priorite : ${firstPriority}`
    : brief.headline;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(isTest ? "Assistant Xavier est pret" : "Bonjour Xavier", {
    body,
    tag: "assistant-xavier-morning",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: "/" },
  });
}

function buildMorningBriefClient(currentState) {
  const today = todayISO();
  const yesterday = addDaysISO(-1);
  const tomorrow = addDaysISO(1);
  const openTasks = (currentState.tasks || []).filter((task) => task.status !== "Termine" && task.status !== "Inbox");
  const lateTasks = openTasks.filter((task) => task.due && task.due < today).sort(sortTasksForFocus);
  const todayTasks = openTasks.filter((task) => task.due === today).sort(sortTasksForFocus);
  const yesterdayCarryOver = openTasks.filter((task) => task.due === yesterday).sort(sortTasksForFocus);
  const tomorrowTasks = openTasks.filter((task) => task.due === tomorrow).sort(sortTasksForFocus);
  const noDateTasks = openTasks.filter((task) => !task.due).sort(sortTasksForFocus);
  const agenda = getPlanningItems()
    .filter((item) => item.type === "event" && item.dateKey === today)
    .slice(0, 6)
    .map((item) => ({ title: item.title, time: item.time || "Aujourd'hui" }));
  const priorities = [...lateTasks, ...todayTasks, ...noDateTasks]
    .filter(uniqueByTaskId())
    .sort(sortTasksForFocus)
    .slice(0, 5)
    .map(taskToBriefItem);
  const loadScore = priorities.length + agenda.length + Math.min(lateTasks.length, 4);
  return {
    generatedAt: new Date().toISOString(),
    date: today,
    load: loadScore >= 9 ? "chargee" : loadScore >= 5 ? "normale" : "legere",
    headline: lateTasks.length
      ? `Tu as ${lateTasks.length} tache(s) en retard. Commence par reduire ce stock avant d'ajouter du nouveau.`
      : `Journee active : ${todayTasks.length} tache(s) prevue(s) et ${agenda.length} rendez-vous a surveiller.`,
    stats: {
      late: lateTasks.length,
      today: todayTasks.length,
      carryOver: yesterdayCarryOver.length,
      agenda: agenda.length,
      tomorrow: tomorrowTasks.length,
      open: openTasks.length,
    },
    priorities,
    carryOver: yesterdayCarryOver.slice(0, 5).map(taskToBriefItem),
    agenda,
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

function taskToBriefItem(task) {
  return {
    id: task.id,
    title: task.title || "Tache sans titre",
    list: taskListName(task),
    priority: task.priority || "Normale",
    due: task.due || "",
  };
}

function uniqueByTaskId() {
  const seen = new Set();
  return (task) => {
    const key = task.id || task.sourceId || task.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function migrateState(saved) {
  const migrated = {
    ...structuredClone(seedState),
    ...saved,
  };
  migrated.tasks = (saved.tasks || seedState.tasks).map((task) => ({
    ...task,
    list: taskListName(task),
  }));
  migrated.lists = Object.fromEntries(TASK_LISTS.map((name) => [name, saved.lists?.[name] || []]));
  migrated.mail = (saved.mail || seedState.mail).map((item) => ({
    detail: "",
    ...item,
  }));
  migrated.reports = saved.reports || structuredClone(seedState.reports);
  return migrated;
}

function taskListName(task) {
  if (TASK_LISTS.includes(task.list)) return task.list;
  if (TASK_LISTS.includes(task.category)) return task.category;
  if (task.category === "Perso") return "divers et perso";
  if (task.category === "Pro") return "bureau";
  return "divers et perso";
}

function inferTaskList(text) {
  if (text.includes("dette") || text.includes("facture") || text.includes("payer")) return "Dettes";
  if (text.includes("cave") || text.includes("expe") || text.includes("expedition") || text.includes("commande")) return "Cave Expé";
  if (text.includes("vigne") || text.includes("vignoble") || text.includes("parcelle")) return "vignoble";
  if (text.includes("bureau") || text.includes("admin") || text.includes("client") || text.includes("mail")) return "bureau";
  if (text.includes("perso") || text.includes("maison") || text.includes("divers")) return "divers et perso";
  return "bureau";
}

function saveState() {
  clearTimeout(saveState.timer);
  saveState.timer = setTimeout(() => {
    if (API_ENABLED) {
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, 150);
}

async function loadConnections() {
  if (!API_ENABLED) {
    connectionState = null;
    renderConnections();
    return;
  }

  try {
    const response = await fetch("/api/connections");
    connectionState = await response.json();
  } catch {
    connectionState = null;
  }
  renderConnections();
}

async function loadSyncStatus() {
  if (!API_ENABLED) {
    syncStatusState = null;
    renderSyncStatus();
    return;
  }

  try {
    const response = await fetch("/api/sync/status");
    syncStatusState = await response.json();
  } catch {
    syncStatusState = null;
  }
  renderSyncStatus();
  renderReports();
}

async function loadSystemStatus() {
  if (!API_ENABLED) {
    systemStatusState = null;
    renderSystemStatus();
    return;
  }

  try {
    const response = await fetch("/api/system/status");
    systemStatusState = await response.json();
  } catch {
    systemStatusState = null;
  }
  renderSystemStatus();
}

function startAutoRefreshLoop() {
  if (!API_ENABLED) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(refreshServerStateQuietly, 5 * 60 * 1000);
}

async function refreshServerStateQuietly() {
  const hasOpenDialog = document.querySelector("dialog[open]");
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = ["input", "textarea", "select"].includes(activeTag);
  if (hasOpenDialog || isTyping) return;

  try {
    const response = await fetch("/api/state");
    state = migrateState(await response.json());
    await loadMorningBrief();
    await loadSyncStatus();
    await loadSystemStatus();
    render();
  } catch {
    // Le prochain cycle retentera sans interrompre l'utilisateur.
  }
}

async function loadGoogleConfig() {
  if (!API_ENABLED) {
    googleConfigState = null;
    return;
  }
  try {
    const response = await fetch("/api/config/google");
    googleConfigState = await response.json();
    renderGoogleConfig();
  } catch {
    googleConfigState = null;
  }
}

async function loadAiConfig() {
  if (!API_ENABLED) {
    aiConfigState = null;
    return;
  }
  try {
    const response = await fetch("/api/config/ai");
    aiConfigState = await response.json();
    renderAiConfig();
  } catch {
    aiConfigState = null;
  }
}

async function loadAiMemory() {
  if (!API_ENABLED) {
    aiMemoryState = { count: 0, exchanges: [] };
    renderMemory();
    return;
  }

  try {
    const response = await fetch("/api/ai/memory");
    aiMemoryState = await response.json();
  } catch {
    aiMemoryState = { count: 0, exchanges: [] };
  }
  renderMemory();
}

async function loadKnowledge() {
  if (!API_ENABLED) {
    knowledgeState = { count: 0, indexedCount: 0, pendingCount: 0, documents: [] };
    renderKnowledge();
    return;
  }

  try {
    const response = await fetch("/api/knowledge");
    knowledgeState = await response.json();
  } catch {
    knowledgeState = { count: 0, indexedCount: 0, pendingCount: 0, documents: [] };
  }
  renderKnowledge();
}

async function uploadKnowledgeDocument(event) {
  event.preventDefault();
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }
  const file = el.knowledgeFile.files?.[0];
  if (!file) {
    showToast("Choisis un document a ajouter.");
    return;
  }

  const formData = new FormData();
  formData.append("document", file);
  const submit = el.knowledgeUploadForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Ajout...";
  try {
    const response = await fetch("/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      showToast(payload.error || "Document non ajoute.");
      return;
    }
    el.knowledgeFile.value = "";
    await loadKnowledge();
    showToast("Document ajoute a la memoire.");
  } catch {
    showToast("Ajout du document impossible.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Ajouter";
  }
}

async function deleteKnowledgeDocument(id) {
  if (!API_ENABLED) return;
  const response = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    showToast(payload.error || "Suppression impossible.");
    return;
  }
  knowledgeState = payload.status;
  renderKnowledge();
  showToast("Document supprime.");
}

async function loadAiUsage() {
  if (!API_ENABLED) {
    aiUsageState = { today: emptyUsageSummary(), month: emptyUsageSummary(), recent: [] };
    renderUsage();
    return;
  }

  try {
    const response = await fetch("/api/ai/usage");
    aiUsageState = await response.json();
  } catch {
    aiUsageState = { today: emptyUsageSummary(), month: emptyUsageSummary(), recent: [] };
  }
  renderUsage();
  renderReports();
}

async function saveGoogleConfig(event) {
  event.preventDefault();
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }

  const payload = {
    clientId: el.googleClientId.value.trim(),
    clientSecret: el.googleClientSecret.value.trim(),
    redirectUri: el.googleRedirectUri.value.trim(),
  };

  const response = await fetch("/api/config/google", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  googleConfigState = await response.json();
  renderGoogleConfig();
  await loadConnections();
  showToast(googleConfigState.ready ? "Configuration Google enregistree." : "Configuration incomplete.");
}

async function saveAiConfig(event) {
  event.preventDefault();
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }

  const payload = {
    provider: el.aiProvider.value,
    baseUrl: el.aiBaseUrl.value.trim() || "http://127.0.0.1:1234/v1",
    model: el.aiModel.value.trim(),
    openAiApiKey: el.openAiApiKey.value.trim(),
  };

  const response = await fetch("/api/config/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  aiConfigState = await response.json();
  renderAiConfig();
  showToast("Configuration IA locale enregistree.");
}

async function testAiConnection() {
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }

  await saveAiConfig(new Event("submit"));
  el.aiStatusBadge.textContent = "Test...";
  el.aiConnectionResult.textContent = "Verification du moteur IA...";

  const response = await fetch("/api/ai/status");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    el.aiStatusBadge.textContent = "Non connecte";
    el.aiConnectionResult.textContent = payload.error || "Le moteur IA ne repond pas.";
    showToast("IA non connectee.");
    return;
  }

  el.aiStatusBadge.textContent = "Connecte";
  el.aiConnectionResult.textContent = payload.models.length
    ? `Modele detecte : ${payload.selectedModel}`
    : "Moteur detecte, mais aucun modele n'est charge.";
  if (!el.aiModel.value && payload.selectedModel) {
    el.aiModel.value = payload.selectedModel;
  }
  showToast("LM Studio est connecte.");
}

async function clearAiMemory() {
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }
  if (!confirm("Vider la memoire courte de l'IA ?")) return;

  const response = await fetch("/api/ai/memory", { method: "DELETE" });
  aiMemoryState = await response.json();
  renderMemory();
  showToast("Memoire IA videe.");
}

async function copyCallbackUrl() {
  const value = el.googleRedirectUri.value || googleConfigState?.requiredCallback || "";
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    showToast("Callback copie.");
  } catch {
    showToast(value);
  }
}

function startGoogleConnection(service) {
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }
  location.href = `/auth/google/start?service=${encodeURIComponent(service)}`;
}

async function syncGoogleService(service) {
  const response = await fetch(`/api/google/sync?service=${encodeURIComponent(service)}`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "Synchronisation impossible.");
    return;
  }
  state = migrateState(payload);
  await loadConnections();
  await loadSyncStatus();
  showToast("Synchronisation terminee.");
  render();
}

async function syncAllGoogleServices() {
  if (!API_ENABLED) {
    showToast("Lance d'abord le serveur local.");
    return;
  }
  showToast("Synchronisation Google en cours...");
  const response = await fetch("/api/google/sync-all", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "Synchronisation impossible.");
    return;
  }
  state = migrateState(payload.state);
  await loadConnections();
  syncStatusState = payload.status || syncStatusState;
  const results = payload.results || {};
  showToast(`Google synchronise : ${results.gmail || 0} email(s), ${results.calendar || 0} evenement(s), ${results.tasks || 0} tache(s), ${results.drive || 0} document(s).`);
  renderSyncStatus();
  render();
}

async function disconnectGoogleService(service) {
  const response = await fetch("/api/google/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service }),
  });
  connectionState = await response.json();
  showToast("Connexion retiree.");
  renderConnections();
}

function handleConnectionNotice() {
  const params = new URLSearchParams(location.search);
  const status = params.get("connection");
  if (!status) return;
  if (status === "success") showToast("Connexion Google active.");
  if (status === "missing-config") showToast("Google OAuth doit etre configure avant connexion.");
  if (status === "failed") showToast("Connexion Google echouee.");
  history.replaceState({}, document.title, location.pathname);
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("is-visible"), 2200);
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHTML(message)}</p>`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inferDueDate(text) {
  if (text.includes("demain")) return addDaysISO(1);
  if (text.includes("vendredi")) return nextWeekdayISO(5);
  if (text.includes("lundi")) return nextWeekdayISO(1);
  if (text.includes("mardi")) return nextWeekdayISO(2);
  if (text.includes("mercredi")) return nextWeekdayISO(3);
  if (text.includes("jeudi")) return nextWeekdayISO(4);
  if (text.includes("samedi")) return nextWeekdayISO(6);
  if (text.includes("dimanche")) return nextWeekdayISO(0);
  return todayISO();
}

function nextWeekdayISO(targetDay) {
  const date = new Date();
  const current = date.getDay();
  const delta = (targetDay + 7 - current) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "Sans date";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`));
}

function formatMemoryDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return "Echange recent";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return "date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function priorityWeight(priority) {
  return { Urgente: 4, Importante: 3, Normale: 2, Faible: 1 }[priority] || 0;
}

function cleanTitle(text) {
  return text.replace(/\s+/g, " ").trim().replace(/^[:,-]\s*/, "");
}

function normalizeListName(text) {
  if (text.includes("dette") || text.includes("facture") || text.includes("payer")) return "Dettes";
  if (text.includes("cave") || text.includes("expe") || text.includes("expedition")) return "Cave Expé";
  if (text.includes("vigne") || text.includes("vignoble")) return "vignoble";
  if (text.includes("bureau") || text.includes("admin")) return "bureau";
  return "divers et perso";
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.completeTask = completeTask;
window.moveTask = moveTask;
window.inboxToTask = inboxToTask;
window.deleteKnowledgeDocument = deleteKnowledgeDocument;
window.inboxToNote = inboxToNote;
window.archiveInbox = archiveInbox;
