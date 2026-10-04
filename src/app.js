import {
  MAX_SHAPE_WALLS,
  OPENING_PRESETS,
  addInteriorToPackage,
  addOpeningToPackage,
  connectionForOpening,
  connectionsForWall,
  createAdjacentRoom,
  createInterior,
  createPackage,
  createPolygonRoom,
  createRectangleRoom,
  cornerName,
  fileNameFor,
  interiorPoints,
  isPolygonRoom,
  removeInteriorFromPackage,
  removeOpeningFromPackage,
  roomPoints,
  setOpeningWallThickness,
  solveOutline,
  updateInteriorInPackage,
  updateOpeningInPackage,
  validatePackage,
} from "./model.js";
import {
  clearDraft,
  deleteSurvey,
  listSurveys,
  loadDraft,
  saveDraft,
  saveSurvey,
} from "./storage.js";
import {
  archiveEntriesForDay,
  archiveFileName,
  sortSurveyRecords,
  surveysForLocalDay,
} from "./catalog.js";
import { createStoredZip } from "./zip.js";
import { createVoiceController } from "./voice.js";

const ids = [
  "startScreen", "roomScreen", "openingsScreen", "interiorScreen", "adjacentScreen", "shapeScreen", "doneScreen",
  "shapeButton", "shapeBackButton", "shapeFewerButton", "shapeMoreButton", "shapeCount", "shapeCanvas",
  "shapeCaption", "shapeFields", "shapeStatus", "shapeDoneButton", "shapeResetButton", "shapeMirrorButton",
  "adjacentShapeButton", "adjacentShapeNote",
  "address", "roomName", "firstLength", "secondLength", "wallThickness", "startButton",
  "surveyCount", "surveyEmpty", "surveyList", "shareTodayButton",
  "backButton", "saveRoomButton", "openingCanvas", "openingWall", "openingOffset",
  "openingWidth", "widthPresets", "addOpeningButton", "openingCancelEditButton", "openingList", "openingsBackButton",
  "openingOffsetButton", "openingOffsetValue", "openingCornerName", "openingWidthButton", "openingWidthValue",
  "openingThicknessPrompt", "openingThicknessText",
  "interiorsButton", "interiorBackButton", "interiorCanvas", "interiorWall",
  "interiorOffset", "interiorInset", "interiorWidth", "interiorDepth", "interiorName",
  "interiorPartition", "interiorDoorWidth", "interiorDoorWall", "storageFields",
  "addInteriorButton", "interiorCancelEditButton", "interiorList", "interiorDoneButton",
  "finishButton", "openingsRoomName", "wallLockHint", "adjacentFrom", "adjacentName",
  "adjacentFirstLength", "adjacentSecondLength", "adjacentCanvas", "adjacentOverviewCanvas", "adjacentPreview",
  "adjacentStatus", "adjacentBindingHint", "adjacentAnchorPanel", "adjacentAnchorLead",
  "adjacentAnchorCorner", "adjacentAnchorOffset",
  "adjacentAnchorCornerButton", "adjacentAnchorCornerValue", "adjacentAnchorOffsetButton", "adjacentAnchorOffsetValue",
  "adjacentBackButton", "createAdjacentButton", "shareButton", "objectListButton", "editButton",
  "editOpeningsButton", "newButton", "roomCanvas", "planCanvas", "saveStatus",
  "errorMessage", "voiceStatus", "voiceStatusText", "voiceTarget", "voiceStopButton",
  "contextMicButton", "headerTitle", "themeToggle", "themeColor", "undoButton", "redoButton",
  "wallThicknessButton", "wallThicknessValue", "roomDoorButton", "roomWindowButton",
  "settingsDialog", "settingsClose", "darkThemeSetting", "showThemeControl",
  "helpDialog", "helpClose", "measureNavButton", "objectsNavButton", "settingsNavButton", "helpNavButton",
  "summaryAddress", "roomSummary", "validationPanel", "validationTitle", "validationList", "installButton",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const kindButtons = [...document.querySelectorAll("[data-kind]")];
const interiorKindButtons = [...document.querySelectorAll("[data-interior-kind]")];
const VOICE_FIELDS = [
  ["address", "text", "адрес"],
  ["roomName", "text", "название комнаты"],
  ["firstLength", "measurement", "размер первой стены"],
  ["secondLength", "measurement", "размер соседней стены"],
  ["wallThickness", "measurement", "толщину стены"],
  ["openingOffset", "measurement", "расстояние до проёма"],
  ["openingWidth", "measurement", "ширину проёма"],
  ["adjacentName", "text", "название следующей комнаты"],
  ["adjacentFirstLength", "measurement", "первую стену следующей комнаты"],
  ["adjacentSecondLength", "measurement", "соседнюю стену следующей комнаты"],
  ["adjacentAnchorOffset", "measurement", "привязку двери от угла"],
  ["interiorName", "text", "название кладовки"],
  ["interiorOffset", "measurement", "отступ вдоль стены"],
  ["interiorInset", "measurement", "отступ внутрь комнаты"],
  ["interiorWidth", "measurement", "ширину внутреннего объекта"],
  ["interiorDepth", "measurement", "глубину внутреннего объекта"],
  ["interiorPartition", "measurement", "толщину перегородки"],
  ["interiorDoorWidth", "measurement", "ширину двери кладовки"],
];
const voiceController = createVoiceController(window, setVoiceStatus);

let packageData = null;
let currentScreen = "start";
let currentRoomIndex = 0;
let pendingAdjacent = null;
let shapeState = newShapeState();
let pendingShape = null;
let openingKind = "door";
let editingOpeningId = null;
let interiorKind = "storage";
let editingInteriorId = null;
let installPrompt = null;
let saveTimer = null;
let catalogRenderToken = 0;
let activeVoiceTarget = null;
let voiceListening = false;
let voicePanelTimer = null;
let activeRoomWall = 0;
let historyEntries = [];
let historyCursor = -1;
let historyRestoring = false;
let roomPulseFrame = null;
let openingPulseFrame = null;
let adjacentPulseFrame = null;
let openingPlacementActive = false;
// A new opening is centred on its wall until the technician types or dictates a distance.
let openingOffsetTouched = false;
let planView = { zoom: 1, x: 0, y: 0 };
let celebratedRevision = null;

function showError(error) {
  elements.errorMessage.textContent = error instanceof Error ? error.message : String(error);
  elements.errorMessage.hidden = false;
  elements.errorMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function clearError() {
  elements.errorMessage.hidden = true;
  elements.errorMessage.textContent = "";
}
function setVoiceStatus(message, isError = false) {
  clearTimeout(voicePanelTimer);
  if (!message) {
    elements.voiceStatus.hidden = true;
    elements.voiceStatus.classList.remove("listening", "is-error");
    return;
  }
  elements.voiceStatus.hidden = false;
  elements.voiceStatus.classList.toggle("is-error", isError);
  elements.voiceStatus.classList.toggle("listening", voiceListening && !isError);
  elements.voiceStatusText.textContent = isError
    ? "Не удалось распознать"
    : voiceListening ? "Микрофон работает" : "Готово";
  elements.voiceTarget.textContent = message;
  if (!voiceListening) {
    voicePanelTimer = setTimeout(() => {
      elements.voiceStatus.hidden = true;
    }, isError ? 5200 : 2800);
  }
}

function selectVoiceTarget(input, mode, label) {
  if (!input) return;
  activeVoiceTarget = { input, mode, label };
  elements.contextMicButton.title = `Продиктовать: ${label}`;
  elements.contextMicButton.setAttribute("aria-label", `Продиктовать: ${label}`);
}

function selectVoiceTargetById(id) {
  const definition = VOICE_FIELDS.find(([fieldId]) => fieldId === id);
  if (!definition) return;
  const [, mode, label] = definition;
  selectVoiceTarget(elements[id], mode, label);
}

function defaultVoiceTargetForScreen() {
  if (currentScreen === "start") return "address";
  if (currentScreen === "room") {
    if (activeRoomWall === 1 || activeRoomWall === 3) return "secondLength";
    if (activeRoomWall === 0 || activeRoomWall === 2) return "firstLength";
    return !elements.firstLength.value ? "firstLength" :
      !elements.secondLength.value ? "secondLength" : "wallThickness";
  }
  if (currentScreen === "openings") return "openingOffset";
  if (currentScreen === "interior") return "interiorWidth";
  if (currentScreen === "adjacent") return !elements.adjacentFirstLength.value
    ? "adjacentFirstLength" : !pendingShape && !elements.adjacentSecondLength.value
      ? "adjacentSecondLength" : "adjacentAnchorOffset";
  return null;
}

function refreshVoiceTarget() {
  if (currentScreen === "shape") {
    elements.contextMicButton.hidden = false;
    selectShapeVoiceTarget();
    return;
  }
  const id = defaultVoiceTargetForScreen();
  elements.contextMicButton.hidden = currentScreen === "done";
  if (id) selectVoiceTargetById(id);
}

async function startContextVoice() {
  if (!activeVoiceTarget || voiceListening) return;
  const capability = voiceController.capability();
  if (!capability.available) {
    setVoiceStatus(capability.reason + " Введите значение вручную.", true);
    activeVoiceTarget.input.focus();
    return;
  }
  const { input, mode, label } = activeVoiceTarget;
  elements.contextMicButton.disabled = true;
  try {
    await voiceController.listen({
      mode,
      timeoutMs: 8000,
      onListening(listening) {
        voiceListening = listening;
        elements.contextMicButton.disabled = listening;
        elements.voiceStatus.classList.toggle("listening", listening);
        if (listening) {
          elements.voiceStatus.hidden = false;
          elements.voiceStatus.classList.remove("is-error");
          elements.voiceStatusText.textContent = "Микрофон работает";
          elements.voiceTarget.textContent = `Слушаю: ${label}`;
        }
      },
      onValue(value) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.dataset.shapeKey) advanceShapeTarget();
        if (input === elements.openingOffset && openingPlacementActive) {
          setTimeout(() => elements.addOpeningButton.click(), 0);
        }
        if (input === elements.wallThickness && currentScreen === "openings") {
          const room = packageData?.rooms?.[currentRoomIndex];
          const missing = [...(room?.openings ?? [])].reverse().find((opening) => !(opening.wall_thickness_m > 0));
          if (missing) {
            packageData = setOpeningWallThickness(packageData, currentRoomIndex, missing.id, value);
            renderOpenings();
            persist();
          }
        }
        if (navigator.vibrate) navigator.vibrate(35);
      },
    });
  } catch {
    // Голосовая ошибка уже показана в общей плашке; ручной ввод остаётся доступным.
  } finally {
    voiceListening = false;
    elements.contextMicButton.disabled = !voiceController.capability().available;
    elements.voiceStatus.classList.remove("listening");
  }
}

function stopContextVoice() {
  voiceController.stop();
  voiceListening = false;
  elements.contextMicButton.disabled = !voiceController.capability().available;
  setVoiceStatus("Голосовой ввод остановлен.", false);
}

function installVoiceInputs() {
  const capability = voiceController.capability();
  for (const [id, mode, label] of VOICE_FIELDS) {
    const input = elements[id];
    if (!input) continue;
    const activate = () => selectVoiceTarget(input, mode, label);
    input.addEventListener("focus", activate);
    input.addEventListener("pointerdown", activate);
  }
  elements.contextMicButton.disabled = !capability.available;
  elements.contextMicButton.title = capability.available ? "Включить микрофон" : capability.reason;
  refreshVoiceTarget();
}

const THEME_KEY = "opis-pwa-theme";
const THEME_CONTROL_KEY = "opis-pwa-show-theme-control";

function storedValue(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storeValue(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Настройка останется только до закрытия. */ }
}
function applyTheme(theme, persistChoice = true) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = value;
  elements.darkThemeSetting.checked = value === "dark";
  elements.themeToggle.textContent = value === "dark" ? "☀" : "☾";
  elements.themeToggle.setAttribute("aria-label", value === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
  elements.themeColor.content = value === "dark" ? "#15181d" : "#153e60";
  if (persistChoice) storeValue(THEME_KEY, value);
  if (currentScreen === "room") renderRoomInput();
  if (currentScreen === "openings") renderOpenings();
  if (currentScreen === "interior") renderInteriors();
  if (currentScreen === "adjacent") renderAdjacent();
  if (currentScreen === "shape") renderShape();
  if (currentScreen === "done") renderSummary();
}
function setThemeControlVisible(visible, persistChoice = true) {
  elements.themeToggle.hidden = !visible;
  elements.showThemeControl.checked = visible;
  if (persistChoice) storeValue(THEME_CONTROL_KEY, visible ? "1" : "0");
}

function updateHistoryButtons() {
  elements.undoButton.disabled = historyCursor <= 0;
  elements.redoButton.disabled = historyCursor < 0 || historyCursor >= historyEntries.length - 1;
}
function recordHistory(value = draftValue()) {
  if (historyRestoring) return;
  const serialized = JSON.stringify(value);
  if (historyCursor >= 0 && historyEntries[historyCursor]?.serialized === serialized) return;
  historyEntries = historyEntries.slice(0, historyCursor + 1);
  historyEntries.push({ serialized, value: structuredClone(value) });
  if (historyEntries.length > 50) historyEntries.shift();
  historyCursor = historyEntries.length - 1;
  updateHistoryButtons();
}
async function moveHistory(direction) {
  const nextIndex = historyCursor + direction;
  if (nextIndex < 0 || nextIndex >= historyEntries.length) return;
  const before = draftValue();
  const snapshot = structuredClone(historyEntries[nextIndex].value);
  historyCursor = nextIndex;
  historyRestoring = true;
  packageData = snapshot.package ?? null;
  restoreForm(snapshot);
  currentRoomIndex = Number.isInteger(snapshot.currentRoomIndex) ? snapshot.currentRoomIndex : 0;
  pendingAdjacent = snapshot.pendingAdjacent ?? null;
  showScreen(snapshot.screen ?? (packageData?.rooms?.length ? "done" : "start"));
  await persist();
  historyRestoring = false;
  updateHistoryButtons();
  if (direction < 0) {
    const measurementIds = ["firstLength", "secondLength", "wallThickness", "openingOffset", "openingWidth", "adjacentFirstLength", "adjacentSecondLength", "adjacentAnchorOffset"];
    const changed = measurementIds.find((id) => before.form?.[id] !== snapshot.form?.[id]);
    if (changed) {
      selectVoiceTargetById(changed);
      setTimeout(startContextVoice, 0);
    }
  }
}

function initializeUi() {
  applyTheme(storedValue(THEME_KEY, "light"), false);
  setThemeControlVisible(storedValue(THEME_CONTROL_KEY, "0") === "1", false);
  elements.themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  elements.darkThemeSetting.addEventListener("change", () => applyTheme(elements.darkThemeSetting.checked ? "dark" : "light"));
  elements.showThemeControl.addEventListener("change", () => setThemeControlVisible(elements.showThemeControl.checked));
  elements.settingsNavButton.addEventListener("click", () => elements.settingsDialog.showModal());
  elements.settingsClose.addEventListener("click", () => elements.settingsDialog.close());
  elements.helpNavButton.addEventListener("click", () => elements.helpDialog.showModal());
  elements.helpClose.addEventListener("click", () => elements.helpDialog.close());
  elements.contextMicButton.addEventListener("click", startContextVoice);
  elements.voiceStopButton.addEventListener("click", stopContextVoice);
  elements.undoButton.addEventListener("click", () => moveHistory(-1).catch(showError));
  elements.redoButton.addEventListener("click", () => moveHistory(1).catch(showError));
  elements.measureNavButton.addEventListener("click", () => {
    showScreen(packageData?.rooms?.length ? "done" : packageData ? "room" : "start");
  });
  elements.objectsNavButton.addEventListener("click", () => showScreen("start"));
  elements.wallThicknessButton.addEventListener("click", () => {
    selectVoiceTargetById("wallThickness");
    startContextVoice();
  });
  elements.roomDoorButton.addEventListener("click", () => {
    openingPlacementActive = true;
    setKind("door");
    elements.saveRoomButton.click();
  });
  elements.roomWindowButton.addEventListener("click", () => {
    openingPlacementActive = true;
    setKind("window");
    elements.saveRoomButton.click();
  });
  elements.openingOffsetButton.addEventListener("click", () => {
    selectVoiceTargetById("openingOffset");
    elements.openingOffset.focus({ preventScroll: true });
    elements.openingOffset.select();
  });
  elements.openingWidthButton.addEventListener("click", () => {
    selectVoiceTargetById("openingWidth");
    elements.openingWidth.focus({ preventScroll: true });
    elements.openingWidth.select();
  });
  elements.openingThicknessPrompt.addEventListener("click", () => {
    selectVoiceTargetById("wallThickness");
    startContextVoice();
  });
  elements.adjacentAnchorCornerButton.addEventListener("click", () => {
    elements.adjacentAnchorCorner.value = elements.adjacentAnchorCorner.value === "start" ? "end" : "start";
    elements.adjacentAnchorCorner.dispatchEvent(new Event("input", { bubbles: true }));
  });
  elements.adjacentAnchorOffsetButton.addEventListener("click", () => {
    selectVoiceTargetById("adjacentAnchorOffset");
    startContextVoice();
  });
  installPlanGestures();
}
function syncHeaderTitle() {
  const address = (currentScreen === "start" || !packageData ? elements.address.value : packageData.address).trim();
  elements.headerTitle.textContent = address || "Новый замер";
}
// One finger pans the whole plan, two fingers zoom about their midpoint; a double tap resets the view.
function installPlanGestures() {
  const canvas = elements.planCanvas;
  const pointers = new Map();
  let last = null;
  let lastTap = 0;
  const toCanvas = (clientX, clientY) => {
    const bounds = canvas.getBoundingClientRect();
    return [(clientX - bounds.left) * canvas.width / bounds.width, (clientY - bounds.top) * canvas.height / bounds.height];
  };
  const snapshot = () => {
    const points = [...pointers.values()];
    const mid = [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
    const spread = points.length > 1 ? Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]) : 0;
    return { mid, spread };
  };
  const redraw = () => drawPlan(canvas, packageData, planView);
  canvas.addEventListener("pointerdown", (event) => {
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Capture only keeps the drag alive outside the canvas. */ }
    pointers.set(event.pointerId, toCanvas(event.clientX, event.clientY));
    last = snapshot();
    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 320) {
        planView = { zoom: 1, x: 0, y: 0 };
        redraw();
      }
      lastTap = now;
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, toCanvas(event.clientX, event.clientY));
    const current = snapshot();
    const centre = [canvas.width / 2, canvas.height / 2];
    const factor = last.spread > 0 && current.spread > 0 ? current.spread / last.spread : 1;
    const zoom = Math.min(8, Math.max(0.5, planView.zoom * factor));
    const applied = zoom / planView.zoom;
    // Keep the plan point under the fingers' midpoint fixed while zooming, then follow the midpoint.
    planView = {
      zoom,
      x: (last.mid[0] - centre[0]) - (last.mid[0] - centre[0] - planView.x) * applied + (current.mid[0] - last.mid[0]),
      y: (last.mid[1] - centre[1]) - (last.mid[1] - centre[1] - planView.y) * applied + (current.mid[1] - last.mid[1]),
    };
    last = current;
    redraw();
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    last = pointers.size ? snapshot() : null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

function showScreen(name) {
  currentScreen = name;
  syncHeaderTitle();
  if (name === "done") planView = { zoom: 1, x: 0, y: 0 };
  if (name !== "openings") cancelAnimationFrame(openingPulseFrame);
  if (name !== "adjacent") cancelAnimationFrame(adjacentPulseFrame);
  const microphoneHost = elements[name + "Screen"]?.querySelector(".plan-toolbar");
  (microphoneHost ?? document.querySelector(".shell")).append(elements.contextMicButton);
  elements.contextMicButton.classList.toggle("docked", Boolean(microphoneHost));
  for (const screen of ["start", "room", "openings", "interior", "adjacent", "shape", "done"]) {
    elements[screen + "Screen"].hidden = screen !== name;
  }
  clearError();
  if (name === "start") renderSurveyCatalog().catch(showError);
  if (name === "room") renderRoomInput();
  if (name === "openings") renderOpenings();
  if (name === "interior") renderInteriors();
  if (name === "adjacent") renderAdjacent();
  if (name === "shape") renderShape();
  if (name === "done") renderSummary();
  const objectMode = name === "start";
  elements.measureNavButton.classList.toggle("active", !objectMode);
  elements.objectsNavButton.classList.toggle("active", objectMode);
  refreshVoiceTarget();
}
function draftValue() {
  return {
    version: 4,
    screen: currentScreen,
    package: packageData,
    currentRoomIndex,
    pendingAdjacent,
    shape: shapeState,
    pendingShape,
    editingOpeningId,
    openingPlacementActive,
    editingInteriorId,
    form: {
      address: elements.address.value,
      roomName: elements.roomName.value,
      firstLength: elements.firstLength.value,
      secondLength: elements.secondLength.value,
      wallThickness: elements.wallThickness.value,
      openingKind,
      openingWall: elements.openingWall.value,
      openingOffset: elements.openingOffset.value,
      openingWidth: elements.openingWidth.value,
      interiorKind,
      interiorWall: elements.interiorWall.value,
      interiorOffset: elements.interiorOffset.value,
      interiorInset: elements.interiorInset.value,
      interiorWidth: elements.interiorWidth.value,
      interiorDepth: elements.interiorDepth.value,
      interiorName: elements.interiorName.value,
      interiorPartition: elements.interiorPartition.value,
      interiorDoorWidth: elements.interiorDoorWidth.value,
      interiorDoorWall: elements.interiorDoorWall.value,
      adjacentName: elements.adjacentName.value,
      adjacentFirstLength: elements.adjacentFirstLength.value,
      adjacentSecondLength: elements.adjacentSecondLength.value,
      adjacentAnchorCorner: elements.adjacentAnchorCorner.value,
      adjacentAnchorOffset: elements.adjacentAnchorOffset.value,
    },
  };
}
async function persist() {
  try {
    const value = draftValue();
    await saveDraft(value);
    if (value.package?.rooms?.length) await saveSurvey(value);
    if (!historyRestoring) recordHistory(value);
    elements.saveStatus.textContent = value.package?.rooms?.length
      ? "Черновик и объект сохранены на этом устройстве"
      : "Черновик сохранён на этом устройстве";
  } catch {
    elements.saveStatus.textContent = "Не удалось сохранить черновик — не закрывайте страницу";
  }
}
function schedulePersist() {
  elements.saveStatus.textContent = "Сохраняем…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 180);
}
function restoreForm(draft) {
  const form = draft?.form ?? {};
  elements.address.value = form.address ?? draft?.package?.address ?? "";
  elements.roomName.value = form.roomName || "Прихожая";
  elements.firstLength.value = form.firstLength ?? "";
  elements.secondLength.value = form.secondLength ?? "";
  elements.wallThickness.value = form.wallThickness ?? "";
  elements.wallThicknessValue.textContent = elements.wallThickness.value || "—";
  elements.openingWall.dataset.wanted = form.openingWall || "0";
  elements.openingWall.value = form.openingWall || "0";
  elements.openingOffset.value = form.openingOffset ?? "0";
  elements.openingWidth.value = form.openingWidth || "0,80";
  elements.interiorWall.dataset.wanted = form.interiorWall || "0";
  elements.interiorWall.value = form.interiorWall || "0";
  elements.interiorOffset.value = form.interiorOffset ?? "0,50";
  elements.interiorInset.value = form.interiorInset ?? "0,50";
  elements.interiorWidth.value = form.interiorWidth || "1,20";
  elements.interiorDepth.value = form.interiorDepth || "1,20";
  elements.interiorName.value = form.interiorName || "Кладовка";
  elements.interiorPartition.value = form.interiorPartition || "0,10";
  elements.interiorDoorWidth.value = form.interiorDoorWidth || "0,80";
  elements.interiorDoorWall.value = form.interiorDoorWall || "2";
  elements.adjacentName.value = form.adjacentName || "";
  elements.adjacentFirstLength.value = form.adjacentFirstLength || "";
  elements.adjacentSecondLength.value = form.adjacentSecondLength || form.adjacentDepth || "";
  elements.adjacentAnchorCorner.value = form.adjacentAnchorCorner || "start";
  elements.adjacentAnchorOffset.value = form.adjacentAnchorOffset || "";
  openingKind = form.openingKind || "door";
  interiorKind = form.interiorKind || "storage";
  currentRoomIndex = Number.isInteger(draft?.currentRoomIndex) ? draft.currentRoomIndex : 0;
  pendingAdjacent = draft?.pendingAdjacent ?? null;
  editingOpeningId = draft?.editingOpeningId ?? null;
  openingPlacementActive = Boolean(draft?.openingPlacementActive || editingOpeningId);
  editingInteriorId = draft?.editingInteriorId ?? null;
  shapeState = restoreShapeState(draft?.shape, newShapeState());
  pendingShape = restoreShapeState(draft?.pendingShape, null);
  elements.startButton.disabled = !elements.address.value.trim();
  setKind(openingKind, false, false);
  setInteriorKind(interiorKind, false);
}
function fillRoomForm(room) {
  if (!room) return;
  elements.roomName.value = room.name;
  // A non-rectangular room has no "two walls" to show; its sizes live on the shape screen.
  elements.firstLength.value = isPolygonRoom(room) ? "" : String(room.walls[0].length_m).replace(".", ",");
  elements.secondLength.value = isPolygonRoom(room) ? "" : String(room.walls[1].length_m).replace(".", ",");
  elements.wallThickness.value = String(room.wall_thickness_m).replace(".", ",");
}
function decimal(value) {
  return Number(String(value).replace(",", "."));
}
function previewRoom() {
  const rawWidth = decimal(elements.firstLength.value);
  const rawHeight = decimal(elements.secondLength.value);
  const widthKnown = rawWidth > 0;
  const heightKnown = rawHeight > 0;
  const width = widthKnown ? rawWidth : 3;
  const height = heightKnown ? rawHeight : 2.4;
  return {
    walls: [
      { length_m: width, source: widthKnown ? "measured" : "unmeasured", id: "preview-1" },
      { length_m: height, source: heightKnown ? "measured" : "unmeasured", id: "preview-2" },
      { length_m: width, source: widthKnown ? "inferred_opposite" : "unmeasured", id: "preview-3" },
      { length_m: height, source: heightKnown ? "inferred_opposite" : "unmeasured", id: "preview-4" },
    ],
    openings: [],
  };
}
function roomBox(canvas, room) {
  const margin = 84;
  const width = room.walls[0].length_m;
  const height = room.walls[1].length_m;
  const scale = Math.min((canvas.width - 2 * margin) / width, (canvas.height - 2 * margin) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const left = (canvas.width - drawWidth) / 2;
  const top = (canvas.height - drawHeight) / 2;
  return { left, top, right: left + drawWidth, bottom: top + drawHeight, scale, width, height };
}
function openingSegment(box, wallIndex, opening) {
  const start = opening.offset_m * box.scale;
  const length = opening.width_m * box.scale;
  if (wallIndex === 0) return [box.left + start, box.bottom, box.left + start + length, box.bottom];
  if (wallIndex === 1) return [box.right, box.bottom - start, box.right, box.bottom - start - length];
  if (wallIndex === 2) return [box.right - start, box.top, box.right - start - length, box.top];
  return [box.left, box.top + start, box.left, box.top + start + length];
}
function uiColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function drawOpeningSymbol(context, segment, opening, fieldColor) {
  const [x1, y1, x2, y2] = segment;
  const span = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / span;
  const ny = (x2 - x1) / span;
  context.strokeStyle = fieldColor;
  context.lineWidth = 18;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.strokeStyle = opening.kind === "window" ? uiColor("--button", "#285778") : uiColor("--nav-text", "#153e60");
  context.lineWidth = 5;
  if (opening.kind === "window") {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x1 - nx * 6, y1 - ny * 6); context.lineTo(x2 - nx * 6, y2 - ny * 6);
    context.moveTo(x1 + nx * 6, y1 + ny * 6); context.lineTo(x2 + nx * 6, y2 + ny * 6);
    context.stroke();
    return;
  }
  const jamb = 11;
  context.beginPath();
  context.moveTo(x1 - nx * jamb, y1 - ny * jamb); context.lineTo(x1 + nx * jamb, y1 + ny * jamb);
  context.moveTo(x2 - nx * jamb, y2 - ny * jamb); context.lineTo(x2 + nx * jamb, y2 + ny * jamb);
  context.stroke();
}

function drawInteriorSymbol(context, points, interior) {
  const text = uiColor("--text", "#1a1a1a");
  const border = interior.kind === "storage"
    ? uiColor("--button", "#285778")
    : uiColor("--muted", "#4a5568");
  context.save();
  context.fillStyle = interior.kind === "void"
    ? uiColor("--field", "#ffffff")
    : uiColor("--button-bg", "#e5edf5");
  context.strokeStyle = border;
  context.lineWidth = interior.kind === "storage" ? 5 : 3;
  if (interior.kind === "void") context.setLineDash([10, 7]);
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
  context.stroke();
  context.setLineDash([]);
  const center = [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
  context.fillStyle = text;
  context.font = "700 18px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(interior.kind === "storage" ? interior.name : interior.kind === "column" ? "Колонна" : "Проём",
    center[0], center[1]);
  context.restore();
}

function roomLocalPoint(room, point) {
  const roomContour = roomPoints(room);
  const start = roomContour[0];
  const end = roomContour[1];
  const length = room.walls[0].length_m;
  const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const direction = roomContour.slice(0, -1).reduce((sum, current, index, points) => {
    const next = points[(index + 1) % points.length];
    return sum + current[0] * next[1] - next[0] * current[1];
  }, 0) > 0 ? 1 : -1;
  const inward = [-unit[1] * direction, unit[0] * direction];
  const delta = [point[0] - start[0], point[1] - start[1]];
  return [delta[0] * unit[0] + delta[1] * unit[1], delta[0] * inward[0] + delta[1] * inward[1]];
}
function roomPointToCanvas(room, box, point) {
  const [x, y] = roomLocalPoint(room, point);
  return [box.left + x * box.scale, box.bottom - y * box.scale];
}
// Fits a room of any shape into the canvas; the first wall stays horizontal along the bottom.
function polygonBox(canvas, room) {
  const margin = 76;
  const local = roomPoints(room).slice(0, -1).map((point) => roomLocalPoint(room, point));
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.1);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 0.1);
  const scale = Math.min((canvas.width - 2 * margin) / spanX, (canvas.height - 2 * margin) / spanY);
  return {
    left: (canvas.width - spanX * scale) / 2 - Math.min(...xs) * scale,
    bottom: (canvas.height - spanY * scale) / 2 + Math.max(...ys) * scale,
    scale,
  };
}
function canvasWallSegment(canvas, room, wallIndex, opening) {
  if (!isPolygonRoom(room)) return openingSegment(roomBox(canvas, room), wallIndex, opening);
  const box = polygonBox(canvas, room);
  const [start, end] = roomPoints(room).slice(wallIndex, wallIndex + 2).map((point) => roomPointToCanvas(room, box, point));
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  const ux = (end[0] - start[0]) / length;
  const uy = (end[1] - start[1]) / length;
  const from = opening.offset_m * box.scale;
  const to = (opening.offset_m + opening.width_m) * box.scale;
  return [start[0] + ux * from, start[1] + uy * from, start[0] + ux * to, start[1] + uy * to];
}
function distanceToCanvasSegment(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSquared));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}
function nearestWallIndex(canvas, room, x, y) {
  if (isPolygonRoom(room)) {
    const box = polygonBox(canvas, room);
    const points = roomPoints(room).map((point) => roomPointToCanvas(room, box, point));
    const distances = room.walls.map((_, index) => distanceToCanvasSegment(x, y, points[index], points[index + 1]));
    return distances.indexOf(Math.min(...distances));
  }
  const box = roomBox(canvas, room);
  const distances = [
    Math.abs(y - box.bottom), Math.abs(x - box.right),
    Math.abs(y - box.top), Math.abs(x - box.left),
  ];
  return distances.indexOf(Math.min(...distances));
}
// Returns a function giving the unit normal that points out of the outline for an edge.
function canvasOutward(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index][0] * next[1] - next[0] * points[index][1];
  }
  const side = area > 0 ? 1 : -1;
  return (a, b) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [side * (b[1] - a[1]) / length, -side * (b[0] - a[0]) / length];
  };
}
function formatLength(value) {
  return value.toFixed(2).replace(".", ",");
}
function drawCornerLetters(context, corners, outward) {
  context.fillStyle = uiColor("--muted", "#4a5568");
  context.font = "700 17px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  corners.forEach((corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    const first = outward(previous, corner);
    const second = outward(corner, next);
    const bisector = [first[0] + second[0], first[1] + second[1]];
    const length = Math.hypot(bisector[0], bisector[1]) || 1;
    context.fillText(cornerName(index), corner[0] + bisector[0] / length * 26, corner[1] + bisector[1] / length * 26);
  });
}
function drawPolygonRoom(canvas, room, selectedWall, attention) {
  const context = canvas.getContext("2d");
  const field = uiColor("--field", "#ffffff");
  const text = uiColor("--text", "#1a1a1a");
  const measured = uiColor("--measured", "#5c7d5f");
  const danger = uiColor("--danger", "#8b1e1e");
  const box = polygonBox(canvas, room);
  const points = roomPoints(room).map((point) => roomPointToCanvas(room, box, point));
  const corners = points.slice(0, -1);
  const outward = canvasOutward(corners);

  context.fillStyle = uiColor("--surface", "#f0f0f0");
  context.beginPath();
  context.moveTo(corners[0][0], corners[0][1]);
  for (const point of corners.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();

  room.walls.forEach((wall, wallIndex) => {
    const active = selectedWall === wallIndex;
    context.strokeStyle = active && attention ? danger : measured;
    context.globalAlpha = active && attention ? 0.7 + 0.3 * ((Math.sin(Date.now() / 220) + 1) / 2) : 1;
    context.lineWidth = active && attention ? 14 : 9;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(points[wallIndex][0], points[wallIndex][1]);
    context.lineTo(points[wallIndex + 1][0], points[wallIndex + 1][1]);
    context.stroke();
    context.globalAlpha = 1;
  });

  const end = points[points.length - 1];
  if (Math.hypot(end[0] - corners[0][0], end[1] - corners[0][1]) > 1) {
    context.setLineDash([6, 6]);
    context.strokeStyle = danger;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(end[0], end[1]);
    context.lineTo(corners[0][0], corners[0][1]);
    context.stroke();
    context.setLineDash([]);
  }
  for (const interior of room.interiors ?? []) {
    drawInteriorSymbol(context, interiorPoints(room, interior).map((point) => roomPointToCanvas(room, box, point)), interior);
  }
  for (const opening of room.openings ?? []) {
    const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
    if (wallIndex < 0) continue;
    drawOpeningSymbol(context, canvasWallSegment(canvas, room, wallIndex, opening), opening, field);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = text;
  context.font = "700 20px system-ui";
  room.walls.forEach((wall, wallIndex) => {
    const a = points[wallIndex];
    const b = points[wallIndex + 1];
    const normal = outward(a, b);
    context.fillText(formatLength(wall.length_m), (a[0] + b[0]) / 2 + normal[0] * 30, (a[1] + b[1]) / 2 + normal[1] * 30);
  });
  drawCornerLetters(context, corners, outward);
}
function drawRoom(canvas, room, selectedWall = null, attention = false, inputIds = ["firstLength", "secondLength"]) {
  const context = canvas.getContext("2d");
  const field = uiColor("--field", "#ffffff");
  const text = uiColor("--text", "#1a1a1a");
  const muted = uiColor("--muted", "#4a5568");
  const border = uiColor("--border", "#c9ced6");
  const measured = uiColor("--measured", "#5c7d5f");
  const danger = uiColor("--danger", "#8b1e1e");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = field;
  context.fillRect(0, 0, canvas.width, canvas.height);
  canvas.dimensionHitboxes = [];
  if (!room) return;
  if (isPolygonRoom(room)) {
    drawPolygonRoom(canvas, room, selectedWall, attention);
    return;
  }

  const box = roomBox(canvas, room);
  const segments = [
    [box.left, box.bottom, box.right, box.bottom],
    [box.right, box.bottom, box.right, box.top],
    [box.right, box.top, box.left, box.top],
    [box.left, box.top, box.left, box.bottom],
  ];
  room.walls.forEach((wall, wallIndex) => {
    const segment = segments[wallIndex];
    const active = selectedWall === wallIndex;
    context.strokeStyle = active && attention ? danger : wall.source === "unmeasured" ? border : measured;
    context.globalAlpha = active && attention ? 0.7 + 0.3 * ((Math.sin(Date.now() / 220) + 1) / 2) : 1;
    context.lineWidth = active && attention ? 14 : 9;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(segment[0], segment[1]);
    context.lineTo(segment[2], segment[3]);
    context.stroke();
    context.globalAlpha = 1;
  });

  for (const interior of room.interiors ?? []) {
    drawInteriorSymbol(
      context,
      interiorPoints(room, interior).map((point) => roomPointToCanvas(room, box, point)),
      interior,
    );
  }

  for (const opening of room.openings ?? []) {
    const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
    if (wallIndex < 0) continue;
    drawOpeningSymbol(context, openingSegment(box, wallIndex, opening), opening, field);
  }

  context.fillStyle = text;
  context.font = "700 24px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const format = (value) => value.toFixed(2).replace(".", ",");
  const labels = [
    { wall: 0, x: (box.left + box.right) / 2, y: box.bottom + 34, rotate: 0, input: inputIds[0] },
    { wall: 1, x: box.right + 36, y: (box.top + box.bottom) / 2, rotate: Math.PI / 2, input: inputIds[1] },
    { wall: 2, x: (box.left + box.right) / 2, y: box.top - 30, rotate: 0, input: inputIds[0] },
    { wall: 3, x: box.left - 36, y: (box.top + box.bottom) / 2, rotate: -Math.PI / 2, input: inputIds[1] },
  ];
  for (const label of labels) {
    const wall = room.walls[label.wall];
    if (wall.source === "unmeasured") continue;
    context.save();
    context.translate(label.x, label.y);
    context.rotate(label.rotate);
    context.fillText(format(wall.length_m), 0, 0);
    context.restore();
    canvas.dimensionHitboxes.push({
      wallIndex: label.wall,
      inputId: label.input,
      left: label.x - (label.rotate ? 28 : 58),
      right: label.x + (label.rotate ? 28 : 58),
      top: label.y - (label.rotate ? 58 : 25),
      bottom: label.y + (label.rotate ? 58 : 25),
    });
  }

}
function drawPlan(canvas, pkg, view = { zoom: 1, x: 0, y: 0 }) {
  const context = canvas.getContext("2d");
  const field = uiColor("--field", "#ffffff");
  const surface = uiColor("--surface", "#f7f8fa");
  const measured = uiColor("--measured", "#5c7d5f");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = field;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!pkg?.rooms?.length) return;
  const roomPointSets = pkg.rooms.map((room) => roomPoints(room));
  const points = roomPointSets.flatMap((room) => room.slice(0, -1));
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const margin = 54;
  const spanX = Math.max(maxX - minX, 0.1);
  const spanY = Math.max(maxY - minY, 0.1);
  const scale = Math.min((canvas.width - 2 * margin) / spanX, (canvas.height - 2 * margin) / spanY);
  const offsetX = (canvas.width - spanX * scale) / 2;
  const offsetY = (canvas.height - spanY * scale) / 2;
  // Zoom is about the canvas centre; pan is added afterwards, both in canvas pixels.
  const transform = (point) => [
    canvas.width / 2 + (offsetX + (point[0] - minX) * scale - canvas.width / 2) * view.zoom + view.x,
    canvas.height / 2 + (canvas.height - offsetY - (point[1] - minY) * scale - canvas.height / 2) * view.zoom + view.y,
  ];

  roomPointSets.forEach((roomPointsValue, roomIndex) => {
    const room = pkg.rooms[roomIndex];
    const transformed = roomPointsValue.map(transform);
    context.fillStyle = surface;
    context.strokeStyle = measured;
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(transformed[0][0], transformed[0][1]);
    for (const point of transformed.slice(1)) context.lineTo(point[0], point[1]);
    context.fill();
    context.stroke();

    for (const interior of room.interiors ?? []) {
      drawInteriorSymbol(context, interiorPoints(room, interior).map(transform), interior);
    }

    for (const opening of room.openings) {
      const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
      const wall = room.walls[wallIndex];
      const start = transformed[wallIndex];
      const end = transformed[wallIndex + 1];
      const dx = (end[0] - start[0]) / wall.length_m;
      const dy = (end[1] - start[1]) / wall.length_m;
      drawOpeningSymbol(context, [
        start[0] + dx * opening.offset_m,
        start[1] + dy * opening.offset_m,
        start[0] + dx * (opening.offset_m + opening.width_m),
        start[1] + dy * (opening.offset_m + opening.width_m),
      ], opening, surface);
    }

  });
}
function renderRoomInput() {
  const wallsReady = decimal(elements.firstLength.value) > 0 && decimal(elements.secondLength.value) > 0;
  elements.wallThicknessButton.classList.toggle("needs-value", wallsReady && !(decimal(elements.wallThickness.value) > 0));
  cancelAnimationFrame(roomPulseFrame);
  const draw = () => {
    drawRoom(elements.roomCanvas, previewRoom(), activeRoomWall, true);
    if (currentScreen === "room" && activeRoomWall !== null) roomPulseFrame = requestAnimationFrame(draw);
  };
  draw();
}
function typeName(kind) {
  return { door: "Дверь", window: "Окно", passage: "Проём" }[kind];
}
function setKind(kind, resetWidth = true, persistChange = true) {
  openingKind = kind;
  for (const button of kindButtons) button.classList.toggle("active", button.dataset.kind === kind);
  if (resetWidth) {
    const fallback = kind === "door" ? 0.8 : kind === "window" ? 1.3 : 0.9;
    elements.openingWidth.value = fallback.toFixed(2).replace(".", ",");
  }
  if (openingPlacementActive) centerOpeningOffset();
  renderPresets();
  if (currentScreen === "openings") renderOpenings();
  if (persistChange) schedulePersist();
}
function renderPresets() {
  elements.widthPresets.replaceChildren();
  const current = decimal(elements.openingWidth.value);
  for (const width of OPENING_PRESETS[openingKind]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset" + (Math.abs(current - width) < 1e-9 ? " active" : "");
    button.textContent = width.toFixed(2).replace(".", ",");
    button.addEventListener("click", () => {
      elements.openingWidth.value = width.toFixed(2).replace(".", ",");
      renderPresets();
      schedulePersist();
    });
    elements.widthPresets.append(button);
  }
}

function centerOpeningOffset() {
  if (openingOffsetTouched || editingOpeningId) return;
  const room = packageData?.rooms?.[currentRoomIndex];
  const wall = room?.walls?.[Number(elements.openingWall.value)];
  const width = decimal(elements.openingWidth.value);
  if (!wall || !Number.isFinite(width)) return;
  const centered = Math.max(0, Math.round((wall.length_m - width) / 2 * 100) / 100);
  elements.openingOffset.value = centered.toFixed(2).replace(".", ",");
}

function openingFormValues() {
  return {
    kind: openingKind,
    wallIndex: Number(elements.openingWall.value),
    offsetM: elements.openingOffset.value,
    widthM: elements.openingWidth.value,
  };
}

function clearOpeningEdit(resetFields = true) {
  editingOpeningId = null;
  openingPlacementActive = false;
  openingOffsetTouched = false;
  elements.addOpeningButton.textContent = "Поставить на план";
  elements.openingCancelEditButton.hidden = true;
  if (!resetFields) return;
  elements.openingWall.value = "0";
  elements.openingOffset.value = "0";
  setKind("door", true, false);
}

function beginOpeningEdit(opening) {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  editingOpeningId = opening.id;
  openingPlacementActive = true;
  openingOffsetTouched = true;
  elements.openingWall.value = String(room.walls.findIndex((wall) => wall.id === opening.wall_id));
  elements.openingOffset.value = String(opening.offset_m).replace(".", ",");
  elements.openingWidth.value = String(opening.width_m).replace(".", ",");
  setKind(opening.kind, false, false);
  renderOpenings();
  elements.openingCanvas.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function interiorTypeName(kind) {
  return { storage: "Кладовка", column: "Колонна", void: "Проём в перекрытии" }[kind];
}

function setInteriorKind(kind, persistChange = true) {
  interiorKind = ["storage", "column", "void"].includes(kind) ? kind : "storage";
  for (const button of interiorKindButtons) {
    button.classList.toggle("active", button.dataset.interiorKind === interiorKind);
  }
  elements.storageFields.hidden = interiorKind !== "storage";
  if (currentScreen === "interior") renderInteriors();
  if (persistChange) schedulePersist();
}

function interiorFormValues() {
  return {
    kind: interiorKind,
    wallIndex: Number(elements.interiorWall.value),
    offsetM: elements.interiorOffset.value,
    insetM: elements.interiorInset.value,
    widthM: elements.interiorWidth.value,
    depthM: elements.interiorDepth.value,
    name: elements.interiorName.value,
    partitionM: elements.interiorPartition.value,
    doorWidthM: elements.interiorDoorWidth.value,
    doorWall: Number(elements.interiorDoorWall.value),
  };
}

function interiorDecimal(value) {
  return String(value).replace(".", ",");
}

function clearInteriorEdit(resetFields = true) {
  editingInteriorId = null;
  elements.addInteriorButton.textContent = "Добавить на план";
  elements.interiorCancelEditButton.hidden = true;
  if (!resetFields) return;
  elements.interiorWall.value = "0";
  elements.interiorOffset.value = "0,50";
  elements.interiorInset.value = "0,50";
  elements.interiorWidth.value = "1,20";
  elements.interiorDepth.value = "1,20";
  elements.interiorName.value = "Кладовка";
  elements.interiorPartition.value = "0,10";
  elements.interiorDoorWidth.value = "0,80";
  elements.interiorDoorWall.value = "2";
  setInteriorKind("storage", false);
}

function beginInteriorEdit(interior) {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  editingInteriorId = interior.id;
  setInteriorKind(interior.kind, false);
  elements.interiorWall.value = String(room.walls.findIndex((wall) => wall.id === interior.wall_id));
  elements.interiorOffset.value = interiorDecimal(interior.offset_m);
  elements.interiorInset.value = interiorDecimal(interior.inset_m);
  elements.interiorWidth.value = interiorDecimal(interior.width_m);
  elements.interiorDepth.value = interiorDecimal(interior.depth_m);
  if (interior.kind === "storage") {
    elements.interiorName.value = interior.name;
    elements.interiorPartition.value = interiorDecimal(interior.partition_m);
    elements.interiorDoorWidth.value = interiorDecimal(interior.door_width_m);
    elements.interiorDoorWall.value = String(interior.door_wall);
  }
  elements.addInteriorButton.textContent = "Сохранить изменения";
  elements.interiorCancelEditButton.hidden = false;
  renderInteriors();
  elements.interiorCanvas.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderInteriors() {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const editingInterior = (room.interiors ?? []).find((item) => item.id === editingInteriorId);
  if (editingInteriorId && !editingInterior) clearInteriorEdit(false);
  elements.addInteriorButton.textContent = editingInterior ? "Сохранить изменения" : "Добавить на план";
  elements.interiorCancelEditButton.hidden = !editingInterior;
  syncWallOptions(elements.interiorWall, room);
  const wallIndex = Math.min(Math.max(Number(elements.interiorWall.value) || 0, 0), room.walls.length - 1);
  elements.interiorWall.value = String(wallIndex);
  elements.storageFields.hidden = interiorKind !== "storage";
  let preview = room;
  try {
    const candidate = createInterior(room, interiorFormValues());
    preview = structuredClone(room);
    preview.interiors ??= [];
    if (editingInteriorId) {
      preview.interiors = preview.interiors.filter((item) => item.id !== editingInteriorId);
    }
    preview.interiors.push(candidate);
  } catch {
    // Неполный ввод не мешает показывать уже сохранённые объекты.
  }
  drawRoom(elements.interiorCanvas, preview);
  elements.interiorList.replaceChildren();
  for (const interior of room.interiors ?? []) {
    const row = document.createElement("div");
    row.className = "opening-row";
    const text = document.createElement("span");
    const title = interior.kind === "storage" ? interior.name : interiorTypeName(interior.kind);
    const partition = interior.kind === "storage" ? ` · перегородка ${interior.partition_m.toFixed(2)} м` : "";
    text.textContent = `${title} · ${interior.width_m.toFixed(2)} × ${interior.depth_m.toFixed(2)} м${partition}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger compact";
    remove.textContent = "Удалить";
    remove.addEventListener("click", async () => {
      try {
        packageData = removeInteriorFromPackage(packageData, currentRoomIndex, interior.id);
        if (editingInteriorId === interior.id) clearInteriorEdit();
        renderInteriors();
        await persist();
      } catch (error) {
        showError(error);
      }
    });
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary compact";
    edit.textContent = "Изменить";
    edit.addEventListener("click", () => beginInteriorEdit(interior));
    actions.append(edit, remove);
    row.append(text, actions);
    elements.interiorList.append(row);
  }
}

function latestOpeningWithoutThickness(room) {
  return [...(room?.openings ?? [])].reverse().find((opening) => !(opening.wall_thickness_m > 0)) ?? null;
}
function openAdjacent(roomIndex, openingId) {
  const room = packageData.rooms[roomIndex];
  const opening = room.openings.find((item) => item.id === openingId);
  clearOpeningEdit();
  if (!(opening.wall_thickness_m > 0)) {
    currentRoomIndex = roomIndex;
    showScreen("openings");
    selectVoiceTargetById("wallThickness");
    setVoiceStatus("Укажите толщину стены перед переходом в следующую комнату.", false);
    startContextVoice();
    return;
  }
  pendingAdjacent = { roomIndex, openingId };
  pendingShape = null;
  const wall = room.walls.find((item) => item.id === opening.wall_id);
  elements.adjacentName.value = "Комната " + (packageData.rooms.length + 1);
  elements.adjacentFirstLength.value = wall.length_m.toFixed(2).replace(".", ",");
  elements.adjacentSecondLength.value = "";
  elements.adjacentAnchorCorner.value = "start";
  elements.adjacentAnchorOffset.value = "";
  showScreen("adjacent");
  schedulePersist();
  selectVoiceTargetById("adjacentSecondLength");
  setTimeout(startContextVoice, 0);
}
function renderOpenings() {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const editingOpening = room.openings.find((item) => item.id === editingOpeningId);
  if (editingOpeningId && !editingOpening) clearOpeningEdit(false);
  elements.addOpeningButton.textContent = editingOpening ? "Сохранить изменения" : "Поставить на план";
  elements.openingCancelEditButton.hidden = !editingOpening;
  elements.openingsRoomName.textContent = room.name;
  syncWallOptions(elements.openingWall, room);
  const wallIndex = Math.min(Math.max(Number(elements.openingWall.value) || 0, 0), room.walls.length - 1);
  elements.openingWall.value = String(wallIndex);
  elements.openingOffsetValue.textContent = elements.openingOffset.value || "—";
  elements.openingCornerName.textContent = cornerName(wallIndex);
  elements.openingWidthValue.textContent = elements.openingWidth.value || "—";
  const selectedConnections = connectionsForWall(packageData, currentRoomIndex, room.walls[wallIndex].id);
  const selectedFullConnection = selectedConnections.some(
    (connection) => (connection.mode ?? "full_wall") === "full_wall",
  );
  elements.wallLockHint.hidden = !selectedFullConnection;
  elements.addOpeningButton.disabled = selectedFullConnection;
  elements.addOpeningButton.hidden = !openingPlacementActive;
  const displayRoom = editingOpening
    ? { ...room, openings: room.openings.filter((item) => item.id !== editingOpeningId) }
    : room;

  cancelAnimationFrame(openingPulseFrame);
  const draw = () => {
    drawRoom(elements.openingCanvas, displayRoom, wallIndex, openingPlacementActive && !selectedFullConnection);
    if (openingPlacementActive && !selectedFullConnection) {
      const offset = decimal(elements.openingOffset.value);
      const width = decimal(elements.openingWidth.value);
      if (Number.isFinite(offset) && offset >= 0 && width > 0 && offset + width <= room.walls[wallIndex].length_m) {
        drawOpeningSymbol(
          elements.openingCanvas.getContext("2d"),
          canvasWallSegment(elements.openingCanvas, room, wallIndex, { offset_m: offset, width_m: width }),
          { kind: openingKind },
          uiColor("--field", "#ffffff"),
        );
      }
      if (currentScreen === "openings") openingPulseFrame = requestAnimationFrame(draw);
    }
  };
  draw();
  renderPresets();

  const missingThickness = latestOpeningWithoutThickness(room);
  elements.openingThicknessPrompt.hidden = !missingThickness;
  if (missingThickness) {
    elements.openingThicknessText.textContent = `Укажите толщину стены для: ${typeName(missingThickness.kind)}`;
  }

  elements.openingList.replaceChildren();
  for (const opening of room.openings) {
    const connection = connectionForOpening(packageData, currentRoomIndex, opening.id);
    const fullConnection = connectionsForWall(packageData, currentRoomIndex, opening.wall_id).some(
      (item) => (item.mode ?? "full_wall") === "full_wall",
    );
    const row = document.createElement("div");
    row.className = "opening-row";
    const text = document.createElement("span");
    const thickness = opening.wall_thickness_m > 0
      ? ` · стена ${opening.wall_thickness_m.toFixed(2)} м`
      : " · толщина не указана";
    text.textContent = `${typeName(opening.kind)} ${opening.width_m.toFixed(2)} м · от угла ${cornerName(Math.max(room.walls.findIndex((wall) => wall.id === opening.wall_id), 0))} ${opening.offset_m.toFixed(2)} м${thickness}`;
    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (opening.kind !== "window") {
      const transition = document.createElement("button");
      transition.type = "button";
      transition.className = "secondary compact";
      transition.textContent = connection ? "Комната связана" : "Войти";
      transition.disabled = Boolean(connection);
      transition.addEventListener("click", () => openAdjacent(currentRoomIndex, opening.id));
      actions.append(transition);
    }
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary compact";
    edit.textContent = "Изменить";
    edit.disabled = Boolean(connection) || fullConnection;
    edit.title = edit.disabled ? "Связанный проём изменяется вместе с комнатами" : "Изменить проём";
    edit.addEventListener("click", () => beginOpeningEdit(opening));
    actions.append(edit);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger compact";
    remove.textContent = "Удалить";
    remove.disabled = Boolean(connection) || fullConnection;
    remove.addEventListener("click", async () => {
      try {
        packageData = removeOpeningFromPackage(packageData, currentRoomIndex, opening.id);
        if (editingOpeningId === opening.id) clearOpeningEdit();
        renderOpenings();
        await persist();
      } catch (error) {
        showError(error);
      }
    });
    actions.append(remove);
    row.append(text, actions);
    elements.openingList.append(row);
  }
}
const MAX_SHAPE_UI_WALLS = Math.min(12, MAX_SHAPE_WALLS);
// The technician picks the corner from this set; "other" lets them type degrees.
const ANGLE_PRESETS = [
  ["90", "90° — обычный"], ["270", "270° — выступ внутрь"], ["135", "135°"], ["45", "45°"],
  ["225", "225°"], ["315", "315°"], ["other", "Другой…"],
];

function wallsCount(count) {
  return count + (count % 10 >= 2 && count % 10 <= 4 && (count < 12 || count > 14) ? " стены" : " стен");
}
function isBlank(value) {
  return String(value ?? "").trim() === "";
}
function newShapeState(context = "first", name = "") {
  return { context, count: 5, walls: [], angles: [], clockwise: false, name, thickness: "", active: null };
}
function restoreShapeState(value, fallback) {
  const valid = value && typeof value === "object" && Number.isInteger(value.count) &&
    value.count >= 3 && value.count <= MAX_SHAPE_UI_WALLS && Array.isArray(value.walls) &&
    Array.isArray(value.angles);
  if (!valid) return fallback;
  return {
    context: value.context === "adjacent" ? "adjacent" : "first",
    count: value.count,
    walls: value.walls.map((item) => String(item ?? "")),
    angles: Array.from(value.angles, (item) => String(item ?? "")),
    clockwise: value.clockwise === true,
    name: String(value.name ?? ""),
    thickness: String(value.thickness ?? ""),
    active: typeof value.active === "string" ? value.active : null,
  };
}
function shapeStateFromRoom(room) {
  const text = (value) => String(value).replace(".", ",");
  const count = room.walls.length;
  const angles = [];
  for (let corner = 1; corner < count; corner += 1) {
    const turn = ((room.walls[corner].angle_deg - room.walls[corner - 1].angle_deg + 540) % 360) - 180;
    angles[corner] = text(Math.round((180 - turn) * 1e6) / 1e6);
  }
  return {
    context: "first",
    count,
    walls: room.walls.map((wall) => text(wall.length_m)),
    angles,
    clockwise: false,
    name: room.name,
    thickness: text(room.wall_thickness_m),
    active: null,
  };
}
function adjacentDoorWallLength() {
  const typed = decimal(elements.adjacentFirstLength.value);
  if (typed > 0) return typed;
  const parent = packageData?.rooms?.[pendingAdjacent?.roomIndex];
  const opening = parent?.openings?.find((item) => item.id === pendingAdjacent?.openingId);
  return parent?.walls?.find((wall) => wall.id === opening?.wall_id)?.length_m ?? 0;
}
function shapeWallKeys(state = shapeState) {
  return Array.from({ length: state.count }, (_, index) => "w" + index)
    .filter((key) => !(state.context === "adjacent" && key === "w0"));
}
function shapeKeyLabel(key) {
  const count = shapeState.count;
  const index = Number(key.slice(1));
  if (key[0] === "w") return `Стена ${cornerName(index)}–${cornerName((index + 1) % count)}`;
  return `Угол ${cornerName(index)}`;
}
function readShapeValue(key) {
  if (key === "name") return shapeState.name;
  if (key === "thickness") return shapeState.thickness;
  const index = Number(key.slice(1));
  if (key[0] === "w") {
    if (index === 0 && shapeState.context === "adjacent") {
      const length = adjacentDoorWallLength();
      return length > 0 ? String(length).replace(".", ",") : "";
    }
    return shapeState.walls[index] ?? "";
  }
  return isBlank(shapeState.angles[index]) ? "90" : shapeState.angles[index];
}
function writeShapeValue(key, value) {
  if (key === "name") shapeState.name = value;
  else if (key === "thickness") shapeState.thickness = value;
  else if (key[0] === "w") shapeState.walls[Number(key.slice(1))] = value;
  else shapeState.angles[Number(key.slice(1))] = value;
}
function shapeSolverInput() {
  const count = shapeState.count;
  return {
    wallLengthsM: Array.from({ length: count }, (_, index) => readShapeValue("w" + index)),
    interiorAnglesDeg: Array.from({ length: count - 1 }, (_, index) => readShapeValue("a" + (index + 1))),
    clockwise: shapeState.clockwise,
  };
}
function shapeSolution() {
  const input = shapeSolverInput();
  const count = input.wallLengthsM.length;
  if (!input.wallLengthsM.slice(0, count - 2).every((value) => decimal(value) > 0)) return { complete: false };
  const tail = input.wallLengthsM.slice(count - 2).map(isBlank);
  if (tail[0] !== tail[1]) {
    return { complete: false, hint: "Введите обе последние стены или оставьте обе пустыми — тогда они вычислятся." };
  }
  try {
    return { complete: true, outline: solveOutline(input) };
  } catch (error) {
    return { complete: true, error: error instanceof Error ? error.message : String(error) };
  }
}
function shapeInputFrom(state, firstLengthM) {
  return {
    wallLengthsM: Array.from({ length: state.count }, (_, index) => (index === 0 ? firstLengthM : (state.walls[index] ?? ""))),
    interiorAnglesDeg: Array.from({ length: state.count - 1 }, (_, index) => (isBlank(state.angles[index + 1]) ? "90" : state.angles[index + 1])),
    clockwise: Boolean(state.clockwise),
  };
}
function shapePreviewRoom(input) {
  const outline = solveOutline(input);
  return {
    id: "shape-preview",
    name: "",
    origin_m: [0, 0],
    wall_thickness_m: 0.1,
    right_angles: false,
    walls: outline.walls.map((wall, index) => ({ id: "shape-preview-" + index, ...wall })),
    openings: [],
    interiors: [],
  };
}
function nextShapeKey() {
  const empty = shapeWallKeys().find((key) => !(decimal(readShapeValue(key)) > 0));
  if (empty) return empty;
  if (shapeState.context === "first" && !(decimal(shapeState.thickness) > 0)) return "thickness";
  return null;
}
function selectShapeVoiceTarget() {
  const key = shapeState.active ?? nextShapeKey();
  const input = key ? document.getElementById("shape-" + key) : null;
  if (input && !input.readOnly) selectVoiceTarget(input, input.dataset.voiceMode, input.dataset.voiceLabel);
}
function advanceShapeTarget() {
  shapeState.active = nextShapeKey();
  renderShape();
  selectShapeVoiceTarget();
}
function placeholderShapePoints(count) {
  return Array.from({ length: count + 1 }, (_, index) => {
    const turn = -Math.PI / 2 - Math.PI / count + (index % count) * 2 * Math.PI / count;
    return [Math.cos(turn), Math.sin(turn)];
  });
}
function drawShape(canvas, solution) {
  const context = canvas.getContext("2d");
  const field = uiColor("--field", "#ffffff");
  const text = uiColor("--text", "#1a1a1a");
  const muted = uiColor("--muted", "#4a5568");
  const border = uiColor("--border", "#c9ced6");
  const measured = uiColor("--measured", "#5c7d5f");
  const danger = uiColor("--danger", "#8b1e1e");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = field;
  context.fillRect(0, 0, canvas.width, canvas.height);
  canvas.shapeHits = [];

  const count = shapeState.count;
  const outline = solution.outline ?? null;
  const local = outline ? outline.entered : placeholderShapePoints(count);
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  const margin = 76;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.1);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 0.1);
  const scale = Math.min((canvas.width - 2 * margin) / spanX, (canvas.height - 2 * margin) / spanY);
  const points = local.map(([x, y]) => [
    (canvas.width - spanX * scale) / 2 + (x - Math.min(...xs)) * scale,
    (canvas.height - spanY * scale) / 2 + (Math.max(...ys) - y) * scale,
  ]);
  const corners = points.slice(0, count);
  const outward = canvasOutward(corners);

  if (outline) {
    context.fillStyle = uiColor("--surface", "#f0f0f0");
    context.beginPath();
    context.moveTo(corners[0][0], corners[0][1]);
    for (const point of corners.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
    context.fill();
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineCap = "round";
  context.font = "700 19px system-ui";
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const active = shapeState.active === "w" + index;
    const known = decimal(readShapeValue("w" + index)) > 0;
    const worked = outline?.inferred.includes(index);
    context.setLineDash(worked ? [12, 9] : []);
    context.strokeStyle = active ? danger : known || worked ? measured : border;
    context.lineWidth = active ? 13 : 9;
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.stroke();
    context.setLineDash([]);
    if (outline) {
      const normal = outward(corners[index], corners[(index + 1) % count]);
      const shown = worked ? outline.inferred_lengths_m[index - (count - 2)] : decimal(readShapeValue("w" + index));
      if (shown > 0) {
        context.fillStyle = worked ? muted : text;
        context.fillText((worked ? "≈ " : "") + formatLength(shown),
          (a[0] + b[0]) / 2 + normal[0] * 32, (a[1] + b[1]) / 2 + normal[1] * 32);
      }
    }
    canvas.shapeHits.push({ key: "w" + index, a, b });
  }
  if (outline && outline.gap_m > 0.005) {
    context.setLineDash([6, 6]);
    context.strokeStyle = danger;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(points[count][0], points[count][1]);
    context.lineTo(points[0][0], points[0][1]);
    context.stroke();
    context.setLineDash([]);
  }
  drawCornerLetters(context, corners, outward);
  if (outline) {
    context.font = "700 15px system-ui";
    context.fillStyle = muted;
    outline.interior_angles_deg.forEach((degrees, corner) => {
      if (Math.abs(degrees - 90) < 1e-6) return;
      const previous = corners[(corner + count - 1) % count];
      const next = corners[(corner + 1) % count];
      const first = outward(previous, corners[corner]);
      const second = outward(corners[corner], next);
      const bisector = [first[0] + second[0], first[1] + second[1]];
      const length = Math.hypot(bisector[0], bisector[1]) || 1;
      context.fillText(Math.round(degrees * 10) / 10 + "°",
        corners[corner][0] - bisector[0] / length * 26, corners[corner][1] - bisector[1] / length * 26);
    });
    const area = Math.abs(local.slice(0, count).reduce((sum, point, index) => {
      const following = local[(index + 1) % count];
      return sum + point[0] * following[1] - following[0] * point[1];
    }, 0)) / 2;
    context.textAlign = "left";
    context.font = "600 18px system-ui";
    context.fillText(`Площадь по размерам: ${formatLength(area)} м²`, 18, canvas.height - 20);
  }
}
function createShapeField(key, labelText, options = {}) {
  const { voiceMode = "measurement", readOnly = false, wide = false } = options;
  const label = document.createElement("label");
  if (wide) label.className = "shape-wide";
  label.append(labelText);
  const input = document.createElement("input");
  input.id = "shape-" + key;
  input.dataset.shapeKey = key;
  input.dataset.voiceMode = voiceMode;
  input.dataset.voiceLabel = options.voiceLabel ?? labelText.toLowerCase();
  input.readOnly = readOnly;
  if (voiceMode === "measurement") {
    input.inputMode = "decimal";
    input.placeholder = options.placeholder ?? "0,00";
  } else {
    input.maxLength = 120;
  }
  const activate = () => {
    shapeState.active = key;
    if (!readOnly) selectVoiceTarget(input, voiceMode, input.dataset.voiceLabel);
    markShapeActive();
    drawShape(elements.shapeCanvas, shapeSolution());
  };
  input.addEventListener("focus", activate);
  input.addEventListener("pointerdown", activate);
  input.addEventListener("input", () => {
    writeShapeValue(key, input.value);
    renderShape();
    schedulePersist();
  });
  label.append(input);
  return label;
}
function createAngleField(corner) {
  const key = "a" + corner;
  const label = document.createElement("label");
  label.append(shapeKeyLabel(key));
  const select = document.createElement("select");
  select.id = "shape-" + key;
  select.dataset.shapeKey = key;
  for (const [value, title] of ANGLE_PRESETS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = title;
    select.append(option);
  }
  const custom = document.createElement("input");
  custom.id = "shape-ac" + corner;
  custom.inputMode = "decimal";
  custom.placeholder = "градусов";
  custom.setAttribute("aria-label", shapeKeyLabel(key) + ", градусы");
  const apply = () => {
    const value = readShapeValue(key);
    const known = ANGLE_PRESETS.some(([preset]) => preset === value && preset !== "other");
    select.value = known ? value : "other";
    custom.hidden = known;
    if (!known && document.activeElement !== custom) custom.value = value === "90" ? "" : value;
  };
  select.addEventListener("input", () => {
    writeShapeValue(key, select.value === "other" ? "" : select.value);
    apply();
    if (select.value === "other") custom.focus({ preventScroll: true });
    renderShape();
    schedulePersist();
  });
  custom.addEventListener("input", () => {
    writeShapeValue(key, custom.value);
    renderShape();
    schedulePersist();
  });
  label.append(select, custom);
  label.dataset.angleCorner = String(corner);
  label.refresh = apply;
  apply();
  return label;
}
function markShapeActive() {
  for (const input of elements.shapeFields.querySelectorAll("input")) {
    input.classList.toggle("active", input.dataset.shapeKey === shapeState.active);
  }
}
function syncShapeFields() {
  const fieldsKey = shapeState.context + ":" + shapeState.count;
  if (elements.shapeFields.dataset.key !== fieldsKey) {
    elements.shapeFields.dataset.key = fieldsKey;
    elements.shapeFields.replaceChildren();
    const add = (node) => elements.shapeFields.append(node);
    const heading = (title) => {
      const node = document.createElement("h3");
      node.textContent = title;
      add(node);
    };
    add(createShapeField("name", "Название", { voiceMode: "text", wide: true, voiceLabel: "название комнаты" }));
    if (shapeState.context === "first") {
      add(createShapeField("thickness", "Толщина стен, м", { wide: true, voiceLabel: "толщину стены" }));
    }
    heading("Стены и углы по порядку");
    for (let index = 0; index < shapeState.count; index += 1) {
      const door = shapeState.context === "adjacent" && index === 0;
      const computed = index >= shapeState.count - 2;
      add(createShapeField("w" + index, shapeKeyLabel("w" + index) + (door ? " (с дверью)" : ""), {
        readOnly: door,
        placeholder: computed ? "вычислится" : "0,00",
        voiceLabel: shapeKeyLabel("w" + index).toLowerCase(),
      }));
      if (index < shapeState.count - 1) add(createAngleField(index + 1));
      else {
        const note = document.createElement("label");
        note.append("Угол A");
        const value = document.createElement("input");
        value.id = "shape-a0";
        value.readOnly = true;
        value.setAttribute("tabindex", "-1");
        note.append(value);
        add(note);
      }
    }
  }
  for (const input of elements.shapeFields.querySelectorAll("input[data-shape-key]")) {
    if (document.activeElement !== input) input.value = readShapeValue(input.dataset.shapeKey);
  }
  for (const label of elements.shapeFields.querySelectorAll("[data-angle-corner]")) label.refresh();
  markShapeActive();
}
function renderShape() {
  syncShapeFields();
  const count = shapeState.count;
  elements.shapeCount.textContent = String(count);
  elements.shapeFewerButton.disabled = count <= 3;
  elements.shapeMoreButton.disabled = count >= MAX_SHAPE_UI_WALLS;
  elements.shapeResetButton.hidden = !(shapeState.context === "adjacent" && pendingShape);
  elements.shapeCaption.textContent = "Коснитесь стены и назовите размер · обход " +
    (shapeState.clockwise ? "по часовой стрелке" : "против часовой стрелки");
  const solution = shapeSolution();
  drawShape(elements.shapeCanvas, solution);
  const angleA = document.getElementById("shape-a0");
  if (angleA) {
    const degrees = solution.outline?.interior_angles_deg?.[0];
    angleA.value = degrees === undefined ? "" : Math.round(degrees * 10) / 10 + "° (считается)";
  }
  const missing = shapeWallKeys().slice(0, count - (shapeState.context === "adjacent" ? 3 : 2))
    .filter((key) => !(decimal(readShapeValue(key)) > 0));
  const needsThickness = shapeState.context === "first" && !(decimal(shapeState.thickness) > 0);
  const outline = solution.outline;
  const centimetres = outline ? Math.round(outline.gap_m * 100) : 0;
  const check = " Сверьте форму на экране с комнатой; если она зеркальная, нажмите «Отразить».";
  let message;
  let kind = "notice";
  if (!solution.complete) {
    const names = missing.slice(0, 3).map((key) => shapeKeyLabel(key).toLowerCase());
    message = solution.hint ?? "Введите стены по порядку. Осталось: " + names.join(", ") +
      (missing.length > 3 ? ` и ещё ${missing.length - 3}` : "") + ".";
  } else if (solution.error) {
    message = solution.error;
    kind = "error";
  } else if (outline.zone === "red") {
    message = `Невязка ${centimetres} см — больше 15 см. Проверьте длины стен и углы.`;
    kind = "error";
  } else if (outline.inferred.length) {
    message = `Две последние стены вычислены: ${formatLength(outline.inferred_lengths_m[0])} м и ` +
      `${formatLength(outline.inferred_lengths_m[1])} м.` + check;
  } else if (outline.gap_m < 0.005) {
    message = "Контур сходится." + check;
  } else {
    message = `Невязка ${centimetres} см в пределах допуска: замыкающая линия дорисована, размеры стен не менялись.` + check;
  }
  if (needsThickness && kind === "notice" && solution.complete && !solution.error) message = "Укажите толщину стен.";
  elements.shapeStatus.className = "message " + kind;
  elements.shapeStatus.textContent = message;
  elements.shapeDoneButton.disabled = !outline || outline.zone === "red" || needsThickness;
}
function openShape(context) {
  clearError();
  if (context === "adjacent") {
    shapeState = pendingShape
      ? { ...structuredClone(pendingShape), context: "adjacent", thickness: "", active: null }
      : newShapeState("adjacent", elements.adjacentName.value);
  } else {
    const room = packageData?.rooms?.[0];
    shapeState = room && isPolygonRoom(room) && room.walls.length <= MAX_SHAPE_UI_WALLS
      ? shapeStateFromRoom(room)
      : { ...newShapeState("first", elements.roomName.value || "Прихожая"), thickness: elements.wallThickness.value };
  }
  elements.shapeFields.dataset.key = "";
  showScreen("shape");
  schedulePersist();
}
function syncWallOptions(select, room) {
  const polygon = isPolygonRoom(room);
  const count = room.walls.length;
  // A wall restored from a draft is applied once; later rebuilds start from the current choice.
  const restored = select.dataset.wanted;
  delete select.dataset.wanted;
  if (select.options.length === count && select.dataset.polygon === String(polygon)) {
    if (restored !== undefined && Number(restored) < count) select.value = String(Number(restored) || 0);
    return;
  }
  const wanted = restored ?? select.value;
  select.replaceChildren();
  room.walls.forEach((_, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = polygon
      ? `Стена ${cornerName(index)}–${cornerName((index + 1) % count)}`
      : `Стена ${index + 1}`;
    select.append(option);
  });
  select.dataset.polygon = String(polygon);
  select.value = Number(wanted) < count ? String(Number(wanted) || 0) : "0";
}

function renderAdjacent() {
  const parent = packageData?.rooms?.[pendingAdjacent?.roomIndex];
  const opening = parent?.openings?.find((item) => item.id === pendingAdjacent?.openingId);
  if (!parent || !opening) throw new Error("Исходный проём для новой комнаты не найден.");
  const wallIndex = parent.walls.findIndex((wall) => wall.id === opening.wall_id);
  const parentWall = parent.walls[wallIndex];
  if (!elements.adjacentFirstLength.value) {
    elements.adjacentFirstLength.value = parentWall.length_m.toFixed(2).replace(".", ",");
  }
  elements.adjacentFrom.textContent = parent.name;

  const first = decimal(elements.adjacentFirstLength.value);
  const second = decimal(elements.adjacentSecondLength.value);
  const shaped = Boolean(pendingShape);
  const validSizes = first > 0 && (shaped || second > 0);
  const mismatch = first > 0 && Math.abs(first - parentWall.length_m) > 1e-6;
  elements.adjacentShapeButton.textContent = shaped ? "Изменить форму комнаты" : "Комната не прямоугольная";
  elements.adjacentShapeNote.hidden = !shaped;
  if (shaped) elements.adjacentShapeNote.textContent = `Форма: ${wallsCount(pendingShape.count)}, размеры введены.`;
  const anchorProvided = elements.adjacentAnchorOffset.value.trim() !== "";
  const anchorOffset = decimal(elements.adjacentAnchorOffset.value);
  const anchorCorner = elements.adjacentAnchorCorner.value;
  const childOffset = anchorCorner === "start" ? anchorOffset : first - anchorOffset - opening.width_m;
  const bindingComplete = !mismatch || (
    anchorProvided && Number.isFinite(anchorOffset) && anchorOffset >= 0 &&
    childOffset >= -1e-9 && childOffset + opening.width_m <= first + 1e-9
  );

  elements.adjacentAnchorPanel.hidden = !mismatch;
  elements.adjacentAnchorPanel.classList.toggle("complete", mismatch && bindingComplete);
  elements.adjacentAnchorLead.textContent = bindingComplete
    ? "Привязка к двери готова."
    : "Стена отличается — выберите ближайший угол и назовите расстояние до двери.";
  elements.adjacentAnchorCornerValue.textContent = anchorCorner === "start" ? "первый угол" : "второй угол";
  elements.adjacentAnchorOffsetValue.textContent = elements.adjacentAnchorOffset.value || "—";
  elements.adjacentPreview.classList.toggle("needs-anchor", mismatch && !bindingComplete);
  elements.adjacentBindingHint.hidden = !mismatch || bindingComplete;
  elements.createAdjacentButton.disabled = !validSizes || !bindingComplete;
  if (!validSizes) {
    elements.adjacentStatus.className = "message notice";
    elements.adjacentStatus.textContent = "Назовите размер красной стены.";
  } else if (!bindingComplete) {
    elements.adjacentStatus.className = "message error";
    elements.adjacentStatus.textContent = "Нужна привязка этой стены к двери.";
  } else {
    elements.adjacentStatus.className = "message notice";
    elements.adjacentStatus.textContent = "Комната привязана правильно.";
  }

  const previewWidth = first > 0 ? first : parentWall.length_m;
  const previewDepth = second > 0 ? second : Math.max(parentWall.length_m * 0.7, 1);
  const previewOffset = mismatch
    ? (Number.isFinite(childOffset) ? Math.max(0, Math.min(childOffset, previewWidth - opening.width_m)) : 0)
    : Math.max(0, previewWidth - opening.offset_m - opening.width_m);
  const preview = {
    walls: [
      { length_m: previewWidth, source: mismatch ? "measured" : "inherited_shared", id: "adjacent-preview-1" },
      { length_m: previewDepth, source: second > 0 ? "measured" : "unmeasured", id: "adjacent-preview-2" },
      { length_m: previewWidth, source: "inferred_opposite", id: "adjacent-preview-3" },
      { length_m: previewDepth, source: second > 0 ? "inferred_opposite" : "unmeasured", id: "adjacent-preview-4" },
    ],
    openings: previewWidth >= opening.width_m ? [{
      id: "adjacent-preview-opening",
      kind: opening.kind,
      wall_id: "adjacent-preview-1",
      offset_m: previewOffset,
      width_m: opening.width_m,
    }] : [],
  };
  const adjacentOptions = {
    roomIndex: pendingAdjacent.roomIndex,
    openingId: pendingAdjacent.openingId,
    name: elements.adjacentName.value || "Комната",
    firstLengthM: previewWidth,
    anchorCorner,
    anchorOffsetM: mismatch ? elements.adjacentAnchorOffset.value : 0,
  };
  if (shaped) adjacentOptions.shape = shapeInputFrom(pendingShape, previewWidth);
  else adjacentOptions.secondLengthM = previewDepth;
  let overview = null;
  let shapeProblem = "";
  try {
    overview = createAdjacentRoom(packageData, adjacentOptions);
  } catch (error) {
    // The anchor prompt already explains a missing door binding; a shape problem needs its own words.
    if (shaped && bindingComplete) shapeProblem = error instanceof Error ? error.message : String(error);
  }
  drawPlan(elements.adjacentOverviewCanvas, overview ?? packageData);
  let canvasRoom = preview;
  if (shaped) {
    canvasRoom = overview?.rooms?.[overview.rooms.length - 1] ?? null;
    if (!canvasRoom) {
      try {
        canvasRoom = shapePreviewRoom(shapeInputFrom(pendingShape, previewWidth));
      } catch (error) {
        shapeProblem ||= error instanceof Error ? error.message : String(error);
      }
    }
  }
  if (shapeProblem) {
    elements.adjacentStatus.className = "message error";
    elements.adjacentStatus.textContent = shapeProblem;
    elements.createAdjacentButton.disabled = true;
  }
  const activeWall = mismatch && !bindingComplete ? 0 : shaped ? null : second > 0 ? null : 1;
  elements.adjacentCanvas.previewRoom = canvasRoom;
  cancelAnimationFrame(adjacentPulseFrame);
  const draw = () => {
    drawRoom(
      elements.adjacentCanvas,
      canvasRoom,
      activeWall,
      activeWall !== null,
      ["adjacentFirstLength", "adjacentSecondLength"],
    );
    if (currentScreen === "adjacent" && activeWall !== null) adjacentPulseFrame = requestAnimationFrame(draw);
  };
  draw();
}function validationIssues(pkg) {
  const issues = [];
  try {
    validatePackage(pkg);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  for (const [roomIndex, room] of (pkg?.rooms ?? []).entries()) {
    for (const opening of room.openings ?? []) {
      if (!(opening.wall_thickness_m > 0)) {
        issues.push(`Помещение ${roomIndex + 1}: не указана толщина стены у ${typeName(opening.kind).toLowerCase()}.`);
      }
    }
  }
  return [...new Set(issues)];
}
function renderSummary() {
  if (!packageData?.rooms?.length) return;
  elements.summaryAddress.textContent = packageData.address;
  drawPlan(elements.planCanvas, packageData, planView);
  const issues = validationIssues(packageData);
  elements.validationPanel.classList.toggle("ready", issues.length === 0);
  elements.validationPanel.classList.toggle("needs-work", issues.length > 0);
  elements.validationTitle.textContent = issues.length
    ? `Нужно уточнить: ${issues.length}`
    : "Отличная работа! План готов без замечаний.";
  elements.validationList.replaceChildren();
  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = issue;
    elements.validationList.append(item);
  }
  elements.shareButton.disabled = issues.length > 0;
  if (!issues.length && celebratedRevision !== packageData.updated_at) {
    celebratedRevision = packageData.updated_at;
    if (navigator.vibrate) navigator.vibrate([55, 35, 85]);
  }
}function recordDate(record) {
  const value = record.package?.created_at ?? record.saved_at;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Дата не определена";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function currentDraftFromRecord(record) {
  return {
    version: 4,
    screen: "done",
    package: record.package,
    currentRoomIndex: 0,
    pendingAdjacent: null,
    editingOpeningId: null,
    openingPlacementActive: false,
    editingInteriorId: null,
    form: record.form ?? {},
  };
}

async function openSurveyRecord(record) {
  validatePackage(record.package);
  const draft = currentDraftFromRecord(record);
  await saveDraft(draft);
  restoreForm(draft);
  packageData = draft.package;
  currentRoomIndex = 0;
  pendingAdjacent = null;
  editingOpeningId = null;
  openingPlacementActive = false;
  editingInteriorId = null;
  elements.address.value = packageData.address;
  fillRoomForm(packageData.rooms[0]);
  showScreen("done");
  elements.saveStatus.textContent = "Открыт сохранённый объект";
}

async function renderSurveyCatalog() {
  const token = ++catalogRenderToken;
  const records = sortSurveyRecords(await listSurveys());
  if (token !== catalogRenderToken) return;
  elements.surveyCount.textContent = String(records.length);
  elements.surveyEmpty.hidden = records.length !== 0;
  elements.surveyList.replaceChildren();

  for (const record of records) {
    const row = document.createElement("div");
    row.className = "survey-card";
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = record.package.address;
    const details = document.createElement("span");
    details.textContent = recordDate(record) + " · комнат: " + record.package.rooms.length;
    text.append(title, details);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "secondary compact";
    open.textContent = "Открыть";
    open.addEventListener("click", () => openSurveyRecord(record).catch(showError));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger compact";
    remove.textContent = "Удалить";
    remove.addEventListener("click", async () => {
      if (!confirm(`Удалить сохранённый замер «${record.package.address}» с этого телефона?`)) return;
      try {
        await deleteSurvey(record.package.package_id);
        if (packageData?.package_id === record.package.package_id) {
          await clearDraft();
          packageData = null;
          currentRoomIndex = 0;
          pendingAdjacent = null;
          restoreForm(null);
        }
        await renderSurveyCatalog();
        elements.saveStatus.textContent = "Сохранённый объект удалён";
      } catch (error) {
        showError(error);
      }
    });
    actions.append(open, remove);
    row.append(text, actions);
    elements.surveyList.append(row);
  }

  const todayCount = surveysForLocalDay(records).length;
  elements.shareTodayButton.disabled = todayCount === 0;
  elements.shareTodayButton.textContent = todayCount
    ? `Поделиться за сегодня: ${todayCount} (ZIP)`
    : "Сегодняшних замеров для ZIP пока нет";
}

async function deliverFile(blob, name, title, text, successMessage) {
  const file = typeof File === "function"
    ? new File([blob], name, { type: blob.type })
    : null;
  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, text, files: [file] });
      elements.saveStatus.textContent = successMessage;
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  elements.saveStatus.textContent = successMessage;
}

async function shareTodaySurveys() {
  try {
    clearError();
    const entries = archiveEntriesForDay(await listSurveys());
    if (!entries.length) throw new Error("За сегодня нет сохранённых замеров.");
    const blob = new Blob([createStoredZip(entries)], { type: "application/zip" });
    await deliverFile(
      blob,
      archiveFileName(),
      "Полевые абрисы за сегодня",
      `Замеров: ${entries.length}`,
      "ZIP передан или сохранён; объекты остались на телефоне",
    );
  } catch (error) {
    if (error?.name !== "AbortError") showError(error);
  }
}
async function sharePackage() {
  try {
    clearError();
    validatePackage(packageData);
    const json = JSON.stringify(packageData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    await deliverFile(
      blob,
      fileNameFor(packageData),
      "Полевой абрис",
      packageData.address,
      "Файл передан или сохранён; объект остался на телефоне",
    );
  } catch (error) {
    if (error?.name !== "AbortError") showError(error);
  }
}
async function leaveCurrentForCatalog(message) {
  clearTimeout(saveTimer);
  if (packageData?.rooms?.length) await saveSurvey(draftValue());
  await clearDraft();
  packageData = null;
  currentRoomIndex = 0;
  pendingAdjacent = null;
  restoreForm(null);
  showScreen("start");
  elements.saveStatus.textContent = message;
}

elements.address.addEventListener("input", () => {
  syncHeaderTitle();
  elements.startButton.disabled = !elements.address.value.trim();
  schedulePersist();
});
for (const input of [elements.roomName, elements.firstLength, elements.secondLength, elements.wallThickness]) {
  input.addEventListener("input", () => {
    if (input === elements.wallThickness) {
      elements.wallThicknessValue.textContent = input.value || "—";
      if (currentScreen === "openings") {
        const room = packageData?.rooms?.[currentRoomIndex];
        const missing = latestOpeningWithoutThickness(room);
        if (missing && decimal(input.value) > 0) {
          packageData = setOpeningWallThickness(packageData, currentRoomIndex, missing.id, input.value);
          renderOpenings();
        }
      }
    }
    if (input === elements.firstLength && decimal(input.value) > 0 && !(decimal(elements.secondLength.value) > 0)) activeRoomWall = 1;
    if (input === elements.secondLength && decimal(input.value) > 0 && !(decimal(elements.firstLength.value) > 0)) activeRoomWall = 0;
    if (decimal(elements.firstLength.value) > 0 && decimal(elements.secondLength.value) > 0) activeRoomWall = null;
    renderRoomInput();
    refreshVoiceTarget();
    schedulePersist();
  });
}
for (const input of [elements.openingWall, elements.openingOffset, elements.openingWidth]) {
  input.addEventListener("input", () => {
    if (input === elements.openingOffset) openingOffsetTouched = true;
    else centerOpeningOffset();
    openingPlacementActive = true;
    renderOpenings();
    schedulePersist();
  });
}
for (const input of [
  elements.interiorWall, elements.interiorOffset, elements.interiorInset,
  elements.interiorWidth, elements.interiorDepth, elements.interiorName,
  elements.interiorPartition, elements.interiorDoorWidth, elements.interiorDoorWall,
]) {
  input.addEventListener("input", () => {
    if (currentScreen === "interior") renderInteriors();
    schedulePersist();
  });
}
for (const input of [
  elements.adjacentName,
  elements.adjacentFirstLength,
  elements.adjacentSecondLength,
  elements.adjacentAnchorCorner,
  elements.adjacentAnchorOffset,
]) {
  input.addEventListener("input", () => {
    if (currentScreen === "adjacent") renderAdjacent();
    schedulePersist();
  });
}
for (const button of kindButtons) button.addEventListener("click", () => {
  openingPlacementActive = true;
  setKind(button.dataset.kind);
});
for (const button of interiorKindButtons) button.addEventListener("click", () => {
  setInteriorKind(button.dataset.interiorKind);
});

elements.startButton.addEventListener("click", async () => {
  try {
    packageData = createPackage(elements.address.value);
    currentRoomIndex = 0;
    pendingAdjacent = null;
    pendingShape = null;
    shapeState = newShapeState("first", elements.roomName.value || "Прихожая");
    editingOpeningId = null;
    openingPlacementActive = false;
    showScreen("room");
    await persist();
    elements.firstLength.focus();
  } catch (error) {
    showError(error);
  }
});
elements.backButton.addEventListener("click", () => {
  showScreen("start");
  persist();
});
function confirmFirstRoomReplacement() {
  const hasMeasuredWork = packageData.rooms.length > 1 || packageData.rooms[0]?.openings?.length ||
    packageData.rooms[0]?.interiors?.length;
  return !hasMeasuredWork ||
    confirm("Изменение первой комнаты удалит её проёмы и все связанные комнаты. Продолжить?");
}
async function saveFirstRoom(room) {
  packageData.rooms = [room];
  packageData.connections = [];
  packageData.address = elements.address.value.trim();
  packageData.updated_at = new Date().toISOString();
  currentRoomIndex = 0;
  pendingAdjacent = null;
  pendingShape = null;
  validatePackage(packageData);
  showScreen("openings");
  await persist();
}
elements.saveRoomButton.addEventListener("click", async () => {
  try {
    if (!confirmFirstRoomReplacement()) return;
    await saveFirstRoom(createRectangleRoom({
      name: elements.roomName.value,
      firstLengthM: elements.firstLength.value,
      secondLengthM: elements.secondLength.value,
      wallThicknessM: elements.wallThickness.value,
    }));
  } catch (error) {
    showError(error);
  }
});
elements.openingsBackButton.addEventListener("click", () => {
  clearOpeningEdit();
  if (currentRoomIndex === 0 && packageData.rooms.length === 1) {
    if (isPolygonRoom(packageData.rooms[0])) openShape("first");
    else showScreen("room");
  } else {
    showScreen("done");
  }
  persist();
});
elements.addOpeningButton.addEventListener("click", async () => {
  try {
    packageData = editingOpeningId
      ? updateOpeningInPackage(packageData, currentRoomIndex, editingOpeningId, openingFormValues())
      : addOpeningToPackage(packageData, currentRoomIndex, openingFormValues());
    clearOpeningEdit();
    renderOpenings();
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.openingCancelEditButton.addEventListener("click", () => {
  clearOpeningEdit();
  renderOpenings();
  schedulePersist();
});
elements.interiorsButton.addEventListener("click", () => {
  clearOpeningEdit();
  clearInteriorEdit();
  showScreen("interior");
});
elements.interiorBackButton.addEventListener("click", () => {
  clearInteriorEdit();
  showScreen("openings");
  persist();
});
elements.interiorDoneButton.addEventListener("click", () => {
  clearInteriorEdit();
  showScreen("openings");
  persist();
});
elements.interiorCancelEditButton.addEventListener("click", () => {
  clearInteriorEdit();
  renderInteriors();
  schedulePersist();
});
elements.addInteriorButton.addEventListener("click", async () => {
  try {
    packageData = editingInteriorId
      ? updateInteriorInPackage(packageData, currentRoomIndex, editingInteriorId, interiorFormValues())
      : addInteriorToPackage(packageData, currentRoomIndex, interiorFormValues());
    clearInteriorEdit();
    renderInteriors();
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.finishButton.addEventListener("click", async () => {
  try {
    clearOpeningEdit();
    const missingThickness = packageData.rooms.some((room) => latestOpeningWithoutThickness(room));
    if (missingThickness) throw new Error("Укажите толщину стены для каждого проёма.");
    validatePackage(packageData);
    pendingAdjacent = null;
    showScreen("done");
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.adjacentBackButton.addEventListener("click", () => {
  currentRoomIndex = pendingAdjacent?.roomIndex ?? currentRoomIndex;
  pendingAdjacent = null;
  pendingShape = null;
  showScreen("openings");
  persist();
});
elements.createAdjacentButton.addEventListener("click", async () => {
  try {
    packageData = createAdjacentRoom(packageData, {
      roomIndex: pendingAdjacent?.roomIndex,
      openingId: pendingAdjacent?.openingId,
      name: elements.adjacentName.value,
      firstLengthM: elements.adjacentFirstLength.value,
      secondLengthM: elements.adjacentSecondLength.value,
      anchorCorner: elements.adjacentAnchorCorner.value,
      anchorOffsetM: elements.adjacentAnchorOffset.value,
      shape: pendingShape ? shapeInputFrom(pendingShape, decimal(elements.adjacentFirstLength.value)) : null,
    });
    currentRoomIndex = packageData.rooms.length - 1;
    pendingAdjacent = null;
    pendingShape = null;
    editingOpeningId = null;
    openingPlacementActive = false;
    openingOffsetTouched = false;
    elements.openingWall.value = "1";
    elements.openingOffset.value = "0";
    showScreen("openings");
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.shapeButton.addEventListener("click", () => openShape("first"));
elements.adjacentShapeButton.addEventListener("click", () => openShape("adjacent"));
elements.shapeBackButton.addEventListener("click", () => {
  if (shapeState.context === "adjacent") showScreen("adjacent");
  else showScreen(packageData?.rooms?.length ? "openings" : "room");
  persist();
});
elements.shapeFewerButton.addEventListener("click", () => {
  shapeState.count = Math.max(3, shapeState.count - 1);
  shapeState.active = null;
  renderShape();
  schedulePersist();
});
elements.shapeMoreButton.addEventListener("click", () => {
  shapeState.count = Math.min(MAX_SHAPE_UI_WALLS, shapeState.count + 1);
  shapeState.active = null;
  renderShape();
  schedulePersist();
});
elements.shapeMirrorButton.addEventListener("click", () => {
  shapeState.clockwise = !shapeState.clockwise;
  renderShape();
  schedulePersist();
});
elements.shapeResetButton.addEventListener("click", () => {
  pendingShape = null;
  showScreen("adjacent");
  persist();
});
elements.shapeDoneButton.addEventListener("click", async () => {
  try {
    const solution = shapeSolution();
    if (!solution.outline) throw new Error(solution.error ?? "Введите все размеры.");
    if (shapeState.context === "adjacent") {
      if (shapeState.name.trim()) elements.adjacentName.value = shapeState.name.trim();
      const { count, walls, angles, clockwise, name } = shapeState;
      pendingShape = structuredClone({ count, walls, angles, clockwise, name });
      showScreen("adjacent");
      await persist();
      return;
    }
    if (!confirmFirstRoomReplacement()) return;
    const room = createPolygonRoom({
      ...shapeSolverInput(),
      name: shapeState.name,
      wallThicknessM: shapeState.thickness,
    });
    elements.roomName.value = room.name;
    elements.wallThickness.value = shapeState.thickness;
    elements.wallThicknessValue.textContent = shapeState.thickness || "—";
    await saveFirstRoom(room);
  } catch (error) {
    showError(error);
  }
});
elements.shapeCanvas.addEventListener("click", (event) => {
  const bounds = elements.shapeCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.shapeCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.shapeCanvas.height / bounds.height;
  let best = null;
  let bestDistance = 44;
  for (const hit of elements.shapeCanvas.shapeHits ?? []) {
    const distance = distanceToCanvasSegment(x, y, hit.a, hit.b);
    if (distance < bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  const input = best ? document.getElementById("shape-" + best.key) : null;
  if (!input || input.readOnly) return;
  shapeState.active = best.key;
  renderShape();
  selectVoiceTarget(input, input.dataset.voiceMode, input.dataset.voiceLabel);
  startContextVoice();
});
elements.editButton.addEventListener("click", () => {
  fillRoomForm(packageData?.rooms?.[0]);
  if (isPolygonRoom(packageData?.rooms?.[0])) openShape("first");
  else showScreen("room");
});
elements.editOpeningsButton.addEventListener("click", () => {
  currentRoomIndex = 0;
  clearOpeningEdit();
  showScreen("openings");
});
elements.shareButton.addEventListener("click", sharePackage);
elements.shareTodayButton.addEventListener("click", shareTodaySurveys);
elements.objectListButton.addEventListener("click", () => {
  leaveCurrentForCatalog("Объект сохранён; открыт список замеров").catch(showError);
});
elements.newButton.addEventListener("click", () => {
  leaveCurrentForCatalog("Предыдущий объект сохранён; можно начинать новый замер")
    .then(() => elements.address.focus())
    .catch(showError);
});
elements.roomCanvas.addEventListener("click", (event) => {
  const room = previewRoom();
  const bounds = elements.roomCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.roomCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.roomCanvas.height / bounds.height;
  const dimension = (elements.roomCanvas.dimensionHitboxes ?? []).find((box) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  );
  if (dimension) {
    selectVoiceTargetById(dimension.inputId);
    const input = elements[dimension.inputId];
    input.focus({ preventScroll: true });
    input.select();
    return;
  }
  const box = roomBox(elements.roomCanvas, room);
  const distances = [
    Math.abs(y - box.bottom),
    Math.abs(x - box.right),
    Math.abs(y - box.top),
    Math.abs(x - box.left),
  ];
  const wallIndex = distances.indexOf(Math.min(...distances));
  activeRoomWall = wallIndex;
  renderRoomInput();
  selectVoiceTargetById(wallIndex % 2 === 0 ? "firstLength" : "secondLength");
  startContextVoice();
});
elements.adjacentCanvas.addEventListener("click", (event) => {
  const room = elements.adjacentCanvas.previewRoom;
  if (!room) return;
  const bounds = elements.adjacentCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.adjacentCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.adjacentCanvas.height / bounds.height;
  const dimension = (elements.adjacentCanvas.dimensionHitboxes ?? []).find((box) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  );
  if (dimension) {
    selectVoiceTargetById(dimension.inputId);
    const input = elements[dimension.inputId];
    input.focus({ preventScroll: true });
    input.select();
    return;
  }
  const wallIndex = nearestWallIndex(elements.adjacentCanvas, room, x, y);
  if (isPolygonRoom(room)) {
    if (wallIndex === 0) {
      selectVoiceTargetById("adjacentFirstLength");
      startContextVoice();
    } else {
      openShape("adjacent");
    }
    return;
  }
  selectVoiceTargetById(wallIndex % 2 === 0 ? "adjacentFirstLength" : "adjacentSecondLength");
  startContextVoice();
});elements.openingCanvas.addEventListener("click", (event) => {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const bounds = elements.openingCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.openingCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.openingCanvas.height / bounds.height;
  const wallIndex = nearestWallIndex(elements.openingCanvas, room, x, y);
  elements.openingWall.value = String(wallIndex);
  openingOffsetTouched = false;
  centerOpeningOffset();
  openingPlacementActive = true;
  renderOpenings();
  selectVoiceTargetById("openingOffset");
  startContextVoice();
  schedulePersist();
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.installButton.hidden = false;
});
elements.installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  elements.installButton.hidden = true;
});

async function start() {
  try {
    const draft = await loadDraft();
    restoreForm(draft);
    packageData = draft?.package ?? null;
    if (packageData?.rooms?.length) {
      await saveSurvey({ ...draft, version: 4 });
    }
    if (packageData?.rooms?.length) {
      currentRoomIndex = Math.min(Math.max(currentRoomIndex, 0), packageData.rooms.length - 1);
      fillRoomForm(packageData.rooms[0]);
      const restoredScreen = ["openings", "interior", "adjacent", "shape", "done"].includes(draft.screen)
        ? draft.screen
        : "done";
      const needsAdjacent = restoredScreen === "adjacent" ||
        (restoredScreen === "shape" && shapeState.context === "adjacent");
      if (needsAdjacent && !pendingAdjacent) {
        showScreen("openings");
      } else {
        showScreen(restoredScreen);
      }
    } else if (packageData) {
      showScreen(draft?.screen === "shape" && shapeState.context === "first" ? "shape" : "room");
    } else {
      showScreen("start");
    }
  } catch {
    restoreForm(null);
    showScreen("start");
    showError(new Error("Локальное хранилище недоступно. Проверьте настройки браузера."));
  }
  recordHistory();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      elements.saveStatus.textContent = "Офлайн-режим станет доступен после установки приложения";
    });
  }
}
initializeUi();
installVoiceInputs();
start();
