const PENDING_KEY = "assistant-xavier-quick-notes-pending-v1";

const el = {
  recordButton: document.querySelector("#recordButton"),
  recordIcon: document.querySelector("#recordIcon"),
  recordState: document.querySelector("#recordState"),
  noteText: document.querySelector("#noteText"),
  saveButton: document.querySelector("#saveButton"),
  clearButton: document.querySelector("#clearButton"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  pendingCount: document.querySelector("#pendingCount"),
  toast: document.querySelector("#toast"),
};

let recognition = null;
let isListening = false;
let finalTranscript = "";

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderPending();
  syncPendingNotes();
  setTimeout(() => el.noteText.focus(), 200);
});

function bindEvents() {
  el.recordButton.addEventListener("click", toggleDictation);
  el.saveButton.addEventListener("click", saveCurrentNote);
  el.clearButton.addEventListener("click", clearNote);
  el.syncButton.addEventListener("click", syncPendingNotes);
  window.addEventListener("online", syncPendingNotes);
  el.noteText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveCurrentNote();
    }
  });
}

function toggleDictation() {
  if (isListening) {
    stopDictation();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Dictee non disponible ici. Tu peux ecrire la note.");
    el.noteText.focus();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.continuous = true;
  recognition.interimResults = true;
  finalTranscript = el.noteText.value.trim();

  recognition.onstart = () => {
    isListening = true;
    el.recordButton.classList.add("is-listening");
    el.recordIcon.textContent = "Stop";
    el.recordState.textContent = "Je t'ecoute...";
  };

  recognition.onresult = (event) => {
    let sessionFinal = "";
    let interim = "";
    for (let index = 0; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        sessionFinal += transcript;
      } else {
        interim += transcript;
      }
    }
    const prefix = finalTranscript ? `${finalTranscript} ` : "";
    el.noteText.value = `${prefix}${sessionFinal}${interim}`.trim();
  };

  recognition.onerror = () => {
    showToast("Micro indisponible.");
  };

  recognition.onend = () => {
    isListening = false;
    el.recordButton.classList.remove("is-listening");
    el.recordIcon.textContent = "Micro";
    el.recordState.textContent = el.noteText.value.trim() ? "Note prete a enregistrer." : "Appuie, parle, enregistre.";
  };

  recognition.start();
}

function stopDictation() {
  if (recognition && isListening) recognition.stop();
  recognition = null;
  isListening = false;
  el.recordButton.classList.remove("is-listening");
  el.recordIcon.textContent = "Micro";
}

async function saveCurrentNote() {
  const text = el.noteText.value.trim();
  if (!text) {
    showToast("Note vide.");
    return;
  }

  stopDictation();
  const note = {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString(),
  };

  el.saveButton.disabled = true;
  el.syncStatus.textContent = "Envoi...";
  const saved = await sendNote(note);
  if (!saved) {
    addPending(note);
    showToast("Note gardee sur le telephone. Elle partira au retour du reseau.");
  } else {
    showToast("Note enregistree.");
  }

  el.noteText.value = "";
  el.recordState.textContent = "Appuie, parle, enregistre.";
  el.saveButton.disabled = false;
  renderPending();
  setTimeout(() => el.noteText.focus(), 100);
}

function clearNote() {
  stopDictation();
  el.noteText.value = "";
  el.recordState.textContent = "Appuie, parle, enregistre.";
  el.noteText.focus();
}

async function sendNote(note) {
  try {
    const response = await fetch("/api/notes/quick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function getPendingNotes() {
  try {
    const saved = localStorage.getItem(PENDING_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function setPendingNotes(notes) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(notes));
}

function addPending(note) {
  const pending = getPendingNotes();
  setPendingNotes([note, ...pending]);
}

async function syncPendingNotes() {
  const pending = getPendingNotes();
  if (!pending.length) {
    el.syncStatus.textContent = navigator.onLine ? "Pret" : "Hors ligne";
    renderPending();
    return;
  }

  el.syncStatus.textContent = "Sync...";
  const remaining = [];
  for (const note of pending.reverse()) {
    const saved = await sendNote(note);
    if (!saved) remaining.unshift(note);
  }
  setPendingNotes(remaining);
  renderPending();
  el.syncStatus.textContent = remaining.length ? "En attente" : "Pret";
  if (!remaining.length) showToast("Notes synchronisees.");
}

function renderPending() {
  const count = getPendingNotes().length;
  el.pendingCount.textContent = String(count);
  el.syncButton.disabled = count === 0;
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.classList.remove("is-visible");
  }, 2400);
}
