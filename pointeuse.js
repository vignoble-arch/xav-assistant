const employeeSelect = document.querySelector("#employeeSelect");
const employeeName = document.querySelector("#employeeName");
const employeeCode = document.querySelector("#employeeCode");
const manualNameLabel = document.querySelector("#manualNameLabel");
const result = document.querySelector("#result");

const actionLabels = {
  arrival: "arrivee",
  departure: "depart",
  break_start: "pause",
  break_end: "reprise",
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadEmployees();
  employeeSelect.addEventListener("change", updateManualNameVisibility);
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => punch(button.dataset.action));
  });
});

async function loadEmployees() {
  try {
    const response = await fetch("/api/timeclock/public");
    const payload = await response.json();
    const employees = (payload.employees || []).filter((employee) => employee.active !== false);
    employeeSelect.innerHTML = [
      `<option value="">Choisir...</option>`,
      ...employees.map((employee) => `<option value="${escapeHTML(employee.id)}">${escapeHTML(employee.name)}</option>`),
      `<option value="manual">Mon nom n'est pas dans la liste</option>`,
    ].join("");
  } catch {
    employeeSelect.innerHTML = `<option value="manual">Saisir mon nom</option>`;
  }
  updateManualNameVisibility();
}

function updateManualNameVisibility() {
  manualNameLabel.hidden = employeeSelect.value !== "manual";
}

async function punch(action) {
  const selected = employeeSelect.value;
  const body = {
    action,
    source: "nfc",
    employeeId: selected && selected !== "manual" ? selected : "",
    employeeName: selected === "manual" ? employeeName.value.trim() : "",
    code: employeeCode.value.trim(),
  };

  if (!body.employeeId && !body.employeeName) {
    result.textContent = "Choisis ton nom avant de pointer.";
    return;
  }

  result.textContent = "Enregistrement...";
  try {
    const response = await fetch("/api/timeclock/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      result.textContent = payload.error || "Pointage refuse.";
      return;
    }
    const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(payload.entry.timestamp));
    result.textContent = `Pointage ${actionLabels[action]} enregistre a ${time}.`;
    employeeCode.value = "";
    await loadEmployees();
  } catch {
    result.textContent = "Impossible d'enregistrer le pointage.";
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
