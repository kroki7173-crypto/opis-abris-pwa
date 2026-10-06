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
