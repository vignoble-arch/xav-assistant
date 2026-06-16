const nextActionHint = document.querySelector("#nextActionHint");
const greetingCard = document.querySelector("#greetingCard");
const greetingKicker = document.querySelector("#greetingKicker");
const greetingTitle = document.querySelector("#greetingTitle");
const greetingText = document.querySelector("#greetingText");
const todayStatus = document.querySelector("#todayStatus");
const todayEntries = document.querySelector("#todayEntries");
const observation = document.querySelector("#observation");
const punchButton = document.querySelector("#punchButton");
const result = document.querySelector("#result");
const params = new URLSearchParams(location.search);
const nfcMode = params.get("nfc") === "1";
const AUTO_PUNCH_GUARD_MS = 45000;
const AUTO_PUNCH_KEY = "assistant-xavier-pointeuse-last-auto";

const actionLabels = {
  arrival: "arrivee",
  departure: "depart",
  complete: "journee complete",
};

document.addEventListener("DOMContentLoaded", async () => {
  punchButton.addEventListener("click", punch);
  const payload = await loadStatus();
  if (nfcMode && payload?.nextAction !== "complete") {
    await autoPunchFromNfc();
  }
});

async function loadStatus() {
  try {
    const response = await fetch("/api/timeclock/public");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Pointeuse indisponible.");
    renderStatus(payload);
    return payload;
  } catch {
    nextActionHint.textContent = "Impossible de charger la pointeuse. Reessaie dans un instant.";
    todayStatus.textContent = "Hors ligne";
    todayEntries.textContent = "";
    setGreeting("Pointeuse indisponible", "Reessaie dans un instant.", "Connexion impossible pour le moment.", "neutral");
    return null;
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
  if (nextAction === "departure") {
    setGreeting("Bonjour Cathy", "Arrivee deja notee", "Scanne la pastille au moment du depart.", "arrival");
  } else if (nextAction === "complete") {
    setGreeting("Merci Cathy", "Journee complete", "L'arrivee et le depart sont bien notes.", "departure");
  } else {
    setGreeting("Bonjour Cathy", "Prete a pointer", nfcMode ? "Le scan NFC va enregistrer ton arrivee." : "Scanne la pastille NFC ou appuie sur le bouton.", "neutral");
  }
}

async function autoPunchFromNfc() {
  const lastAutoPunch = Number(localStorage.getItem(AUTO_PUNCH_KEY) || 0);
  if (Date.now() - lastAutoPunch < AUTO_PUNCH_GUARD_MS) {
    result.textContent = "Scan deja pris en compte il y a quelques secondes.";
    return;
  }
  localStorage.setItem(AUTO_PUNCH_KEY, String(Date.now()));
  await punch({ automatic: true });
}

async function punch(options = {}) {
  if (punchButton.disabled) return;
  punchButton.disabled = true;
  const automatic = Boolean(options.automatic);
  result.textContent = automatic ? "Scan NFC detecte, enregistrement..." : "Enregistrement...";
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
    const hour = timeLabel(payload.entry.timestamp);
    observation.value = "";
    await loadStatus();
    if (payload.entry.action === "arrival") {
      setGreeting("Bonjour Cathy", `Heure d'arrivee : ${hour}`, "Bonne journee.", "arrival");
      result.textContent = `Arrivee enregistree a ${hour}.`;
    } else if (payload.entry.action === "departure") {
      setGreeting("Au revoir et merci", `Heure de depart : ${hour}`, "Le depart est bien enregistre.", "departure");
      result.textContent = `Depart enregistre a ${hour}.`;
    } else {
      result.textContent = `Pointage ${actionLabel} enregistre a ${hour}.`;
    }
  } catch {
    result.textContent = "Impossible d'enregistrer le pointage.";
  } finally {
    if (!/complete/i.test(todayStatus.textContent)) punchButton.disabled = false;
  }
}

function setGreeting(kicker, title, text, mode = "neutral") {
  greetingKicker.textContent = kicker;
  greetingTitle.textContent = title;
  greetingText.textContent = text;
  greetingCard.classList.toggle("is-arrival", mode === "arrival");
  greetingCard.classList.toggle("is-departure", mode === "departure");
}

function timeLabel(value) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
