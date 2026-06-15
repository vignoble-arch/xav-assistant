const nextActionHint = document.querySelector("#nextActionHint");
const todayStatus = document.querySelector("#todayStatus");
const todayEntries = document.querySelector("#todayEntries");
const observation = document.querySelector("#observation");
const punchButton = document.querySelector("#punchButton");
const result = document.querySelector("#result");

const actionLabels = {
  arrival: "arrivee",
  departure: "depart",
  complete: "journee complete",
};

document.addEventListener("DOMContentLoaded", async () => {
  punchButton.addEventListener("click", punch);
  await loadStatus();
});

async function loadStatus() {
  try {
    const response = await fetch("/api/timeclock/public");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Pointeuse indisponible.");
    renderStatus(payload);
  } catch {
    nextActionHint.textContent = "Impossible de charger la pointeuse. Reessaie dans un instant.";
    todayStatus.textContent = "Hors ligne";
    todayEntries.textContent = "";
  }
}

function renderStatus(payload) {
  const entries = payload.todayEntries || [];
  const nextAction = payload.nextAction || "arrival";
  const label = actionLabels[nextAction] || "pointage";
  nextActionHint.textContent = nextAction === "complete"
    ? "La journee a deja une arrivee et un depart."
    : `Prochain pointage automatique : ${label}.`;
  todayStatus.textContent = nextAction === "complete" ? "Journee complete" : `Prochain : ${label}`;
  todayEntries.textContent = entries.length
    ? entries.map((entry) => `${timeLabel(entry.timestamp)} - ${actionLabels[entry.action] || "pointage"}`).join(" | ")
    : "Aucun pointage aujourd'hui.";
  punchButton.disabled = nextAction === "complete";
  punchButton.textContent = nextAction === "departure" ? "Pointer le depart" : nextAction === "complete" ? "Journee complete" : "Pointer l'arrivee";
}

async function punch() {
  if (punchButton.disabled) return;
  punchButton.disabled = true;
  result.textContent = "Enregistrement...";
  try {
    const response = await fetch("/api/timeclock/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "auto",
        source: "nfc",
        observation: observation.value.trim(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      result.textContent = payload.error || "Pointage refuse.";
      await loadStatus();
      return;
    }
    const actionLabel = actionLabels[payload.entry.action] || "pointage";
    result.textContent = `Pointage ${actionLabel} enregistre a ${timeLabel(payload.entry.timestamp)}.`;
    observation.value = "";
    await loadStatus();
  } catch {
    result.textContent = "Impossible d'enregistrer le pointage.";
  } finally {
    if (!/complete/i.test(todayStatus.textContent)) punchButton.disabled = false;
  }
}

function timeLabel(value) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
