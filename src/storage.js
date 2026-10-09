const DATABASE = "opis-uchetka-pwa";
const STORE = "drafts";
const CURRENT_KEY = "current";
const SURVEY_PREFIX = "survey:";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    // Settled by the transaction, not the request: a write is on the phone only once it is committed, and an
    // aborted transaction (e.g. storage full) must not leave the save waiting for ever.
    tx.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    const fail = () => {
      database.close();
      reject(tx.error ?? request.error);
    };
    tx.onerror = fail;
    tx.onabort = fail;
  }));
}

export function loadDraft() {
  return transaction("readonly", (store) => store.get(CURRENT_KEY));
}

export function saveDraft(value) {
  return transaction("readwrite", (store) => store.put(value, CURRENT_KEY));
}

export function clearDraft() {
  return transaction("readwrite", (store) => store.delete(CURRENT_KEY));
}

// The ↶ history of the open object, so that an undo survives closing the app (Codex walk 08.10.2026).
const HISTORY_KEY = "history";

export function loadHistory() {
  return transaction("readonly", (store) => store.get(HISTORY_KEY));
}

export function saveHistory(value) {
  return transaction("readwrite", (store) => store.put(value, HISTORY_KEY));
}

export function saveSurvey(value, savedAt = new Date().toISOString()) {
  const packageId = value?.package?.package_id;
  if (typeof packageId !== "string" || !packageId) {
    return Promise.reject(new TypeError("У замера отсутствует идентификатор объекта."));
  }
  const record = { ...value, storage_kind: "survey", saved_at: savedAt };
  return transaction("readwrite", (store) => store.put(record, SURVEY_PREFIX + packageId));
}

export function listSurveys() {
  return transaction("readonly", (store) => store.getAll()).then((values) => (
    values.filter((value) => value?.storage_kind === "survey" && value.package?.package_id)
  ));
}

export function deleteSurvey(packageId) {
  if (typeof packageId !== "string" || !packageId) {
    return Promise.reject(new TypeError("Не указан объект для удаления."));
  }
  return transaction("readwrite", (store) => store.delete(SURVEY_PREFIX + packageId));
}


const VOICE_PREFIX = "voice:";

export function saveVoiceNote(packageId, noteId, blob) {
  return transaction("readwrite", (store) => store.put(
    { storage_kind: "voice_note", package_id: packageId, note_id: noteId, blob },
    VOICE_PREFIX + packageId + ":" + noteId,
  ));
}

export function loadVoiceNote(packageId, noteId) {
  return transaction("readonly", (store) => store.get(VOICE_PREFIX + packageId + ":" + noteId))
    .then((value) => value?.blob ?? null);
}

export async function deleteVoiceNotesForPackage(packageId) {
  const keys = await transaction("readonly", (store) => store.getAllKeys());
  const prefix = VOICE_PREFIX + packageId + ":";
  const matching = keys.filter((key) => typeof key === "string" && key.startsWith(prefix));
  if (!matching.length) return;
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      for (const key of matching) tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}
