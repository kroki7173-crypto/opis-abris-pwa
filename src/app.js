import {
  MAX_SHAPE_WALLS,
  OPENING_PRESETS,
  addBalconyToPackage,
  addInteriorToPackage,
  addOpeningToPackage,
  balconyForOpening,
  balconyPoints,
  connectionForOpening,
  connectionsForWall,
  createAdjacentRoom,
  createInterior,
  createPackage,
  createPolygonRoom,
  createRectangleRoom,
  cornerName,
  fileNameFor,
  inferPartitionThickness,
  interiorPoints,
  isPolygonRoom,
  planProblems,
  removeBalconyFromPackage,
  removeInteriorFromPackage,
  removeOpeningFromPackage,
  removeRoomFromPackage,
  roomsBehind,
  setCeilingHeight,
  roomInteriorAngles,
  roomOuterPolygon,
  roomPoints,
  roomAcrossOpening,
  setCornerAngle,
  setOpeningWallThickness,
  setWallThickness,
  setWallLength,
  solveOutline,
  updateBalconyInPackage,
  updateInteriorInPackage,
  updateOpeningInPackage,
  validatePackage,
  wallThickness,
  withExplicitWallThickness,
} from "./model.js";
import {
  clearDraft,
  deleteSurvey,
  listSurveys,
  loadDraft,
  loadHistory,
  saveDraft,
  saveHistory,
  saveSurvey,
} from "./storage.js";
import {
  archiveEntriesForDay,
  archiveFileName,
  hasRemarks,
  sortSurveyRecords,
  surveysForLocalDay,
} from "./catalog.js";
import { createStoredZip } from "./zip.js";
import { addressLesson, createVoiceController, spokenAddress, spokenBalcony, spokenMeasurement } from "./voice.js";

const ids = [
  "startScreen", "roomScreen", "openingsScreen", "interiorScreen", "adjacentScreen", "shapeScreen", "doneScreen",
  "shapeFewerButton", "shapeMoreButton", "shapeCount", "shapeCanvas",
  "shapeCaption", "shapeFields", "shapeStatus", "shapeDoneButton", "shapeResetButton", "shapeMirrorButton",
  "adjacentShapeButton", "adjacentShapeNote",
  "address", "roomName", "firstLength", "secondLength", "wallThickness", "startButton", "rememberAddressButton", "addressNewButton",
  "surveyCount", "surveyEmpty", "surveyList", "shareTodayButton",
  "openingCanvas", "openingOverviewCanvas", "openingWall", "openingOffset",
  "openingWidth", "widthPresets", "addOpeningButton", "openingCancelEditButton", "openingList",
  "openingEditPanel", "openingOffsetButton", "openingOffsetValue", "openingCornerName", "openingWidthButton", "openingWidthValue",
  "openingThicknessPrompt", "openingThicknessText", "wallLengthPrompt", "wallLengthText",
  "interiorCanvas", "interiorWall",
  "interiorOffset", "interiorInset", "interiorWidth", "interiorDepth", "interiorName",
  "interiorPartition", "interiorDoorWidth", "interiorDoorWall", "storageFields",
  "addInteriorButton", "interiorCancelEditButton", "interiorList", "interiorDoneButton",
  "finishButton", "openingsRoomName", "wallLockHint", "adjacentFrom", "adjacentName",
  "adjacentFirstLength", "adjacentSecondLength", "adjacentCanvas", "adjacentOverviewCanvas", "adjacentPreview",
  "adjacentStatus", "adjacentBindingHint", "adjacentAnchorPanel", "adjacentAnchorLead",
  "adjacentAnchorCorner", "adjacentAnchorOffset",
  "adjacentAnchorCornerButton", "adjacentAnchorCornerValue", "adjacentAnchorOffsetButton", "adjacentAnchorOffsetValue",
  "createAdjacentButton", "shareButton", "editButton",
  "newSurveyButton", "newButton", "doorAnchor", "thicknessChip", "interiorAskChip", "roomTip", "roomCanvas", "planCanvas", "saveStatus",
  "errorMessage", "undoToast", "voiceStatus", "voiceStatusText", "voiceTarget", "voiceStopButton",
  "contextMicButton", "headerTitle", "themeToggle", "themeColor", "undoButton", "redoButton",

  "settingsScreen", "helpScreen", "darkThemeSetting", "showThemeControl", "hintsSetting", "hintCard", "hintText",
  "measureNavButton", "objectsNavButton", "settingsNavButton", "helpNavButton",
  "summaryAddress", "roomSummary", "validationPanel", "validationTitle", "validationList", "installButton",
  "issuesReturnButton", "wallFixBar", "wallFixLabel", "wallFixInput", "removeRoomButton", "summaryHeight",
  "adjacentBalconyButton", "balconySize", "balconyActions", "balconyPrompt", "balconyText", "balconyRemoveButton",
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const kindButtons = [...document.querySelectorAll("[data-kind]")];
const interiorKindButtons = [...document.querySelectorAll("[data-interior-kind]")];
const VOICE_FIELDS = [
  ["address", "address", "адрес"],
  ["roomName", "text", "название комнаты"],
  ["firstLength", "measurement", "размер первой стены"],
  ["secondLength", "measurement", "размер соседней стены"],
  ["wallThickness", "thickness", "толщину стены"],
  ["doorAnchor", "measurement", "расстояние от двери до стены"],
  ["openingOffset", "measurement", "расстояние до проёма"],
  ["openingWidth", "width", "ширину проёма"],
  ["adjacentName", "text", "название следующей комнаты"],
  ["adjacentFirstLength", "measurement", "первую стену следующей комнаты"],
  ["adjacentSecondLength", "text", "размер комнаты: стена с дверью на следующую стену"],
  ["adjacentAnchorOffset", "measurement", "привязку двери от угла"],
  ["interiorName", "text", "название кладовки"],
  ["interiorOffset", "measurement", "отступ вдоль стены"],
  ["interiorInset", "measurement", "отступ внутрь комнаты"],
  ["interiorWidth", "measurement", "ширину внутреннего объекта"],
  ["interiorDepth", "measurement", "глубину внутреннего объекта"],
  ["interiorPartition", "thickness", "толщину перегородки"],
  ["interiorDoorWidth", "width", "ширину двери кладовки"],
  ["balconySize", "text", "размер балкона: «метр на два»"],
];
const voiceController = createVoiceController(window, setVoiceStatus);

let packageData = null;
let currentScreen = "start";
// The screen where the measuring stopped: "Главная" returns there after "Объекты" or "Настройки"
// (Bolat, 05.10.2026), never to the final plan unless the technician finished with "Готово".
const WORK_SCREENS = ["room", "openings", "interior", "adjacent", "shape", "done"];
let workScreen = null;
// Plan state confirmed with "Готово"; "Отличная работа" is shown only for exactly that plan.
let confirmedPlan = null;
// The remarks as they were at "Закончить замер" ({ key, text }): a fixed one stays in the list struck through
// (Bolat, 06.10.2026). null until the survey was finished once.
let issueBaseline = null;
// A remark led to another screen: a button there returns to the remarks.
let returnToIssues = false;
function planSignature(pkg) {
  return JSON.stringify([pkg?.rooms ?? [], pkg?.connections ?? []]);
}
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
let interiorPulseFrame = null;
let openingPlacementActive = false;
// Doors and windows go the same way as the entrance (Bolat, 05.10.2026): tap the wall -> say what is in it
// (door, window, passage) -> it appears in the middle -> the wall pieces beside it blink in turn -> tap one and name
// the distance from the corner -> a door or passage asks the wall thickness and then opens the room behind it.
// { step: "kind", wallIndex } | { step: "side", id, side } | { step: "thickness", id }
let openingStep = null;
// «Дверь», «Окно», «Проём» or «Балкон» pressed before a wall: the next tap on a wall places it there.
let armedKind = null;
// Which corner each opening was measured from ({ id: "start" | "end" }): the list shows the distance from that one.
// Kept in the draft on the phone only; the measurement file does not carry it.
let openingAnchors = {};
// The balcony of a door on the doors screen (Bolat, 08.10.2026): { openingId, asking } — asking: its size is being said.
let balconyStep = null;
const OPENING_DEFAULT_WIDTH = { door: 0.8, window: 1.3, passage: 0.9, balcony: 0.8 };
const OPENING_GENITIVE = { door: "двери", window: "окна", passage: "проёма", balcony: "балкона" };
// How far from the wall of the opening being placed a tap still counts as that wall (canvas points, about a finger).
const ASKED_WALL_REACH = 40;
// A new opening is centred on its wall until the technician types or dictates a distance.
let openingOffsetTouched = false;
let planView = { zoom: 1, x: 0, y: 0 };
// "Объекты" is highlighted only when the technician asked for the list; the start screen reached otherwise is "Главная".
// The first room starts with this thickness; the technician names the real one at the first door or window.
const PROVISIONAL_WALL_THICKNESS = "0,1";
// The start screen has two faces: "new" (address entry, tab "Главная") and "list" (saved objects, tab "Объекты").
let startMode = "new";
// First-room guide (Bolat, 05.10.2026): the entrance door comes first. Tap the blinking wall -> the door appears;
// the walls left and right of the door blink in turn -> tap one and name the distance from it to the door ->
// "Толщина ?" -> the door wall, then the next one.
const ENTRANCE_WIDTH_M = 0.8;
function newEntrance() {
  return { step: "wall", wall: 0, side: null, anchor: null, thickness: null };
}
function restoreEntrance(value) {
  const steps = ["wall", "anchor", "thickness", "measure"];
  if (!value || !steps.includes(value.step) || !Number.isInteger(value.wall) || value.wall < 0 || value.wall > 3) return newEntrance();
  const side = ["start", "end"].includes(value.side) ? value.side : null;
  return {
    step: value.step,
    wall: value.wall,
    // Drafts from before the side choice measured the distance to the wall at the end corner.
    side: side ?? (Number.isFinite(value.anchor) ? "end" : null),
    anchor: Number.isFinite(value.anchor) ? value.anchor : null,
    thickness: value.thickness ? String(value.thickness) : null,
  };
}
// Offset of the entrance door from the start corner of its wall, or null while it cannot be known.
function entranceOffset(wallLength) {
  if (entrance.anchor === null || !entrance.side) return null;
  return entrance.side === "start" ? entrance.anchor : wallLength - entrance.anchor - ENTRANCE_WIDTH_M;
}
let entrance = newEntrance();
let thicknessChipTimer = null;
// Tapping the wall opposite an already measured one and giving another size means the room is not a rectangle.
let roomOppositeTap = null;
// The same for the room behind a door: the wall opposite the door named different opens the shape screen.
let adjacentOppositeTap = null;
let celebratedRevision = null;

function showError(error) {
  elements.errorMessage.textContent = error instanceof Error ? error.message : String(error);
  elements.errorMessage.hidden = false;
  elements.errorMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
// An unexpected failure must be visible on the phone, not leave the screen silently dead.
window.addEventListener("error", (event) => showError("Ошибка приложения: " + (event.message || "неизвестная")));
window.addEventListener("unhandledrejection", (event) => showError("Ошибка приложения: " + (event.reason?.message ?? event.reason)));
function clearError() {
  elements.errorMessage.hidden = true;
  elements.errorMessage.textContent = "";
}
const SAVE_FAILED = "Не удалось сохранить черновик — не закрывайте страницу";
// Routine "saved on this device" notes are noise; only a failed save is worth the technician's attention.
function setSaveStatus(text) {
  elements.saveStatus.textContent = text;
  elements.saveStatus.hidden = text !== SAVE_FAILED;
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
    if (entrance.step === "anchor") return "doorAnchor";
    if (entrance.step === "thickness") return "wallThickness";
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
    elements.contextMicButton.hidden = !voiceController.capability().available;
    selectShapeVoiceTarget();
    return;
  }
  const id = defaultVoiceTargetForScreen();
  elements.contextMicButton.hidden = ["done", "settings", "help"].includes(currentScreen) || !voiceController.capability().available;
  if (id) selectVoiceTargetById(id);
}

async function startContextVoice() {
  if (!activeVoiceTarget || voiceListening) return;
  const capability = voiceController.capability();
  if (!capability.available) {
    // No on-device speech here (e.g. iPhone): no alarming panel, just the keyboard on the field.
    activeVoiceTarget.input.focus();
    return;
  }
  const { input, mode, label } = activeVoiceTarget;
  elements.contextMicButton.disabled = true;
  try {
    await voiceController.listen({
      mode,
      timeoutMs: 8000,
      addressLessons: mode === "address" ? addressLessons() : null,
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
      onValue(value, transcript) {
        input.value = value;
        if (input === elements.address) {
          // Remembered so a hand correction of what was heard can be learned ("Запомнить исправление").
          addressDictation = { transcript, value };
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (input.dataset.shapeKey) advanceShapeTarget();
        if (input === elements.openingOffset && openingPlacementActive) {
          setTimeout(() => elements.addOpeningButton.click(), 0);
        }
        // A thickness on the doors screen is applied by the "change" handler of wallThickness, once.
        if (navigator.vibrate) navigator.vibrate(35);
      },
    });
  } catch {
    // Голосовая ошибка уже показана в общей плашке; ручной ввод остаётся доступным. The balcony size has its own
    // field in place of the red button: without a microphone it is shown to type into (Codex walk 08.10.2026).
    if (input === elements.balconySize && currentScreen === "openings") {
      elements.balconyPrompt.hidden = true;
      elements.balconySize.hidden = false;
      elements.balconySize.focus();
    }
  } finally {
    voiceListening = false;
    elements.contextMicButton.disabled = !voiceController.capability().available;
    elements.voiceStatus.classList.remove("listening");
    // Whatever ended the listening, a calm panel never stays on the screen.
    if (!elements.voiceStatus.hidden && !elements.voiceStatus.classList.contains("is-error")) {
      clearTimeout(voicePanelTimer);
      voicePanelTimer = setTimeout(() => { elements.voiceStatus.hidden = true; }, 2800);
    }
  }
}

function stopContextVoice() {
  voiceController.stop();
  voiceListening = false;
  elements.contextMicButton.disabled = !voiceController.capability().available;
  // Stopped by hand: the panel simply goes away, there is nothing left to press.
  setVoiceStatus("");
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

// Street names the technician corrected after dictation: heard street -> written street. Only streets, no house
// or flat numbers, and they never leave the phone.
const ADDRESS_LESSONS_KEY = "opis-pwa-address-lessons";
let addressDictation = null;
function addressLessons() {
  try { return JSON.parse(localStorage.getItem(ADDRESS_LESSONS_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function rememberAddressCorrection() {
  const lesson = addressDictation ? addressLesson(addressDictation.transcript, elements.address.value) : null;
  elements.rememberAddressButton.hidden = true;
  if (!lesson) return;
  const lessons = addressLessons();
  lessons[lesson.key] = lesson.street;
  storeValue(ADDRESS_LESSONS_KEY, JSON.stringify(lessons));
  addressDictation = null;
  setVoiceStatus(`Запомнил: «${lesson.key}» — это «${lesson.street}».`);
}
function syncRememberAddress() {
  const changed = addressDictation && elements.address.value.trim() !== addressDictation.value.trim();
  elements.rememberAddressButton.hidden = !(changed && addressLesson(addressDictation.transcript, elements.address.value));
}
// Step 1 serves a new object ("Начать") and a change of the current object's address ("Сохранить адрес").
function editingAddress() {
  return Boolean(packageData && String(packageData.address ?? "").trim());
}
function syncAddressStep() {
  elements.startButton.textContent = editingAddress() ? "Сохранить адрес" : "Начать";
  elements.addressNewButton.hidden = !editingAddress();
  elements.startButton.disabled = !elements.address.value.trim();
  syncRememberAddress();
}
function resumeWork() {
  const rooms = packageData?.rooms?.length ?? 0;
  let screen = WORK_SCREENS.includes(workScreen) ? workScreen : rooms ? "openings" : "room";
  if (!rooms && ["openings", "interior", "adjacent", "done"].includes(screen)) screen = "room";
  // The room behind a door and its shape screen need the door they start from; without it, back to the doors.
  const needsAdjacent = screen === "adjacent" || (screen === "shape" && shapeState.context === "adjacent");
  if (needsAdjacent && !pendingAdjacent) screen = rooms ? "openings" : "room";
  showScreen(screen);
  // A room behind a door measured before (e.g. in a version that still had the "войти" button) is created
  // on return instead of leaving the technician on a screen with nothing to press.
  if (screen === "adjacent") setTimeout(maybeCreateAdjacent, 0);
}
// Step 1 opens calm, with the hint and the field in view; the keyboard comes only when the technician
// taps the field or asked to change the address (`focus`).
function openAddressStep(focus = false) {
  startMode = "new";
  if (editingAddress()) elements.address.value = packageData.address;
  showScreen("start");
  if (focus) elements.address.focus();
}
// iPhone pushes the page up when the keyboard opens and the hint slides under the status bar;
// once the keyboard is out, the page goes back to the top.
elements.address.addEventListener("focus", () => {
  for (const delay of [60, 350]) setTimeout(() => window.scrollTo(0, 0), delay);
});

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

// The history belongs to the object it was written for: after "Новый замер" or another object opened, and before the
// first record of the new one, neither arrow may bring the previous object back.
function historyUsable() {
  return historyCursor >= 0 && historyObject(historyEntries[historyCursor]?.value) === (packageData?.package_id ?? null);
}
function updateHistoryButtons() {
  const usable = historyUsable();
  elements.undoButton.disabled = !usable || historyCursor <= 0;
  elements.redoButton.disabled = !usable || historyCursor >= historyEntries.length - 1;
}
// ↶ is an eraser for what was written down (Bolat, 08.10.2026: it jumped between screens and needed several presses
// for one wrong number). Only the record counts: the plan, the first room's steps and sizes, the shape being drawn.
// Screens, the selected wall and the step being asked are not an action; they are kept with the record they belong to,
// so ↶ comes back exactly where the undone number was said, and asks it again.
function historyRecord(value) {
  const shape = value.shape ? { count: value.shape.count, walls: value.shape.walls, angles: value.shape.angles,
    clockwise: value.shape.clockwise, thickness: value.shape.thickness } : null;
  const form = value.form ?? {};
  return JSON.stringify({
    package: value.package, entrance: value.entrance, shape, pendingShape: value.pendingShape,
    openingAnchors: value.openingAnchors,
    sizes: [form.address, form.roomName, form.firstLength, form.secondLength, form.wallThickness],
  });
}
function historyObject(value) {
  return value?.package?.package_id ?? null;
}
function recordHistory(value = draftValue()) {
  if (historyRestoring) return;
  // ↶ undoes within one object: another object opened (or a new one started) begins its own history.
  if (historyCursor >= 0 && historyObject(historyEntries[historyCursor]?.value) !== historyObject(value)) {
    historyEntries = [];
    historyCursor = -1;
  }
  const record = historyRecord(value);
  if (historyCursor >= 0 && historyEntries[historyCursor]?.record === record) {
    // The same record seen from another screen or step: the entry keeps the latest view of it.
    historyEntries[historyCursor].value = structuredClone(value);
    return;
  }
  historyEntries = historyEntries.slice(0, historyCursor + 1);
  historyEntries.push({ record, value: structuredClone(value) });
  if (historyEntries.length > 50) historyEntries.shift();
  historyCursor = historyEntries.length - 1;
  updateHistoryButtons();
}
// The last steps around the cursor are kept on the phone with the draft: after the app is closed and opened again,
// ↶ still erases what was written last (Codex walk 08.10.2026). A short window: the whole draft is in every step.
const HISTORY_KEPT_BACK = 12;
const HISTORY_KEPT_AHEAD = 3;
function storeHistory() {
  if (historyCursor < 0) return;
  const start = Math.max(0, historyCursor - HISTORY_KEPT_BACK);
  const entries = historyEntries.slice(start, historyCursor + 1 + HISTORY_KEPT_AHEAD).map((entry) => entry.value);
  saveHistory({ version: 1, cursor: historyCursor - start, entries }).catch(() => {
    // Only ↶ after a restart depends on it; the draft itself is saved separately.
  });
}
function restoreHistory(saved, draft) {
  const entries = Array.isArray(saved?.entries) ? saved.entries : [];
  const cursor = saved?.cursor;
  const object = historyObject(draft);
  if (!object || !Number.isInteger(cursor) || cursor < 0 || cursor >= entries.length ||
      entries.some((value) => historyObject(value) !== object)) return;
  historyEntries = entries.map((value) => ({ record: historyRecord(value), value }));
  historyCursor = cursor;
  updateHistoryButtons();
}
const WALL_WORDS = { door: "двери", window: "окна", passage: "проёма" };
// The corner (B and on: A follows from the others) whose angle differs between two states of one room, or -1.
function changedCorner(old, room) {
  if (!old || old.walls.length !== room.walls.length) return -1;
  const before = roomInteriorAngles(old);
  return roomInteriorAngles(room).findIndex((angle, corner) => corner > 0 && Math.abs(angle - before[corner]) > 1e-6);
}
// What ↶ or ↷ changed, in the technician's words: "расстояние до двери", "комната «Кухня»".
function describeChange(from, to) {
  const before = from?.package?.rooms ?? [];
  const after = to?.package?.rooms ?? [];
  if (before.length !== after.length) {
    const longer = before.length > after.length ? before : after;
    const shorter = before.length > after.length ? after : before;
    const room = longer.find((item) => !shorter.some((other) => other.id === item.id));
    return room ? `комната «${room.name}»` : "комната";
  }
  for (const [index, room] of after.entries()) {
    const old = before[index];
    if (!old) continue;
    if (old.openings.length !== room.openings.length) {
      const longer = old.openings.length > room.openings.length ? old.openings : room.openings;
      const shorter = longer === old.openings ? room.openings : old.openings;
      const opening = longer.find((item) => !shorter.some((other) => other.id === item.id));
      return opening ? { door: "дверь", window: "окно", passage: "проём" }[opening.kind] ?? "проём" : "проём";
    }
    // A corner first: a new angle also works out the last two walls again.
    const corner = changedCorner(old, room);
    if (corner > 0) return `угол ${cornerName(corner)}`;
    // A wall then: its new length also moves the openings measured from its far corner.
    if (room.walls.some((wall, wallIndex) => Math.abs(wall.length_m - (old.walls[wallIndex]?.length_m ?? 0)) > 1e-9)) {
      return "длина стены";
    }
    for (const opening of room.openings) {
      const was = old.openings.find((item) => item.id === opening.id);
      if (!was) continue;
      const of = WALL_WORDS[opening.kind] ?? "проёма";
      if (was.kind !== opening.kind) return `вид проёма`;
      if (Math.abs(was.width_m - opening.width_m) > 1e-9) return `ширина ${of}`;
      if (Math.abs(was.offset_m - opening.offset_m) > 1e-9 || was.wall_id !== opening.wall_id) return `расстояние до ${of}`;
      if ((was.wall_thickness_m ?? 0) !== (opening.wall_thickness_m ?? 0)) return `толщина стены у ${of}`;
    }
    if (JSON.stringify(old.balconies ?? []) !== JSON.stringify(room.balconies ?? [])) return "балкон";
    if (JSON.stringify(old.interiors ?? []) !== JSON.stringify(room.interiors ?? [])) return "санузел, кладовка или колонна";
  }
  if ((from?.package?.ceiling_height_m ?? null) !== (to?.package?.ceiling_height_m ?? null)) return "высота потолка";
  if ((from?.package?.address ?? "") !== (to?.package?.address ?? "")) return "адрес";
  const was = from?.form ?? {};
  const now = to?.form ?? {};
  if (was.firstLength !== now.firstLength || was.secondLength !== now.secondLength) return "длина стены";
  if (was.wallThickness !== now.wallThickness || from?.entrance?.thickness !== to?.entrance?.thickness) return "толщина стены";
  if (JSON.stringify(from?.entrance?.anchor ?? null) !== JSON.stringify(to?.entrance?.anchor ?? null)
    || from?.entrance?.side !== to?.entrance?.side) return "расстояние до двери";
  return "";
}
let noticeTimer = null;
function showNotice(text) {
  clearTimeout(noticeTimer);
  elements.undoToast.textContent = text;
  elements.undoToast.hidden = false;
  noticeTimer = setTimeout(() => { elements.undoToast.hidden = true; }, 3500);
}
async function moveHistory(direction) {
  const nextIndex = historyCursor + direction;
  if (!historyUsable() || nextIndex < 0 || nextIndex >= historyEntries.length) return;
  const before = draftValue();
  const snapshot = structuredClone(historyEntries[nextIndex].value);
  const what = describeChange(direction < 0 ? snapshot : before, direction < 0 ? before : snapshot);
  showNotice(`${direction < 0 ? "Отменено" : "Возвращено"}: ${what || "последнее действие"}`);
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
  if (direction < 0) reaskUndone(before, snapshot);
}
// After ↶ the number that was erased is asked again, where it is written (Bolat, 08.10.2026: "стрелка должна снова
// вернуть на расстояние до угла"). The microphone opens only for a question that takes the answer.
function reaskUndone(before, snapshot) {
  if (currentScreen === "room") {
    const ids = ["firstLength", "secondLength", "wallThickness"];
    const changed = ids.find((id) => before.form?.[id] !== snapshot.form?.[id]);
    if (changed) {
      selectVoiceTargetById(changed);
      setTimeout(startContextVoice, 0);
    }
    return;
  }
  const rooms = packageData?.rooms ?? [];
  const undone = before.package?.rooms ?? [];
  if (rooms.length !== undone.length) return;
  for (const [roomIndex, room] of rooms.entries()) {
    const later = undone[roomIndex];
    if (!later || later.id !== room.id) continue;
    const moved = room.openings.find((opening) => {
      const was = later.openings.find((item) => item.id === opening.id);
      return was && (Math.abs(was.offset_m - opening.offset_m) > 1e-9 || was.wall_id !== opening.wall_id);
    });
    const wallIndex = room.walls.findIndex((wall, index) => Math.abs(wall.length_m - (later.walls[index]?.length_m ?? wall.length_m)) > 1e-9);
    const corner = changedCorner(later, room);
    if (!moved && wallIndex < 0 && corner < 0) continue;
    if (currentRoomIndex !== roomIndex || currentScreen !== "openings") {
      currentRoomIndex = roomIndex;
      showScreen("openings");
    }
    // A corner works out the last walls again and a wall length moves the openings measured from its far corner:
    // the corner, then the wall, is what was said.
    if (corner > 0) startAngleFix(corner);
    else if (wallIndex >= 0) startWallFix(wallIndex);
    else fixOpeningDistance(moved.id, openingAnchorSide(room, moved));
    return;
  }
}

function initializeUi() {
  applyTheme(storedValue(THEME_KEY, "light"), false);
  setThemeControlVisible(storedValue(THEME_CONTROL_KEY, "0") === "1", false);
  elements.themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  elements.darkThemeSetting.addEventListener("change", () => applyTheme(elements.darkThemeSetting.checked ? "dark" : "light"));
  elements.showThemeControl.addEventListener("change", () => setThemeControlVisible(elements.showThemeControl.checked));
  elements.hintsSetting.checked = hintsEnabled();
  elements.hintsSetting.addEventListener("change", () => {
    storeValue(HINTS_KEY, elements.hintsSetting.checked ? "1" : "0");
    syncHint();
  });
  // Settings and help are full tabs like "Объекты", not pop-up panels (Bolat, 05.10.2026).
  elements.settingsNavButton.addEventListener("click", () => showScreen("settings"));
  elements.helpNavButton.addEventListener("click", () => showScreen("help"));
  elements.contextMicButton.addEventListener("click", startContextVoice);
  elements.voiceStopButton.addEventListener("click", stopContextVoice);
  elements.undoButton.addEventListener("click", () => moveHistory(-1).catch(showError));
  elements.redoButton.addEventListener("click", () => moveHistory(1).catch(showError));
  elements.measureNavButton.addEventListener("click", () => {
    // The main tab always begins with step 1 (the address) until there is an object to measure.
    if (!editingAddress()) {
      openAddressStep();
      return;
    }
    resumeWork();
  });
  elements.headerTitle.addEventListener("click", () => {
    if (currentScreen !== "start") openAddressStep(true);
  });
  elements.rememberAddressButton.addEventListener("click", rememberAddressCorrection);
  elements.addressNewButton.addEventListener("click", () => {
    addressDictation = null;
    leaveCurrentForCatalog("").then(() => elements.address.focus()).catch(showError);
  });
  elements.objectsNavButton.addEventListener("click", () => {
    startMode = "list";
    showScreen("start");
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
    // The same pulsing button asks the width of a new window or passage, then the wall thickness.
    selectVoiceTargetById(openingStep?.step === "width" ? "openingWidth" : "wallThickness");
    startContextVoice();
  });
  // A tapped wall can be measured right there, before or after its doors and windows (Bolat, 07.10.2026): the
  // technician walks his own way round the room.
  elements.wallLengthPrompt.addEventListener("click", () => {
    if (openingStep?.step === "kind") startWallFix(openingStep.wallIndex);
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
  installOverviewTaps();
}
function syncHeaderTitle() {
  const address = (currentScreen === "start" || !packageData ? elements.address.value : packageData.address).trim();
  if (elements.headerTitle) elements.headerTitle.textContent = address || "Новый замер";
}
// Two fingers zoom the plan; one finger moves it when enlarged, or taps a room to open it.
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// The small plan in the corner is the way between rooms (Bolat, 08.10.2026: ← led to the remarks, and the small plan
// did nothing): a tap opens the room under the finger, or the nearest one — rooms there are small for a finger.
function overviewRoomAt(canvas, event) {
  const bounds = canvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
  const shapes = canvas.roomShapes ?? [];
  const inside = shapes.find((shape) => pointInPolygon([x, y], shape.points));
  if (inside) return inside.index;
  let best = null;
  for (const shape of shapes) {
    const corners = shape.points.slice(0, -1);
    const centre = [corners.reduce((sum, p) => sum + p[0], 0) / corners.length, corners.reduce((sum, p) => sum + p[1], 0) / corners.length];
    const distance = Math.hypot(centre[0] - x, centre[1] - y);
    if (!best || distance < best.distance) best = { index: shape.index, distance };
  }
  return best?.index ?? null;
}
function openRoomFromOverview(index) {
  if (!Number.isInteger(index) || !packageData?.rooms?.[index]) return;
  if (voiceListening) stopContextVoice();
  clearOpeningEdit();
  openingStep = null;
  balconyStep = null;
  pendingAdjacent = null;
  pendingShape = null;
  currentRoomIndex = index;
  showScreen("openings");
  persist();
}
function installOverviewTaps() {
  elements.openingOverviewCanvas.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = overviewRoomAt(elements.openingOverviewCanvas, event);
    if (index !== null && index !== currentRoomIndex) openRoomFromOverview(index);
  });
  elements.adjacentOverviewCanvas.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = overviewRoomAt(elements.adjacentOverviewCanvas, event);
    // The last room there is the new one being measured: a tap on it keeps measuring.
    if (index !== null && index < (packageData?.rooms?.length ?? 0)) openRoomFromOverview(index);
  });
}
function installPlanGestures() {
  const canvas = elements.planCanvas;
  const pointers = new Map();
  let last = null;
  let tap = null;
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
  const redraw = () => {
    canvas.classList.toggle("zoomed", planView.zoom > 1.001);
    drawPlan(canvas, packageData, planView);
  };
  canvas.addEventListener("pointerdown", (event) => {
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Capture only keeps the drag alive outside the canvas. */ }
    pointers.set(event.pointerId, toCanvas(event.clientX, event.clientY));
    last = snapshot();
    if (pointers.size === 1) tap = { id: event.pointerId, at: last.mid, time: Date.now(), moved: false };
    else if (tap) tap.moved = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, toCanvas(event.clientX, event.clientY));
    const current = snapshot();
    if (pointers.size < 2) {
      const distance = tap ? Math.hypot(current.mid[0] - tap.at[0], current.mid[1] - tap.at[1]) : 0;
      if (tap && distance > 12) tap.moved = true;
      // At normal size one finger scrolls the page. Once enlarged, it drags the plan.
      if (planView.zoom > 1.001 && last) {
        const dx = current.mid[0] - last.mid[0];
        const dy = current.mid[1] - last.mid[1];
        if (dx || dy) {
          planView = { ...planView, x: planView.x + dx, y: planView.y + dy };
          if (tap && distance > 3) tap.moved = true;
          redraw();
        }
      }
      last = current;
      return;
    }
    if (tap && Math.hypot(current.mid[0] - tap.at[0], current.mid[1] - tap.at[1]) > 12) tap.moved = true;
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
    const ended = tap && tap.id === event.pointerId && event.type === "pointerup" && !tap.moved && Date.now() - tap.time < 500
      ? toCanvas(event.clientX, event.clientY) : null;
    pointers.delete(event.pointerId);
    last = pointers.size ? snapshot() : null;
    if (!pointers.size) tap = null;
    // A short tap on a room opens it for changes.
    if (ended) {
      const shape = (canvas.roomShapes ?? []).find((room) => pointInPolygon(ended, room.points));
      if (shape) {
        currentRoomIndex = shape.index;
        clearOpeningEdit();
        showScreen("openings");
      }
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

// A canvas keeps its drawing width but takes the aspect ratio of the box CSS gives it, so nothing is stretched.
function syncCanvasSizes() {
  let changed = false;
  for (const canvas of document.querySelectorAll(".plan-stage canvas:not(.overview-inset)")) {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const height = Math.round(canvas.width * box.height / box.width);
    if (Math.abs(height - canvas.height) > 1) {
      canvas.height = height;
      changed = true;
    }
  }
  return changed;
}
function rerenderScreen() {
  const renderers = {
    room: renderRoomInput, openings: renderOpenings, interior: renderInteriors,
    adjacent: renderAdjacent, shape: renderShape, done: renderSummary,
  };
  try { renderers[currentScreen]?.(); } catch (error) { showError(error); }
}
window.addEventListener("resize", () => {
  syncCanvasSizes();
  rerenderScreen();
});
// The size of a drawing is measured again once the screen has settled (the hint card, toasts and fonts can change
// it after the first measurement); a squeezed drawing is redrawn at its real proportions.
function resyncCanvasesSoon() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (syncCanvasSizes()) rerenderScreen();
  }));
}
function showScreen(name) {
  currentScreen = name;
  if (WORK_SCREENS.includes(name)) workScreen = name;
  // Another room or screen of the survey ends a half-placed opening; tabs like "Объекты" keep it.
  if (WORK_SCREENS.includes(name) && name !== "openings") openingStep = null;
  if (WORK_SCREENS.includes(name) && name !== "interior") interiorStep = null;
  if (name !== "openings") balconyStep = null;
  if (name !== "openings") armedKind = null;
  if (name !== "interior") cancelAnimationFrame(interiorPulseFrame);
  document.documentElement.dataset.screen = name;
  // Another object came up: its state as opened is the first record, so that its first change can be undone.
  if (!historyRestoring && !historyUsable() && packageData?.package_id) recordHistory();
  else updateHistoryButtons();
  if (name === "start") {
    elements.startScreen.dataset.mode = startMode;
    syncAddressStep();
  }
  syncHeaderTitle();
  if (name === "done") {
    planView = { zoom: 1, x: 0, y: 0 };
    elements.planCanvas.classList.remove("zoomed");
  }
  if (name !== "openings") cancelAnimationFrame(openingPulseFrame);
  if (name !== "openings" && elements.wallFixBar) elements.wallFixBar.hidden = true;
  if (name !== "openings") {
    elements.balconyActions.hidden = true;
    elements.balconySize.hidden = true;
    elements.balconyPrompt.hidden = false;
  }
  if (name !== "adjacent") cancelAnimationFrame(adjacentPulseFrame);
  const microphoneHost = elements[name + "Screen"]?.querySelector(".plan-toolbar, .address-field, [data-mic-host]");
  (microphoneHost ?? document.querySelector(".shell")).append(elements.contextMicButton);
  elements.contextMicButton.classList.toggle("docked", Boolean(microphoneHost));
  for (const screen of ["start", "room", "openings", "interior", "adjacent", "shape", "done", "settings", "help"]) {
    elements[screen + "Screen"].hidden = screen !== name;
  }
  syncCanvasSizes();
  clearError();
  // A failing renderer must not leave the navigation half-switched; the error is shown on screen.
  try {
    if (name === "start") renderSurveyCatalog().catch(showError);
    if (name === "room") renderRoomInput();
    if (name === "openings") renderOpenings();
    if (name === "interior") renderInteriors();
    if (name === "adjacent") renderAdjacent();
    if (name === "shape") renderShape();
    if (name === "done") renderSummary();
  } catch (error) {
    showError(error);
  }
  const tab = name === "start" && startMode === "list" ? "objects" : name === "settings" || name === "help" ? name : "measure";
  startMode = "new";
  for (const key of ["measure", "objects", "settings", "help"]) elements[key + "NavButton"].classList.toggle("active", tab === key);
  if (name === "done") returnToIssues = false;
  syncIssuesReturn();
  syncHint();
  refreshVoiceTarget();
  resyncCanvasesSoon();
}
// An object belongs in "Объекты" from "Начать" on, before anything is measured (Bolat, 05.10.2026): the list is
// where it is found again, opened or deleted.
function keptInCatalog(pkg) {
  return Boolean(pkg?.package_id && String(pkg.address ?? "").trim());
}
function draftValue() {
  return {
    version: 4,
    screen: currentScreen,
    workScreen,
    confirmedPlan,
    issueBaseline,
    returnToIssues,
    openingAnchors,
    package: packageData,
    currentRoomIndex,
    pendingAdjacent,
    shape: shapeState,
    pendingShape,
    entrance,
    editingOpeningId,
    openingPlacementActive,
    editingInteriorId,
    openingStep,
    interiorStep,
    balconyStep,
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
  // Every saved change may fix a remark: the way back shows how many are left.
  try { syncIssuesReturn(); } catch { /* the count is a convenience */ }
  try {
    const value = draftValue();
    await saveDraft(value);
    if (keptInCatalog(value.package)) await saveSurvey(value);
    if (!historyRestoring) recordHistory(value);
    storeHistory();
    setSaveStatus("");
  } catch {
    setSaveStatus(SAVE_FAILED);
  }
}
function schedulePersist() {
  setSaveStatus("Сохраняем…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 180);
}
function restoreOpeningStep(value) {
  if (!value || typeof value !== "object") return null;
  if (value.step === "kind") return Number.isInteger(value.wallIndex) && value.wallIndex >= 0 ? { step: "kind", wallIndex: value.wallIndex } : null;
  if (!["side", "width", "thickness"].includes(value.step) || typeof value.id !== "string") return null;
  const step = { step: value.step, id: value.id, editing: value.editing === true, balcony: value.balcony === true };
  if (value.reanchor === true) step.reanchor = true;
  if (value.distanceOnly === true) step.distanceOnly = true;
  if (value.step !== "thickness") step.side = ["start", "end"].includes(value.side) ? value.side : null;
  if (value.step === "width") {
    if (!step.side || !Number.isFinite(value.distance)) return null;
    step.distance = value.distance;
  }
  return step;
}
function restoreInteriorStep(value) {
  if (!value || typeof value !== "object") return null;
  if (value.step === "kind") {
    return Array.isArray(value.tap) && value.tap.length === 2 && value.tap.every(Number.isFinite) ? { step: "kind", tap: [...value.tap] } : null;
  }
  return INTERIOR_STEPS.includes(value.step) && typeof value.id === "string"
    ? { step: value.step, id: value.id, all: value.all === true } : null;
}
function restoreForm(draft) {
  const form = draft?.form ?? {};
  elements.address.value = form.address ?? draft?.package?.address ?? "";
  elements.roomName.value = form.roomName || "Прихожая";
  elements.firstLength.value = form.firstLength ?? "";
  elements.secondLength.value = form.secondLength ?? "";
  elements.wallThickness.value = form.wallThickness ?? "";
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
  entrance = restoreEntrance(draft?.entrance);
  workScreen = WORK_SCREENS.includes(draft?.workScreen) ? draft.workScreen : null;
  confirmedPlan = typeof draft?.confirmedPlan === "string" ? draft.confirmedPlan : null;
  issueBaseline = Array.isArray(draft?.issueBaseline) ? draft.issueBaseline : null;
  returnToIssues = Boolean(draft?.returnToIssues);
  openingAnchors = draft?.openingAnchors && typeof draft.openingAnchors === "object" ? { ...draft.openingAnchors } : {};
  // A door or storage half placed when the page reloaded continues at the same question.
  openingStep = restoreOpeningStep(draft?.openingStep);
  interiorStep = restoreInteriorStep(draft?.interiorStep);
  balconyStep = typeof draft?.balconyStep?.openingId === "string"
    ? { openingId: draft.balconyStep.openingId, asking: draft.balconyStep.asking === true } : null;
  activeRoomWall = entrance.step === "thickness" ? null
    : entrance.step === "anchor" ? null : entrance.wall;
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
  const room = {
    walls: [
      { length_m: width, source: widthKnown ? "measured" : "unmeasured", id: "preview-1" },
      { length_m: height, source: heightKnown ? "measured" : "unmeasured", id: "preview-2" },
      { length_m: width, source: widthKnown ? "inferred_opposite" : "unmeasured", id: "preview-3" },
      { length_m: height, source: heightKnown ? "inferred_opposite" : "unmeasured", id: "preview-4" },
    ],
    openings: [],
  };
  const existing = firstRoomToCorrect();
  if (existing) {
    // Correcting a measured room: its own doors and windows stay on the drawing.
    room.openings = existing.openings.map((opening) => ({
      ...opening, wall_id: "preview-" + (existing.walls.findIndex((wall) => wall.id === opening.wall_id) + 1),
    }));
    return room;
  }
  if (entrance.step !== "wall") {
    const wall = entrance.wall;
    const length = room.walls[wall].length_m;
    const known = wall % 2 === 0 ? widthKnown : heightKnown;
    // Measured from the start corner the door sits at once; from the end corner only when the wall length is known.
    const real = entrance.side === "start" || known ? entranceOffset(length) : null;
    const offset = real === null
      ? Math.max(0, (length - ENTRANCE_WIDTH_M) / 2)
      : Math.min(Math.max(0, real), Math.max(0, length - ENTRANCE_WIDTH_M));
    room.openings = [{ id: "entrance", wall_id: "preview-" + (wall + 1), offset_m: offset, width_m: ENTRANCE_WIDTH_M, kind: "door" }];
  }
  return room;
}
// Canvas y below a button floating over the drawing (plus room for a wall length label), so that the corner and
// wall it asks about are never hidden under it; 0 while the button is hidden.
function reserveUnder(canvas, element) {
  if (!element || element.hidden) return 0;
  const canvasBox = canvas.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  if (!canvasBox.height || !box.height) return 0;
  return (box.bottom - canvasBox.top) * canvas.height / canvasBox.height + 46;
}
// Vertical room for a drawing: a canvas may keep its top free (`topReserve`, e.g. under the plan overview).
function drawingBand(canvas, margin) {
  const top = Math.max(margin, canvas.topReserve ?? 0);
  return { top, height: Math.max(canvas.height - top - margin, 40) };
}
function roomBox(canvas, room) {
  const margin = 84;
  const band = drawingBand(canvas, margin);
  const width = room.walls[0].length_m;
  const height = room.walls[1].length_m;
  // A balcony stands outside the room: the drawing makes room for it.
  let [minX, maxX, minY, maxY] = [0, width, 0, height];
  for (const { points } of roomBalconies(room, canvas.previewBalcony)) {
    for (const point of points) {
      const [x, y] = roomLocalPoint(room, point);
      [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
    }
  }
  const scale = Math.min((canvas.width - 2 * margin) / (maxX - minX), band.height / (maxY - minY));
  const left = (canvas.width - (maxX - minX) * scale) / 2 - minX * scale;
  const bottom = band.top + (band.height - (maxY - minY) * scale) / 2 + maxY * scale;
  return { left, top: bottom - height * scale, right: left + width * scale, bottom, scale, width, height };
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

// The balconies of a room (Bolat, 08.10.2026), each with the wall of its door and its corners on the plan.
function roomBalconies(room, preview = null) {
  const balconies = preview ? [...(room?.balconies ?? []), preview] : (room?.balconies ?? []);
  return balconies.flatMap((balcony) => {
    try {
      const opening = room.openings.find((item) => item.id === balcony.opening_id);
      const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
      return [{ balcony, wallIndex, points: balconyPoints(room, balcony) }];
    } catch {
      return [];
    }
  });
}
// How far out of each wall its balconies reach, in metres: the wall's length is written beyond them.
function balconyReach(room, preview = null) {
  const reach = room.walls.map(() => 0);
  for (const { balcony, wallIndex } of roomBalconies(room, preview)) {
    reach[wallIndex] = Math.max(reach[wallIndex], wallThickness(room, room.walls[wallIndex]) + balcony.depth_m);
  }
  return reach;
}
function balconyLabel(balcony) {
  return `${formatLength(balcony.width_m)} × ${formatLength(balcony.depth_m)}`;
}
// The balcony symbol until the technicians' own is known: a slab outside the wall with a double line of railing on its
// three free sides, no words (Bolat, 08.10.2026). Points: along the wall at the start, at the end, then out at the far edge (canvas pixels).
function drawBalconySymbol(context, points, { selected = false, preview = false, px = 1 } = {}) {
  const [p0, p1, p2, p3] = points;
  const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const along = [(p1[0] - p0[0]) / span(p0, p1), (p1[1] - p0[1]) / span(p0, p1)];
  const out = [(p3[0] - p0[0]) / span(p0, p3), (p3[1] - p0[1]) / span(p0, p3)];
  context.save();
  context.fillStyle = preview ? uiColor("--field", "#ffffff")
    : selected ? uiColor("--select-bg", "#cfe0f5") : uiColor("--field", "#ffffff");
  context.beginPath();
  context.moveTo(p0[0], p0[1]);
  for (const point of [p1, p2, p3]) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
  context.strokeStyle = preview ? uiColor("--unmeasured", "#8a93a3")
    : selected ? "#d93025" : uiColor("--nav-text", "#153e60");
  if (preview) context.setLineDash([9 * px, 7 * px]);
  context.lineWidth = (selected ? 4 : 2.5) * px;
  context.beginPath();
  context.moveTo(p1[0], p1[1]);
  for (const point of [p2, p3, p0]) context.lineTo(point[0], point[1]);
  context.stroke();
  const inset = 6 * px;
  if (span(p0, p1) > 3 * inset && span(p0, p3) > 2 * inset) {
    const shift = (point, a, b) => [point[0] + along[0] * a + out[0] * b, point[1] + along[1] * a + out[1] * b];
    const inner = [shift(p1, -inset, 0), shift(p2, -inset, -inset), shift(p3, inset, -inset), shift(p0, inset, 0)];
    context.lineWidth = 1.2 * px;
    context.beginPath();
    context.moveTo(inner[0][0], inner[0][1]);
    for (const point of inner.slice(1)) context.lineTo(point[0], point[1]);
    context.stroke();
  }
  context.restore();
}
function drawRoomBalconies(canvas, room, toCanvas) {
  const context = canvas.getContext("2d");
  canvas.balconyShapes = [];
  for (const { balcony, points } of roomBalconies(room, canvas.previewBalcony)) {
    const shape = points.map(toCanvas);
    const preview = balcony === canvas.previewBalcony;
    drawBalconySymbol(context, shape, { selected: !preview && canvas.selectedBalcony === balcony.opening_id, preview });
    if (!preview) canvas.balconyShapes.push({ openingId: balcony.opening_id, points: shape });
  }
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
  if (interior.kind === "storage") {
    // The storage door, drawn like any door in the middle of its side: a tap on another side moves it there.
    const side = interior.door_wall ?? 2;
    const [a, b] = [points[side], points[(side + 1) % 4]];
    const sideMeters = (side % 2 === 0 ? interior.width_m : interior.depth_m) + 2 * interior.partition_m;
    const share = Math.min(0.9, interior.door_width_m / sideMeters) / 2;
    const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const half = [(b[0] - a[0]) * share, (b[1] - a[1]) * share];
    drawOpeningSymbol(context, [middle[0] - half[0], middle[1] - half[1], middle[0] + half[0], middle[1] + half[1]],
      { kind: "door" }, uiColor("--field", "#ffffff"));
  }
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
  const [x, y] = box.world ? point : roomLocalPoint(room, point);
  return [box.left + x * box.scale, box.bottom - y * box.scale];
}
// Only the entrance is "always at the bottom" (Bolat, 05.10.2026): every room behind a door is drawn the way it
// stands on the plan, so the technician sees its walls where they are. A rectangle whose first wall does not run
// left to right on the plan, and any non-rectangular room, go through the plan-oriented drawing.
function drawsOnPlan(room) {
  if (isPolygonRoom(room)) return true;
  const angle = ((room?.walls?.[0]?.angle_deg ?? 0) % 360 + 360) % 360;
  return angle > 1e-6 && angle < 360 - 1e-6;
}
// Fits a room into the canvas in its plan orientation (plan coordinates, y up).
function polygonBox(canvas, room) {
  const margin = 76;
  const local = [...roomPoints(room).slice(0, -1), ...roomBalconies(room, canvas.previewBalcony).flatMap((item) => item.points)];
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.1);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 0.1);
  const band = drawingBand(canvas, margin);
  const scale = Math.min((canvas.width - 2 * margin) / spanX, band.height / spanY);
  return {
    left: (canvas.width - spanX * scale) / 2 - Math.min(...xs) * scale,
    bottom: band.top + (band.height - spanY * scale) / 2 + Math.max(...ys) * scale,
    scale,
    world: true,
  };
}
function canvasWallSegment(canvas, room, wallIndex, opening) {
  if (!drawsOnPlan(room)) return openingSegment(roomBox(canvas, room), wallIndex, opening);
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
// Canvas-space outline of a room, used to tell a tap inside the room from a tap on its wall.
function canvasRoomOutline(canvas, room) {
  if (drawsOnPlan(room)) {
    const box = polygonBox(canvas, room);
    return roomPoints(room).slice(0, -1).map((point) => roomPointToCanvas(room, box, point));
  }
  const box = roomBox(canvas, room);
  return [[box.left, box.bottom], [box.right, box.bottom], [box.right, box.top], [box.left, box.top]];
}
function tapIsInsideRoom(canvas, room, x, y) {
  const outline = canvasRoomOutline(canvas, room);
  let inside = false;
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index, index += 1) {
    const [xi, yi] = outline[index];
    const [xj, yj] = outline[previous];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  let nearest = Infinity;
  for (let index = 0; index < outline.length; index += 1) {
    nearest = Math.min(nearest, distanceToCanvasSegment(x, y, outline[index], outline[(index + 1) % outline.length]));
  }
  // Walls get a wide touch zone; only a tap well inside the room counts as "inside". On a small drawing the zone
  // shrinks so that the middle of the room always stays tappable.
  const xs = outline.map((point) => point[0]);
  const ys = outline.map((point) => point[1]);
  const smallerSide = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return nearest > Math.min(canvas.width * 0.14, smallerSide * 0.25);
}

function nearestWallIndex(canvas, room, x, y) {
  if (drawsOnPlan(room)) {
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
function formatDegrees(value) {
  return String(Math.round(value * 10) / 10).replace(".", ",") + "°";
}
function drawCornerLetters(context, corners, outward) {
  // As large as the wall lengths: on a phone the canvas is drawn at about half size.
  context.fillStyle = uiColor("--button", "#285778");
  context.font = "800 26px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  corners.forEach((corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    const first = outward(previous, corner);
    const second = outward(corner, next);
    const bisector = [first[0] + second[0], first[1] + second[1]];
    const length = Math.hypot(bisector[0], bisector[1]) || 1;
    context.fillText(cornerName(index), corner[0] + bisector[0] / length * 30, corner[1] + bisector[1] / length * 30);
  });
}
// Каждая стена подписана своей толщиной; число внутри комнаты можно коснуться для исправления.
function drawWallThicknessLabels(canvas, room, corners) {
  if (canvas !== elements.openingCanvas) return;
  const context = canvas.getContext("2d");
  const outward = canvasOutward(corners);
  context.save();
  context.fillStyle = uiColor("--muted", "#4a5568");
  context.font = "700 19px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  room.walls.forEach((wall, wallIndex) => {
    const start = corners[wallIndex];
    const end = corners[(wallIndex + 1) % corners.length];
    const normal = outward(start, end);
    const x = (start[0] + end[0]) / 2 - normal[0] * 30;
    const y = (start[1] + end[1]) / 2 - normal[1] * 30;
    context.fillText("т " + formatLength(wallThickness(room, wall)), x, y);
    canvas.thicknessHitboxes.push({ wallIndex, x, y, left: x - 49, right: x + 49, top: y - 22, bottom: y + 22 });
  });
  context.restore();
}
function drawPolygonRoom(canvas, room, selectedWall, attention, letters = true) {
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
    strokeWallSegment(context, [points[wallIndex][0], points[wallIndex][1], points[wallIndex + 1][0], points[wallIndex + 1][1]],
      active && attention, wall.source === "unmeasured" ? uiColor("--unmeasured", "#8a93a3") : measured);
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
  drawRoomBalconies(canvas, room, (point) => roomPointToCanvas(room, box, point));
  for (const opening of room.openings ?? []) {
    const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
    if (wallIndex < 0) continue;
    drawOpeningSymbol(context, canvasWallSegment(canvas, room, wallIndex, opening), opening, field);
  }

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = text;
  context.font = "700 20px system-ui";
  const reach = balconyReach(room);
  room.walls.forEach((wall, wallIndex) => {
    if (wall.source === "unmeasured") return;
    const a = points[wallIndex];
    const b = points[wallIndex + 1];
    const normal = outward(a, b);
    const away = 30 + reach[wallIndex] * box.scale;
    const x = (a[0] + b[0]) / 2 + normal[0] * away;
    const y = (a[1] + b[1]) / 2 + normal[1] * away;
    context.fillText(formatLength(wall.length_m), x, y);
    canvas.lengthHitboxes = canvas.lengthHitboxes ?? [];
    canvas.lengthHitboxes.push({ wallIndex, left: x - 46, right: x + 46, top: y - 30, bottom: y + 30 });
  });
  drawWallThicknessLabels(canvas, room, corners);
  if (letters) drawCornerLetters(context, corners, outward);
  // A free-form room has its corners written down too, the way the technician said them; a tap on the letter says
  // the corner again (setCornerAngle). A right angle is not written: it is what a corner is without a number.
  if (letters && isPolygonRoom(room)) {
    const angles = roomInteriorAngles(room);
    context.font = "700 18px system-ui";
    context.fillStyle = text;
    canvas.cornerHitboxes = corners.map((corner, index) => {
      const first = outward(corners[(index + corners.length - 1) % corners.length], corner);
      const second = outward(corner, corners[(index + 1) % corners.length]);
      const bisector = [first[0] + second[0], first[1] + second[1]];
      const length = Math.hypot(bisector[0], bisector[1]) || 1;
      const at = (away) => [corner[0] + bisector[0] / length * away, corner[1] + bisector[1] / length * away];
      if (Math.abs(angles[index] - 90) > 0.05) {
        const [x, y] = at(56);
        context.fillText(formatDegrees(angles[index]), x, y);
      }
      const [x, y] = at(30);
      return { corner: index, x, y, radius: 30 };
    });
  }
}
// Walls end square so corners close cleanly; the wall being asked for pulses in a strong red with a glow
// and keeps flat ends so it never rounds over its neighbours.
function strokeWallSegment(context, segment, pulsing, color) {
  context.save();
  if (pulsing) {
    const phase = (Math.sin(Date.now() / 170) + 1) / 2;
    context.strokeStyle = "#e5252a";
    context.shadowColor = "rgba(229, 37, 42, 0.85)";
    context.shadowBlur = 6 + 18 * phase;
    context.lineWidth = 10 + 5 * phase;
    context.lineCap = "butt";
  } else {
    context.strokeStyle = color;
    context.lineWidth = 9;
    context.lineCap = "square";
  }
  context.beginPath();
  context.moveTo(segment[0], segment[1]);
  context.lineTo(segment[2], segment[3]);
  context.stroke();
  context.restore();
}
function drawRoom(canvas, room, selectedWall = null, attention = false, inputIds = ["firstLength", "secondLength"], letters = true) {
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
  canvas.lengthHitboxes = [];
  canvas.thicknessHitboxes = [];
  canvas.cornerHitboxes = [];
  canvas.balconyShapes = [];
  if (!room) return;
  if (drawsOnPlan(room)) {
    drawPolygonRoom(canvas, room, selectedWall, attention, letters);
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
    strokeWallSegment(context, segment, active && attention, wall.source === "unmeasured" ? uiColor("--unmeasured", "#8a93a3") : measured);
  });

  for (const interior of room.interiors ?? []) {
    drawInteriorSymbol(
      context,
      interiorPoints(room, interior).map((point) => roomPointToCanvas(room, box, point)),
      interior,
    );
  }
  drawRoomBalconies(canvas, room, (point) => roomPointToCanvas(room, box, point));

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
  const reach = balconyReach(room, canvas.previewBalcony).map((value) => value * box.scale);
  const labels = [
    { wall: 0, x: (box.left + box.right) / 2, y: box.bottom + 34 + reach[0], rotate: 0, input: inputIds[0] },
    { wall: 1, x: box.right + 36 + reach[1], y: (box.top + box.bottom) / 2, rotate: Math.PI / 2, input: inputIds[1] },
    { wall: 2, x: (box.left + box.right) / 2, y: box.top - 30 - reach[2], rotate: 0, input: inputIds[0] },
    { wall: 3, x: box.left - 36 - reach[3], y: (box.top + box.bottom) / 2, rotate: -Math.PI / 2, input: inputIds[1] },
  ];
  for (const label of labels) {
    const wall = room.walls[label.wall];
    if (wall.source === "unmeasured") continue;
    context.save();
    context.translate(label.x, label.y);
    context.rotate(label.rotate);
    context.fillText(format(wall.length_m), 0, 0);
    context.restore();
    canvas.lengthHitboxes.push({ wallIndex: label.wall, left: label.x - 58, right: label.x + 58, top: label.y - 58, bottom: label.y + 58 });
    canvas.dimensionHitboxes.push({
      wallIndex: label.wall,
      inputId: label.input,
      left: label.x - (label.rotate ? 28 : 58),
      right: label.x + (label.rotate ? 28 : 58),
      top: label.y - (label.rotate ? 58 : 25),
      bottom: label.y + (label.rotate ? 58 : 25),
    });
  }
  drawWallThicknessLabels(canvas, room, [
    [box.left, box.bottom], [box.right, box.bottom], [box.right, box.top], [box.left, box.top],
  ]);
  // Corner letters, so "от угла A 2,00 м" in the list can be found on the drawing (PWA only, not exported).
  if (letters) {
    const corners = [[box.left, box.bottom], [box.right, box.bottom], [box.right, box.top], [box.left, box.top]];
    drawCornerLetters(context, corners, canvasOutward(corners));
  }
}
// The corner an opening is measured from: the one the technician tapped, or the nearer one for older openings.
function openingAnchorSide(room, opening) {
  const wallIndex = Math.max(openingWallIndex(room, opening), 0);
  const fromEnd = room.walls[wallIndex].length_m - opening.offset_m - opening.width_m;
  if (openingAnchors[opening.id]) return openingAnchors[opening.id];
  return fromEnd < opening.offset_m - 1e-9 ? "end" : "start";
}
function openingDistance(room, opening, side) {
  const wallIndex = Math.max(openingWallIndex(room, opening), 0);
  return side === "end" ? room.walls[wallIndex].length_m - opening.offset_m - opening.width_m : opening.offset_m;
}
// Every distance from a corner to a door or window is written on the drawing, inside the room by its piece of wall,
// in a frame — as on the sheet (Bolat, 08.10.2026: the said number was nowhere to be seen). A tap on it says it again.
function drawOpeningDistances(canvas, room, skipId = null) {
  canvas.offsetHitboxes = [];
  if (!room?.openings?.length) return;
  const context = canvas.getContext("2d");
  const outline = canvasRoomOutline(canvas, room);
  const outward = canvasOutward(outline);
  context.save();
  // As large as the wall lengths: the canvas is drawn at about half size on a phone.
  context.font = "700 24px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const opening of room.openings) {
    if (opening.id === skipId) continue;
    const wallIndex = openingWallIndex(room, opening);
    if (wallIndex < 0) continue;
    const side = openingAnchorSide(room, opening);
    const distance = openingDistance(room, opening, side);
    if (!(distance > 0.004)) continue;
    const length = room.walls[wallIndex].length_m;
    const piece = side === "start" ? { offset_m: 0, width_m: distance } : { offset_m: length - distance, width_m: distance };
    const [sx, sy, ex, ey] = canvasWallSegment(canvas, room, wallIndex, piece);
    const out = outward([sx, sy], [ex, ey]);
    let x = (sx + ex) / 2 - out[0] * 34;
    let y = (sy + ey) / 2 - out[1] * 34;
    // Two short pieces at one corner would put their numbers on each other: the later one moves along its wall
    // towards its opening until it stands clear.
    const span = Math.hypot(ex - sx, ey - sy) || 1;
    const towards = side === "start" ? [(ex - sx) / span, (ey - sy) / span] : [(sx - ex) / span, (sy - ey) / span];
    for (let step = 0; step < 6 && canvas.offsetHitboxes.some((box) => Math.hypot(box.x - x, box.y - y) < 64); step += 1) {
      x += towards[0] * 24;
      y += towards[1] * 24;
    }
    let angle = Math.atan2(ey - sy, ex - sx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    const label = formatLength(distance);
    const width = context.measureText(label).width + 18;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.beginPath();
    if (context.roundRect) context.roundRect(-width / 2, -18, width, 36, 10);
    else context.rect(-width / 2, -18, width, 36);
    context.fillStyle = uiColor("--field", "#ffffff");
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = uiColor("--button", "#285778");
    context.stroke();
    context.fillStyle = uiColor("--button", "#285778");
    context.fillText(label, 0, 1);
    context.restore();
    canvas.offsetHitboxes.push({ openingId: opening.id, side, x, y, radius: Math.max(46, width / 2 + 14) });
  }
  context.restore();
}
// The outer face of a room's walls (model.js; the desktop's outer_points does the same).
function outerOutline(room) {
  return roomOuterPolygon(room);
}
function drawPlan(canvas, pkg, view = { zoom: 1, x: 0, y: 0 }) {
  const context = canvas.getContext("2d");
  const field = uiColor("--field", "#ffffff");
  const surface = uiColor("--surface", "#f7f8fa");
  const measured = canvas.planReady ? uiColor("--measured", "#2f8a45") : uiColor("--muted", "#4a5568");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = field;
  context.fillRect(0, 0, canvas.width, canvas.height);
  canvas.roomShapes = [];
  if (!pkg?.rooms?.length) return;
  // The whole plan is drawn with its walls (Bolat, 07.10.2026: rooms stood apart like separate boxes): every wall is a
  // band as thick as it is, so the gap between two rooms is the wall they share, as on the desktop and the print.
  // Partitions between rooms without a door take the gap between them, as in the file that goes out.
  let shown = pkg;
  try { shown = inferPartitionThickness(pkg); } catch { /* an unfinished plan is drawn as it is */ }
  const outers = shown.rooms.map(outerOutline);
  const roomPointSets = pkg.rooms.map((room) => roomPoints(room));
  const balconies = shown.rooms.map(roomBalconies);
  const points = [...roomPointSets.flatMap((room) => room.slice(0, -1)), ...outers.flat(),
    ...balconies.flat().flatMap((item) => item.points)];
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

  const px = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
  const path = (polygon) => {
    context.moveTo(polygon[0][0], polygon[0][1]);
    for (const point of polygon.slice(1)) context.lineTo(point[0], point[1]);
    context.closePath();
  };
  // Walls of every room first; each room's floor then covers a wall drawn too thick into it.
  context.fillStyle = measured;
  shown.rooms.forEach((room, roomIndex) => {
    context.beginPath();
    path(outers[roomIndex].map(transform));
    path(roomPointSets[roomIndex].slice(0, -1).map(transform));
    context.fill("evenodd");
  });
  roomPointSets.forEach((roomPointsValue, roomIndex) => {
    const transformed = roomPointsValue.map(transform);
    canvas.roomShapes.push({ index: roomIndex, points: transformed });
    // The room the technician is in is filled in the selection colour on the small plan in the corner.
    context.fillStyle = canvas.highlightRoom === roomIndex ? uiColor("--select-bg", "#cfe0f5") : surface;
    context.beginPath();
    path(transformed.slice(0, -1));
    context.fill();
  });
  shown.rooms.forEach((room, roomIndex) => {
    for (const interior of room.interiors ?? []) {
      drawInteriorSymbol(context, interiorPoints(room, interior).map(transform), interior);
    }
    // A door or passage is a gap through the wall, a door with one line across it; a window, lines along the wall.
    const corners = roomPointSets[roomIndex].slice(0, -1);
    const outwardOf = canvasOutward(corners);
    for (const opening of room.openings) {
      const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
      if (wallIndex < 0) continue;
      const a = corners[wallIndex];
      const b = corners[(wallIndex + 1) % corners.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const unit = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
      const out = outwardOf(a, b);
      const thickness = opening.wall_thickness_m ?? wallThickness(room, room.walls[wallIndex]);
      const at = (along, across) => transform([
        a[0] + unit[0] * along + out[0] * across, a[1] + unit[1] * along + out[1] * across,
      ]);
      const from = opening.offset_m;
      const to = opening.offset_m + opening.width_m;
      context.beginPath();
      path([at(from, -0.01), at(to, -0.01), at(to, thickness + 0.01), at(from, thickness + 0.01)]);
      context.fillStyle = opening.kind === "window" ? field : surface;
      context.fill();
      context.strokeStyle = measured;
      context.lineWidth = 1.5 * px;
      context.beginPath();
      if (opening.kind === "window") {
        for (const across of [0, thickness / 2, thickness]) {
          const [x1, y1] = at(from, across);
          const [x2, y2] = at(to, across);
          context.moveTo(x1, y1);
          context.lineTo(x2, y2);
        }
      } else if (opening.kind === "door") {
        const [x1, y1] = at(from, thickness / 2);
        const [x2, y2] = at(to, thickness / 2);
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
      }
      context.stroke();
    }
  });
  balconies.flat().forEach(({ points: corners }) => {
    drawBalconySymbol(context, corners.map(transform), { px });
  });
  // Places the app does not understand: a red numbered mark, the same number as in the list under the plan.
  // One fixed red with white digits reads in both themes.
  // The canvas is in device pixels: the mark is sized in screen points so it reads on a phone.
  (canvas.problemPoints ?? []).forEach((point, index) => {
    if (!point) return;
    const [x, y] = transform(point);
    context.beginPath();
    context.arc(x, y, 14 * px, 0, Math.PI * 2);
    context.fillStyle = "#d93025";
    context.fill();
    context.lineWidth = 2.5 * px;
    context.strokeStyle = field;
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = `bold ${Math.round(16 * px)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), x, y + 1);
  });
}
const ROOM_TIPS = {
  wall: "Шаг 2. Вход всегда снизу. Нажмите на мигающую красную стену — включится микрофон — и назовите её длину.",
  anchor: "Шаг 3. Дверь встала посередине. Нажмите на мигающий кусок стены слева или справа от двери и назовите расстояние от угла до двери.",
  thickness: "Шаг 4. Нажмите красную кнопку «Толщина ?» и назовите толщину стены. Ошиблись в расстоянии — коснитесь стены с дверью.",
  measure: "Шаг 5. Нажмите на мигающую стену и назовите её длину.",
};
// One hint per step in a yellow card above the drawing (Bolat, 05.10.2026); switched off in "Настройки"
// once the technician knows the way.
const HINTS_KEY = "opis-pwa-hints";
function hintsEnabled() {
  return storedValue(HINTS_KEY, "1") === "1";
}
function hintText() {
  if (currentScreen === "start") {
    return elements.startScreen.dataset.mode === "list" ? ""
      : "Наберите адрес или нажмите микрофон и скажите его. Потом нажмите «Начать».";
  }
  if (currentScreen === "room") return elements.roomTip.textContent;
  if (currentScreen === "openings") {
    if (balconyStep?.asking) {
      return "За дверью балкон. Нажмите красную кнопку и назовите размер, например «метр на два»: меньшее число — насколько он выступает.";
    }
    if (balconyStep) {
      return "Балкон стоит по центру двери. Стоит не там — коснитесь снаружи вдоль стены, где он есть: у угла он упрётся в стену. Размер — красная кнопка.";
    }
    const placing = stepOpening();
    // The distance of a balcony is measured to its door.
    const of = openingStep?.balcony ? "двери балкона" : placing ? OPENING_GENITIVE[placing.kind] : "";
    if (openingStep?.step === "kind") {
      return "Что в этой стене? Нажмите под рисунком: дверь, окно, проём или балкон. Длина стены другая — красная кнопка «Длина».";
    }
    if (openingStep?.step === "side" && openingStep.reanchor && !openingStep.side) {
      return "Комната шире или уже стены, через которую вошли. Коснитесь мигающего куска у двери и назовите расстояние от угла до двери.";
    }
    if (openingStep?.step === "side" && !openingStep.side) {
      if (openingStep.balcony) return "Нажмите на мигающий кусок стены слева или справа от двери балкона и назовите расстояние от угла до двери.";
      return `Нажмите на мигающий кусок стены слева или справа от ${of} и назовите расстояние от угла до ${of}.`;
    }
    if (openingStep?.step === "side") return `Назовите расстояние от угла до ${of}.`;
    if (openingStep?.step === "width") return `Нажмите «Ширина ${of} ?» и назовите ширину ${of}.`;
    if (openingStep?.step === "thickness") {
      const again = " Ошиблись в расстоянии — коснитесь этой стены.";
      if (openingStep.balcony) return `Нажмите «Толщина стены у балкона ?» и назовите её, потом размер балкона.${again}`;
      return `Нажмите «Толщина стены у ${of} ?» и назовите её, потом — комната за ${placing.kind === "door" ? "дверью" : "проёмом"}.${again}`;
    }
    const room = packageData?.rooms?.[currentRoomIndex];
    const fix = room?.openings?.length ? " Неверная цифра — коснитесь её." : "";
    if ((packageData?.rooms?.length ?? 0) > 1) {
      return `Двери и окна — нажмите на стену. Другая комната — коснитесь её на плане в углу.${fix}`;
    }
    return `Ещё двери или окна — нажмите на стену. За новой дверью откроется следующая комната.${fix}`;
  }
  if (currentScreen === "interior") {
    const current = stepInterior();
    if (interiorStep?.step === "kind") return "Что здесь? Нажмите под рисунком: санузел, кладовка или колонна. Нажали по ошибке — коснитесь снаружи комнаты.";
    if (current) {
      const room = packageData.rooms[currentRoomIndex];
      const corner = cornerName(Math.max(room.walls.findIndex((wall) => wall.id === current.wall_id), 0));
      const of = interiorGenitive(current);
      const inside = current.kind === "storage" ? " внутри" : "";
      const ask = {
        offset: `Назовите расстояние от угла ${corner} до ${of} вдоль мигающей стены; вплотную — «ноль». Другой угол или место — коснитесь их.`,
        inset: `Назовите расстояние от угла ${corner} до ${of} вдоль второй мигающей стены; вплотную — «ноль».`,
        width: `Назовите ширину ${of}${inside}.`,
        depth: `Назовите глубину ${of}${inside}.`,
        partition: `Назовите толщину перегородки ${of}.`,
      }[interiorStep.step];
      return interiorStep.step === "offset" ? ask : `${ask} Стоит не там — коснитесь, где он стоит.`;
    }
    return "Коснитесь внутри комнаты, где санузел, кладовка или колонна. Дверь кладовки — касанием её стороны. Назад — коснитесь снаружи.";
  }
  if (currentScreen === "adjacent") {
    if (!elements.adjacentAnchorPanel.hidden && !elements.adjacentAnchorPanel.classList.contains("complete")) {
      return "Стена с дверью другой длины. Нажмите «До двери» и назовите расстояние от угла до двери.";
    }
    return "Назовите обе стены сразу: «4,5 на 4» (сначала стена с дверью). Или коснитесь стены на рисунке. Балкон — кнопка вверху.";
  }
  if (currentScreen === "done" && packageData?.rooms?.length) {
    if (validationIssues(packageData).length) return "Нажмите на замечание — откроется место, где его исправить.";
    return confirmedPlan === planSignature(packageData)
      ? "Нажмите «Передать в настольное приложение»."
      : "Коснитесь комнаты на плане, чтобы продолжить в ней: отметить двери и окна или пройти в следующую.";
  }
  return "";
}
function syncHint() {
  const text = hintsEnabled() ? hintText() : "";
  elements.hintText.textContent = text;
  elements.hintCard.hidden = !text;
  document.documentElement.dataset.hint = text ? "on" : "off";
}
// The piece of the door wall between a corner and the door: the door is anchored by its length.
function entrancePiece(canvas, room, side) {
  const door = room.openings?.[0];
  if (!door) return null;
  const length = room.walls[entrance.wall].length_m;
  const piece = side === "start"
    ? { offset_m: 0, width_m: door.offset_m }
    : { offset_m: door.offset_m + door.width_m, width_m: Math.max(0, length - door.offset_m - door.width_m) };
  return openingSegment(roomBox(canvas, room), entrance.wall, piece);
}
function renderRoomInput() {
  // A measured room never walks the entrance steps again (an old draft may still be in one of them).
  if (firstRoomToCorrect() && entrance.step !== "measure") entrance = { ...entrance, step: "measure" };
  elements.roomTip.textContent = firstRoomToCorrect()
    ? "Нажмите на стену с неверной длиной и назовите её заново — план перестроится. Двери и окна останутся."
    : entrance.step === "anchor" && entrance.side
      ? "Шаг 3. Назовите расстояние от угла до двери." : ROOM_TIPS[entrance.step];
  syncHint();
  if (entrance.step === "thickness") {
    clearTimeout(thicknessChipTimer);
    elements.thicknessChip.textContent = "Толщина ?";
    elements.thicknessChip.classList.remove("done");
    elements.thicknessChip.hidden = false;
  } else if (!elements.thicknessChip.classList.contains("done")) {
    elements.thicknessChip.hidden = true;
  }
  elements.roomCanvas.topReserve = reserveUnder(elements.roomCanvas, elements.thicknessChip);
  cancelAnimationFrame(roomPulseFrame);
  // Anchoring blinks the door wall itself (Bolat, 05.10.2026): its pieces left and right of the door in turn
  // until one is tapped, then that piece alone. Blinking the side walls read as "measure that wall".
  const anchoring = entrance.step === "anchor";
  const draw = () => {
    const room = previewRoom();
    const wall = anchoring ? null : activeRoomWall;
    drawRoom(elements.roomCanvas, room, wall, true);
    if (anchoring) {
      const side = entrance.side ?? (Math.floor(Date.now() / 650) % 2 ? "end" : "start");
      const piece = entrancePiece(elements.roomCanvas, room, side);
      if (piece) strokeWallSegment(elements.roomCanvas.getContext("2d"), piece, true);
    }
    if (currentScreen === "room" && (anchoring || wall !== null)) roomPulseFrame = requestAnimationFrame(draw);
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

// Built-in rooms, columns and floor openings by steps (Bolat's decision of 02–03.10.2026, guided like the doors
// on 05.10.2026): tap inside the room -> what is it -> the corner it is measured from blinks (another corner: tap it)
// -> distance from the corner along one wall, then along the other -> inside width and depth -> the partition of a
// storage. A tap on a side of a storage moves its door there.
// { step: "kind", tap: [x, y] } | { step: "offset" | "inset" | "width" | "depth" | "partition", id }
let interiorStep = null;
// What can stand inside a room (Bolat, 07.10.2026): a bathroom first — every flat has one, then a storage, then a
// column. A bathroom is a storage of the contract (`kind: "storage"`, partitions and a door) named "Санузел": the
// desktop prints the name, the measurement format does not change. The floor opening ("void") left the buttons: nobody
// knew what it was; old files with one still open and draw.
const INTERIOR_CHOICES = {
  bathroom: { kind: "storage", name: "Санузел", size: 1.5, door: 0.6, genitive: "санузла" },
  storage: { kind: "storage", name: "Кладовка", size: 1.2, door: 0.8, genitive: "кладовки" },
  column: { kind: "column", size: 0.4, genitive: "колонны" },
};
const STORAGE_NAMES = ["Кладовка", "Санузел"];
function interiorChoice(interior) {
  if (interior?.kind === "storage") return interior.name === "Санузел" ? "bathroom" : "storage";
  return interior?.kind ?? null;
}
function interiorGenitive(interior) {
  return INTERIOR_CHOICES[interiorChoice(interior)]?.genitive ?? "проёма";
}
const INTERIOR_STEPS = ["offset", "inset", "width", "depth", "partition"];
const INTERIOR_FIELDS = { offset: "interiorOffset", inset: "interiorInset", width: "interiorWidth", depth: "interiorDepth", partition: "interiorPartition" };
const INTERIOR_KEYS = { offset: "offsetM", inset: "insetM", width: "widthM", depth: "depthM", partition: "partitionM" };

// Along-the-wall and into-the-room directions at the start corner of a wall, as interiorPoints() uses them.
function interiorFrame(room, wallIndex) {
  const points = roomPoints(room);
  const start = points[wallIndex];
  const end = points[wallIndex + 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const area = points.slice(0, -1).reduce((sum, point, index, all) => {
    const next = all[(index + 1) % all.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const direction = area > 0 ? 1 : -1;
  return { corner: start, unit, inward: [-unit[1] * direction, unit[0] * direction] };
}
// Room point <-> canvas point for whichever way the room is drawn.
function canvasMap(canvas, room) {
  if (drawsOnPlan(room)) {
    const box = polygonBox(canvas, room);
    return { to: (point) => roomPointToCanvas(room, box, point), from: (x, y) => [(x - box.left) / box.scale, (box.bottom - y) / box.scale] };
  }
  const box = roomBox(canvas, room);
  const frame = interiorFrame(room, 0);
  return {
    to: (point) => roomPointToCanvas(room, box, point),
    from: (x, y) => {
      const along = (x - box.left) / box.scale;
      const inward = (box.bottom - y) / box.scale;
      return [frame.corner[0] + frame.unit[0] * along + frame.inward[0] * inward, frame.corner[1] + frame.unit[1] * along + frame.inward[1] * inward];
    },
  };
}
function stepInterior() {
  if (!interiorStep?.id) return null;
  return packageData?.rooms?.[currentRoomIndex]?.interiors?.find((item) => item.id === interiorStep.id) ?? null;
}
function interiorValues(room, interior) {
  return {
    kind: interior.kind,
    wallIndex: room.walls.findIndex((wall) => wall.id === interior.wall_id),
    offsetM: interior.offset_m, insetM: interior.inset_m, widthM: interior.width_m, depthM: interior.depth_m,
    partitionM: interior.partition_m ?? 0.1, doorWidthM: interior.door_width_m ?? 0.8, doorWall: interior.door_wall ?? 2,
    name: interior.name ?? "Кладовка",
  };
}
// The door of a storage stays at least 5 cm from its corners when the storage gets smaller. A bathroom door is 0,60.
function fitStorageDoor(values) {
  if (values.kind !== "storage") return values;
  const side = values.doorWall % 2 === 0 ? Number(values.widthM) : Number(values.depthM);
  const usual = values.name === "Санузел" ? 0.6 : 0.8;
  return { ...values, doorWidthM: Math.max(0.3, Math.min(usual, Math.round((side - 0.1) * 100) / 100)) };
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function startInteriorAt(tap) {
  clearError();
  interiorStep = { step: "kind", tap };
  renderInteriors();
  schedulePersist();
}
function nearestCorner(room, point) {
  const corners = roomPoints(room).slice(0, -1);
  return corners.reduce((best, corner, index) => (
    Math.hypot(corner[0] - point[0], corner[1] - point[1]) < Math.hypot(corners[best][0] - point[0], corners[best][1] - point[1]) ? index : best
  ), 0);
}
// Nobody builds a bathroom or a storage in the middle of a room (Bolat, 07.10.2026): it stands against the wall the
// tap is near — in the corner when near both, in the middle of one wall when near only that one. Never floating: at
// least the nearer wall is touched. Distances from `corner` for an object `along` × `inward` (outer sizes) at the tap.
const SNAP_M = 0.6;
function snapAt(room, corner, tap, along, inward) {
  const frame = interiorFrame(room, corner);
  const relative = [tap[0] - frame.corner[0], tap[1] - frame.corner[1]];
  let offset = Math.max(0, relative[0] * frame.unit[0] + relative[1] * frame.unit[1] - along / 2);
  let inset = Math.max(0, relative[0] * frame.inward[0] + relative[1] * frame.inward[1] - inward / 2);
  if (offset < SNAP_M) offset = 0;
  if (inset < SNAP_M) inset = 0;
  if (offset > 0 && inset > 0) {
    if (offset < inset) offset = 0;
    else inset = 0;
  }
  return { offsetM: round2(offset), insetM: round2(inset) };
}
// Against the wall the distance to it is known: in a corner nothing is asked but the sizes; against one wall only the
// distance along it, from the corner (Bolat, 07.10.2026). "Изменить" and another corner ask everything (`all`).
function firstInteriorStep(interior) {
  if (interior.offset_m === 0 && interior.inset_m === 0) return "width";
  return interior.offset_m === 0 ? "inset" : "offset";
}
async function chooseInteriorKind(choice) {
  const room = packageData?.rooms?.[currentRoomIndex];
  const chosen = INTERIOR_CHOICES[choice];
  if (!room || !chosen) return;
  const kind = chosen.kind;
  try {
    if (interiorStep?.step === "kind") {
      // The corner nearest to the tap is the one it is measured from; another corner can be tapped later.
      const tap = interiorStep.tap;
      const corner = nearestCorner(room, tap);
      const placed = (size) => {
        const outer = size + (kind === "storage" ? 0.2 : 0);
        const { offsetM, insetM } = snapAt(room, corner, tap, outer, outer);
        return fitStorageDoor({
          kind, wallIndex: corner, offsetM, insetM,
          widthM: size, depthM: size, partitionM: 0.1, doorWidthM: chosen.door ?? 0.8, doorWall: 2, name: chosen.name ?? "Кладовка",
        });
      };
      // At the tap, else from the corner; in a small room (a bathroom 1,5 m in a 1,5 m room) a smaller one first.
      // The real sizes are asked anyway.
      let next = null;
      for (const size of [1, 0.7, 0.5, 0.3].map((share) => round2(chosen.size * share))) {
        const values = placed(size);
        for (const candidate of [values, { ...values, offsetM: 0, insetM: 0 }, { ...values, offsetM: 0.3, insetM: 0.3 }]) {
          try {
            next = addInteriorToPackage(packageData, currentRoomIndex, candidate);
            break;
          } catch { /* the next place or size */ }
        }
        if (next) break;
      }
      if (!next) throw new Error("Здесь не помещается: места слишком мало. Коснитесь другого места комнаты.");
      packageData = next;
      const added = packageData.rooms[currentRoomIndex].interiors.at(-1);
      interiorStep = { step: firstInteriorStep(added), id: added.id };
    } else {
      const interior = stepInterior();
      if (!interior) return;
      // A storage turned into a bathroom (or back) takes its name, unless the technician named it otherwise.
      const name = kind === "storage" && (interior.kind !== "storage" || STORAGE_NAMES.includes(interior.name))
        ? chosen.name : interior.name;
      packageData = updateInteriorInPackage(packageData, currentRoomIndex, interior.id,
        fitStorageDoor({ ...interiorValues(room, interior), kind, name }));
      if (interiorStep.step === "partition" && kind !== "storage") interiorStep = null;
    }
    interiorKind = kind;
    clearError();
    renderInteriors();
    await persist();
  } catch (error) {
    showError(error);
  }
}
// The same object measured from another corner: its place stays, its distances become relative to that corner.
function reanchorInterior(room, interior, corner) {
  const frame = interiorFrame(room, corner);
  const project = (point) => {
    const relative = [point[0] - frame.corner[0], point[1] - frame.corner[1]];
    return [relative[0] * frame.unit[0] + relative[1] * frame.unit[1], relative[0] * frame.inward[0] + relative[1] * frame.inward[1]];
  };
  const contour = interiorPoints(room, interior);
  const projected = contour.map(project);
  const along = projected.map((point) => point[0]);
  const inward = projected.map((point) => point[1]);
  const partition = interior.kind === "storage" ? interior.partition_m : 0;
  const values = {
    ...interiorValues(room, interior),
    wallIndex: corner,
    offsetM: round2(Math.max(0, Math.min(...along))), insetM: round2(Math.max(0, Math.min(...inward))),
    widthM: round2(Math.max(...along) - Math.min(...along) - 2 * partition),
    depthM: round2(Math.max(...inward) - Math.min(...inward) - 2 * partition),
  };
  if (interior.kind === "storage") {
    // The door stays on the same side of the storage.
    const old = interior.door_wall;
    const doorMiddle = project([(contour[old][0] + contour[(old + 1) % 4][0]) / 2, (contour[old][1] + contour[(old + 1) % 4][1]) / 2]);
    const a = values.offsetM;
    const b = values.insetM;
    const w = values.widthM + 2 * partition;
    const d = values.depthM + 2 * partition;
    const middles = [[a + w / 2, b], [a + w, b + d / 2], [a + w / 2, b + d], [a, b + d / 2]];
    values.doorWall = middles.reduce((best, point, index) => (
      Math.hypot(point[0] - doorMiddle[0], point[1] - doorMiddle[1]) < Math.hypot(middles[best][0] - doorMiddle[0], middles[best][1] - doorMiddle[1]) ? index : best
    ), 0);
  }
  return fitStorageDoor(values);
}
function startInteriorVoice() {
  const field = INTERIOR_FIELDS[interiorStep?.step];
  if (!field) return;
  selectVoiceTargetById(field);
  startContextVoice();
}
function interiorAskText(room, interior) {
  const corner = room.walls.findIndex((wall) => wall.id === interior.wall_id);
  const count = room.walls.length;
  const a = cornerName(corner);
  return {
    offset: `Вдоль стены ${a}–${cornerName((corner + 1) % count)} ?`,
    inset: `Вдоль стены ${a}–${cornerName((corner + count - 1) % count)} ?`,
    width: `Ширина ${interiorGenitive(interior)} ?`,
    depth: `Глубина ${interiorGenitive(interior)} ?`,
    partition: "Перегородка ?",
  }[interiorStep.step];
}
function renderInteriors() {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  if (interiorStep?.id && !stepInterior()) interiorStep = null;
  const current = stepInterior();
  for (const button of interiorKindButtons) button.classList.toggle("active", button.dataset.interiorKind === interiorChoice(current));
  interiorKindButtons[0]?.parentElement?.classList.toggle("ask", interiorStep?.step === "kind");
  elements.interiorAskChip.hidden = !current;
  if (current) {
    elements.interiorAskChip.textContent = interiorAskText(room, current);
    elements.interiorAskChip.classList.remove("done");
  }
  elements.interiorCanvas.topReserve = reserveUnder(elements.interiorCanvas, elements.interiorAskChip);
  const map = canvasMap(elements.interiorCanvas, room);
  cancelAnimationFrame(interiorPulseFrame);
  const draw = () => {
    drawRoom(elements.interiorCanvas, room);
    const context = elements.interiorCanvas.getContext("2d");
    const phase = (Math.sin(Date.now() / 170) + 1) / 2;
    const dot = (point) => {
      const [x, y] = map.to(point);
      context.save();
      context.fillStyle = "#e5252a";
      context.shadowColor = "rgba(229, 37, 42, 0.85)";
      context.shadowBlur = 6 + 14 * phase;
      context.beginPath();
      context.arc(x, y, 9 + 5 * phase, 0, Math.PI * 2);
      context.fill();
      context.restore();
    };
    const line = (from, to) => strokeWallSegment(context, [...map.to(from), ...map.to(to)], true);
    if (interiorStep?.step === "kind") dot(interiorStep.tap);
    if (current) {
      // The corner it is measured from blinks, and so does the distance or side being asked.
      const frame = interiorFrame(room, room.walls.findIndex((wall) => wall.id === current.wall_id));
      const at = (along, inward) => [
        frame.corner[0] + frame.unit[0] * along + frame.inward[0] * inward,
        frame.corner[1] + frame.unit[1] * along + frame.inward[1] * inward,
      ];
      const contour = interiorPoints(room, current);
      if (interiorStep.step === "offset") line(at(0, 0), at(Math.max(current.offset_m, 0.12), 0));
      if (interiorStep.step === "inset") line(at(0, 0), at(0, Math.max(current.inset_m, 0.12)));
      if (interiorStep.step === "width") line(contour[0], contour[1]);
      if (interiorStep.step === "depth") line(contour[1], contour[2]);
      if (interiorStep.step === "partition") contour.forEach((point, index) => line(point, contour[(index + 1) % 4]));
      dot(frame.corner);
    }
    if (currentScreen === "interior" && interiorStep) interiorPulseFrame = requestAnimationFrame(draw);
  };
  draw();
  syncHint();
  elements.interiorList.replaceChildren();
  for (const interior of room.interiors ?? []) {
    const row = document.createElement("div");
    row.className = "opening-row";
    const text = document.createElement("span");
    const title = interior.kind === "storage" ? interior.name : interiorTypeName(interior.kind);
    const partition = interior.kind === "storage" ? ` · перегородка ${formatLength(interior.partition_m)} м` : "";
    const corner = cornerName(Math.max(room.walls.findIndex((wall) => wall.id === interior.wall_id), 0));
    text.textContent = `${title} ${formatLength(interior.width_m)} × ${formatLength(interior.depth_m)} м · от угла ${corner}: ${formatLength(interior.offset_m)} и ${formatLength(interior.inset_m)} м${partition}`;
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
    // "Изменить" walks the same steps again, starting from the distance from its corner.
    edit.addEventListener("click", () => {
      interiorStep = { step: "offset", id: interior.id, all: true };
      renderInteriors();
    });
    actions.append(edit, remove);
    row.append(text, actions);
    elements.interiorList.append(row);
  }
}

// The entrance door of the first room leads outside: there is no room behind it.
function isEntranceOpening(roomIndex, opening) {
  return roomIndex === 0 && opening?.kind === "door" && packageData?.rooms?.[0]?.openings?.[0]?.id === opening.id;
}
function stepOpening() {
  if (!openingStep?.id) return null;
  return packageData?.rooms?.[currentRoomIndex]?.openings?.find((item) => item.id === openingStep.id) ?? null;
}
// The piece of wall between a corner and the opening: the opening is anchored by its length.
function openingPiece(canvas, room, opening, side) {
  const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
  const length = room.walls[wallIndex].length_m;
  const piece = side === "start"
    ? { offset_m: 0, width_m: opening.offset_m }
    : { offset_m: opening.offset_m + opening.width_m, width_m: Math.max(0, length - opening.offset_m - opening.width_m) };
  return canvasWallSegment(canvas, room, wallIndex, piece);
}
// Windows are in the facade, often thicker than the stair wall with the entrance (Bolat, 06.10.2026, by an official
// plan): the first window of the flat asks its wall thickness once, every later window takes it and asks nothing.
// Doors and passages always ask: partitions are 0,1 or 0,15-0,25, each its own.
function knownWindowThickness(exceptId) {
  for (const room of packageData?.rooms ?? []) {
    for (const opening of room.openings ?? []) {
      if (opening.kind === "window" && opening.id !== exceptId && opening.wall_thickness_m > 0) return opening.wall_thickness_m;
    }
  }
  return null;
}
function openingWallIndex(room, opening) {
  return room.walls.findIndex((wall) => wall.id === opening.wall_id);
}
async function chooseOpeningKind(kind) {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  try {
    const chosenWall = openingStep?.step === "kind" ? room.walls[openingStep.wallIndex]
      : room.walls.find((wall) => wall.id === stepOpening()?.wall_id);
    if (kind === "balcony" && chosenWall && connectionsForWall(packageData, currentRoomIndex, chosenWall.id)
      .some((connection) => (connection.mode ?? "full_wall") === "full_wall")) {
      throw new Error("Балкон нельзя поставить на общей стене двух комнат.");
    }
    if (openingStep?.step === "kind") {
      const wall = room.walls[openingStep.wallIndex];
      const width = OPENING_DEFAULT_WIDTH[kind];
      const offset = Math.max(0, Math.round((wall.length_m - width) / 2 * 100) / 100);
      packageData = addOpeningToPackage(packageData, currentRoomIndex, {
        kind: kind === "balcony" ? "door" : kind,
        wallIndex: openingStep.wallIndex, offsetM: String(offset), widthM: String(width),
      });
      openingStep = { step: "side", id: packageData.rooms[currentRoomIndex].openings.at(-1).id, side: null, balcony: kind === "balcony" };
    } else {
      const opening = stepOpening();
      if (!opening) return;
      // The opening just placed can still change its kind; it keeps its middle on the wall.
      const wallIndex = openingWallIndex(room, opening);
      const length = room.walls[wallIndex].length_m;
      const width = OPENING_DEFAULT_WIDTH[kind];
      const middle = opening.offset_m + opening.width_m / 2;
      const offset = Math.min(Math.max(0, middle - width / 2), Math.max(0, length - width));
      packageData = updateOpeningInPackage(packageData, currentRoomIndex, opening.id, {
        kind: kind === "balcony" ? "door" : kind,
        wallIndex, offsetM: String(Math.round(offset * 1000) / 1000), widthM: String(width),
      });
      openingStep = { ...openingStep, balcony: kind === "balcony" };
      if (openingStep.step === "thickness" && (kind === "window" || kind === "balcony")) {
        finishOpeningPlacement(opening.id);
        return;
      }
    }
    openingKind = kind === "balcony" ? "door" : kind;
    clearError();
    renderOpenings();
    await persist();
  } catch (error) {
    showError(error);
  }
}
// The eraser: a tap on a distance written on the drawing asks only that number again, from the same corner.
function fixOpeningDistance(id, side) {
  const room = packageData?.rooms?.[currentRoomIndex];
  const opening = room?.openings?.find((item) => item.id === id);
  if (!opening) return;
  clearOpeningEdit(false);
  clearError();
  hideWallFix();
  balconyStep = null;
  // A door still without its thickness (↶ went back to its distance) goes on as a new one: thickness, then the room
  // behind it. One already finished is only moved.
  const finished = opening.wall_thickness_m > 0 || Boolean(connectionForOpening(packageData, currentRoomIndex, id));
  openingStep = { step: "side", id, side: null, editing: finished, distanceOnly: true, balcony: Boolean(balconyForOpening(room, id)) };
  startOpeningDistance(side);
}
function startOpeningDistance(side) {
  openingStep = { ...openingStep, side };
  elements.openingOffset.value = "";
  renderOpenings();
  schedulePersist();
  selectVoiceTargetById("openingOffset");
  startContextVoice();
}
// Placed and anchored: a window or balcony door takes a known window thickness; other openings ask for it.
function finishOpeningPlacement(id) {
  const room = packageData.rooms[currentRoomIndex];
  const opening = room.openings.find((item) => item.id === id);
  const balcony = Boolean(openingStep?.balcony || balconyForOpening(room, id));
  const windowThickness = knownWindowThickness(id);
  if ((opening.kind === "window" || balcony) && !(opening.wall_thickness_m > 0) && windowThickness) {
    packageData = setOpeningWallThickness(packageData, currentRoomIndex, id, String(windowThickness));
  }
  const placed = packageData.rooms[currentRoomIndex].openings.find((item) => item.id === id);
  const editing = Boolean(openingStep?.editing);
  openingStep = placed.wall_thickness_m > 0 ? null : { step: "thickness", id, editing, balcony };
  renderOpenings();
  persist();
  // Correcting a placed door only moves it; walking through is a tap on the door. A balcony door still without its
  // balcony asks the size even after a correction.
  const owesBalcony = balcony && !balconyForOpening(packageData.rooms[currentRoomIndex], id);
  if (!openingStep && placed.kind !== "window" && (!editing || owesBalcony)) afterOpeningThickness(id, true, balcony);
}
// With thickness known, an ordinary door opens its next room; a balcony door asks for its size here.
function afterOpeningThickness(id, placedNow = false, balconyPlaced = false) {
  if (!placedNow && (openingStep?.step !== "thickness" || openingStep.id !== id)) return;
  const editing = Boolean(openingStep?.editing);
  const balcony = balconyPlaced || Boolean(openingStep?.balcony);
  openingStep = null;
  const opening = packageData?.rooms?.[currentRoomIndex]?.openings?.find((item) => item.id === id);
  const owesBalcony = balcony && opening && !balconyForOpening(packageData.rooms[currentRoomIndex], id);
  if (!opening || (editing && !owesBalcony) || opening.kind === "window" || connectedRoomIndex(currentRoomIndex, id) >= 0) {
    renderOpenings();
    return;
  }
  if (balcony) {
    balconyStep = { openingId: id, asking: true };
    askBalconySize(false);
    persist();
    return;
  }
  persist().then(() => openAdjacent(currentRoomIndex, id));
}
// The room on the other side of a door, or -1 while nothing is measured behind it.
function connectedRoomIndex(roomIndex, openingId) {
  return roomAcrossOpening(packageData, roomIndex, openingId);
}
// Walking through a door (Bolat, 05.10.2026): into the room behind it if it is measured, otherwise measure it.
function goThroughOpening(roomIndex, openingId) {
  const behind = connectedRoomIndex(roomIndex, openingId);
  openingStep = null;
  if (balconyForOpening(packageData.rooms[roomIndex], openingId)) {
    currentRoomIndex = roomIndex;
    selectBalcony(openingId);
    return;
  }
  if (behind < 0) {
    openAdjacent(roomIndex, openingId);
    return;
  }
  clearOpeningEdit();
  currentRoomIndex = behind;
  showScreen("openings");
  persist();
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
  // The door distance was measured on the parent wall already. Its corners run in reverse on the new wall.
  const parentSide = openingAnchorSide(room, opening);
  elements.adjacentAnchorCorner.value = parentSide === "start" ? "end" : "start";
  elements.adjacentAnchorOffset.value = formatLength(openingDistance(room, opening, parentSide));
  showScreen("adjacent");
  schedulePersist();
  selectVoiceTargetById("adjacentSecondLength");
  setTimeout(startContextVoice, 0);
}
// A balcony behind a door (Bolat, 08.10.2026): «Балкон» on the screen of the room behind the door asks its size
// ("метр на два", the smaller number is how far it stands out); it stands in the middle of the door and is moved by a tap
// outside along the wall, where it stops against a wall that stands out.
function selectBalcony(openingId) {
  clearOpeningEdit(false);
  openingStep = null;
  balconyStep = { openingId, asking: false };
  if (currentScreen === "openings") renderOpenings();
  else showScreen("openings");
  schedulePersist();
}
function askBalconySize(listen = true) {
  if (!balconyStep) return;
  balconyStep = { ...balconyStep, asking: true };
  renderOpenings();
  if (!listen) return;
  if (voiceListening) stopContextVoice();
  selectVoiceTargetById("balconySize");
  if (voiceController.capability().available) startContextVoice();
  else {
    elements.balconyPrompt.hidden = true;
    elements.balconySize.hidden = false;
    elements.balconySize.focus();
  }
}
function syncBalcony(room) {
  // Placing or changing an opening ends the balcony's selection.
  if (openingStep) balconyStep = null;
  if (balconyStep && !room.openings.some((item) => item.id === balconyStep.openingId)) balconyStep = null;
  const balcony = balconyStep ? balconyForOpening(room, balconyStep.openingId) : null;
  if (balconyStep && !balconyStep.asking && !balcony) balconyStep = null;
  const inputOpen = Boolean(balconyStep?.asking && !elements.balconySize.hidden);
  elements.balconyActions.hidden = !balconyStep;
  elements.balconyPrompt.hidden = inputOpen;
  elements.balconySize.hidden = !inputOpen;
  elements.balconyPrompt.classList.toggle("asking", Boolean(balconyStep?.asking));
  elements.balconyRemoveButton.hidden = !balcony;
  elements.balconyText.textContent = balcony
    ? `Балкон ${balconyLabel(balcony)} ?` : "Балкон: сколько на сколько ?";
}
// Where along the wall of the selected balcony a tap outside the room is, or null when it is not on its side.
function balconyTapAlong(canvas, room, x, y) {
  const opening = room.openings.find((item) => item.id === balconyStep?.openingId);
  if (!opening || !balconyForOpening(room, opening.id)) return null;
  const outline = canvasRoomOutline(canvas, room);
  if (pointInPolygon([x, y], outline)) return null;
  const wallIndex = openingWallIndex(room, opening);
  const wall = room.walls[wallIndex];
  const [sx, sy, ex, ey] = canvasWallSegment(canvas, room, wallIndex, { offset_m: 0, width_m: wall.length_m });
  const out = canvasOutward(outline)([sx, sy], [ex, ey]);
  if ((x - sx) * out[0] + (y - sy) * out[1] <= 0) return null;
  return ((x - sx) * (ex - sx) + (y - sy) * (ey - sy)) / ((ex - sx) ** 2 + (ey - sy) ** 2 || 1) * wall.length_m;
}
function renderOpenings() {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const editingOpening = room.openings.find((item) => item.id === editingOpeningId);
  if (editingOpeningId && !editingOpening) clearOpeningEdit(false);
  if (elements.openingEditPanel) elements.openingEditPanel.hidden = !editingOpening;
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
  elements.addOpeningButton.disabled = false;
  const displayRoom = editingOpening
    ? { ...room, openings: room.openings.filter((item) => item.id !== editingOpeningId) }
    : room;

  if (openingStep?.id && !stepOpening()) openingStep = null;
  if (openingStep?.step === "kind" && !room.walls[openingStep.wallIndex]) openingStep = null;
  const guided = stepOpening();
  // With more than one room, the small plan in the corner shows where this room is; the drawing keeps clear of it.
  elements.openingOverviewCanvas.hidden = packageData.rooms.length < 2;
  if (!elements.openingOverviewCanvas.hidden) {
    elements.openingOverviewCanvas.highlightRoom = currentRoomIndex;
    drawPlan(elements.openingOverviewCanvas, packageData);
  }
  elements.openingCanvas.topReserve = reserveUnder(elements.openingCanvas, elements.openingOverviewCanvas);
  syncBalcony(room);
  elements.openingCanvas.selectedBalcony = balconyStep?.openingId ?? null;
  const previewOpening = balconyStep?.asking && !balconyForOpening(room, balconyStep.openingId)
    ? room.openings.find((item) => item.id === balconyStep.openingId) : null;
  elements.openingCanvas.previewBalcony = previewOpening ? {
    opening_id: previewOpening.id,
    door_offset_m: (2 - previewOpening.width_m) / 2,
    width_m: 2,
    depth_m: 1,
  } : null;
  cancelAnimationFrame(openingPulseFrame);
  const draw = () => {
    if (openingStep?.step === "kind" || guided) {
      // Guided steps: the chosen wall blinks while its content is asked; then the pieces beside the opening
      // blink in turn until one is tapped, then that piece alone.
      const asking = openingStep.step === "kind";
      drawRoom(elements.openingCanvas, room, asking ? openingStep.wallIndex : null, asking);
      // The opening whose distance is being asked has no number yet: it stands in the middle until it is said.
      drawOpeningDistances(elements.openingCanvas, room, openingStep.step === "side" ? guided?.id : null);
      if (openingStep.step === "side") {
        const side = openingStep.side ?? (Math.floor(Date.now() / 650) % 2 ? "end" : "start");
        strokeWallSegment(elements.openingCanvas.getContext("2d"), openingPiece(elements.openingCanvas, room, guided, side), true);
      }
      if (currentScreen === "openings" && openingStep?.step !== "thickness") openingPulseFrame = requestAnimationFrame(draw);
      return;
    }
    drawRoom(elements.openingCanvas, displayRoom, wallIndex, openingPlacementActive);
    drawOpeningDistances(elements.openingCanvas, displayRoom);
    if (openingPlacementActive) {
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

  const missingThickness = openingStep?.step === "thickness" ? guided
    : openingStep?.step === "width" ? null : latestOpeningWithoutThickness(room);
  // While the content of a wall is asked, its length can be said; a thickness owed elsewhere waits.
  const askingWall = openingStep?.step === "kind" ? room.walls[openingStep.wallIndex] : null;
  elements.wallLengthPrompt.hidden = !askingWall;
  if (askingWall) {
    const from = cornerName(openingStep.wallIndex);
    const to = cornerName((openingStep.wallIndex + 1) % room.walls.length);
    elements.wallLengthText.textContent = `Длина ${from}–${to}: ${formatLength(askingWall.length_m)} м ?`;
  }
  elements.openingThicknessPrompt.hidden = Boolean(askingWall) || (!missingThickness && openingStep?.step !== "width");
  if (openingStep?.step === "width" && guided) {
    elements.openingThicknessText.textContent = `Ширина ${OPENING_GENITIVE[guided.kind]} ?`;
  } else if (missingThickness) {
    const of = openingStep?.balcony && openingStep.id === missingThickness.id
      ? OPENING_GENITIVE.balcony : OPENING_GENITIVE[missingThickness.kind];
    elements.openingThicknessText.textContent = `Толщина стены у ${of} ?`;
  }
  // The kind buttons show the kind of the opening being placed, and all of them pulse while it is asked.
  const shownKind = openingStep?.balcony || (guided && balconyForOpening(room, guided.id))
    || (editingOpeningId && balconyForOpening(room, editingOpeningId)) ? "balcony"
    : guided?.kind ?? (editingOpeningId ? openingKind : null);
  for (const button of kindButtons) button.classList.toggle("active", button.dataset.kind === (shownKind ?? armedKind));
  kindButtons[0]?.parentElement?.classList.toggle("ask", openingStep?.step === "kind");
  syncHint();

  // Any room but the first can be removed with the rooms measured through it (the first one is "Новый замер").
  elements.removeRoomButton.hidden = currentRoomIndex === 0;
  elements.removeRoomButton.textContent = `Удалить комнату «${room.name}»`;
  elements.openingList.replaceChildren();
  for (const opening of room.openings) {
    const connection = connectionForOpening(packageData, currentRoomIndex, opening.id);
    const fullConnection = connectionsForWall(packageData, currentRoomIndex, opening.wall_id).some(
      (item) => (item.mode ?? "full_wall") === "full_wall",
    );
    const row = document.createElement("div");
    row.className = "opening-row";
    const text = document.createElement("span");
    // The distance is shown from the corner the technician tapped and measured from (Bolat, 05.10.2026);
    // openings from before that choice was kept count from the nearer corner.
    const wallIndex = Math.max(openingWallIndex(room, opening), 0);
    const side = openingAnchorSide(room, opening);
    const corner = cornerName(side === "end" ? (wallIndex + 1) % room.walls.length : wallIndex);
    text.textContent = `${typeName(opening.kind)} ${formatLength(opening.width_m)} м · от угла ${corner} ${formatLength(openingDistance(room, opening, side))} м · `;
    // The thickness is said again right here; the rooms behind the door move with it (Bolat, 06.10.2026).
    text.append(fixButton({
      type: "thickness", roomIndex: currentRoomIndex, openingId: opening.id, value: opening.wall_thickness_m ?? null,
      label: opening.wall_thickness_m > 0 ? `стена ${formatLength(opening.wall_thickness_m)} м` : "толщина ?",
    }));
    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (opening.kind !== "window" && !isEntranceOpening(currentRoomIndex, opening)) {
      const transition = document.createElement("button");
      transition.type = "button";
      transition.className = "secondary compact";
      // A door into a measured room leads there; one into an unmeasured room starts measuring it.
      const behind = connectedRoomIndex(currentRoomIndex, opening.id);
      transition.textContent = behind >= 0 ? `В «${packageData.rooms[behind].name}»`
        : balconyForOpening(room, opening.id) ? "Балкон" : "Войти";
      transition.addEventListener("click", () => goThroughOpening(currentRoomIndex, opening.id));
      actions.append(transition);
    }
    row.append(text, actions);
    elements.openingList.append(row);
    // Every opening can be corrected (Bolat, 06.10.2026): a door with a room behind it moves along its wall and
    // the room follows; only removing it would leave that room hanging.
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary compact";
    edit.textContent = "Изменить";
    edit.title = "Изменить проём";
    // "Изменить" walks the same steps as a new opening: the piece of wall, the distance, the width.
    edit.addEventListener("click", () => {
      // A balcony door whose size is not said yet is still a balcony door (Codex walk 08.10.2026: it became a room).
      const balcony = Boolean(balconyForOpening(room, opening.id)) || balconyStep?.openingId === opening.id;
      clearOpeningEdit(false);
      hideWallFix();
      openingStep = { step: "side", id: opening.id, side: null, editing: true, balcony };
      renderOpenings();
      schedulePersist();
      // The blinking piece is on the drawing above the list: bring it into view with the hint.
      (elements.hintCard.hidden ? elements.openingCanvas : elements.hintCard).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    actions.append(edit);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger compact";
    remove.textContent = "Удалить";
    remove.hidden = Boolean(connection);
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
  }
}
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
    value.count >= 3 && value.count <= MAX_SHAPE_WALLS && Array.isArray(value.walls) &&
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
  if (voiceMode !== "text") {
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
      add(createShapeField("thickness", "Толщина стен, м", { wide: true, voiceMode: "thickness", voiceLabel: "толщину стены" }));
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
  elements.shapeMoreButton.disabled = count >= MAX_SHAPE_WALLS;
  elements.shapeResetButton.hidden = false;
  elements.shapeResetButton.textContent = shapeState.context !== "adjacent" && packageData?.rooms?.length
    ? "Оставить комнату как была" : "Сделать комнату прямоугольной";
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
    shapeState = room && isPolygonRoom(room) && room.walls.length <= MAX_SHAPE_WALLS
      ? shapeStateFromRoom(room)
      : { ...newShapeState("first", elements.roomName.value || "Прихожая"), thickness: elements.wallThickness.value || PROVISIONAL_WALL_THICKNESS };
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
  // Only a problem is written under the drawing; what to do next is in the hint.
  elements.adjacentStatus.hidden = !validSizes || bindingComplete;
  elements.adjacentStatus.className = "message error";
  elements.adjacentStatus.textContent = "Нужна привязка этой стены к двери.";

  const previewWidth = first > 0 ? first : parentWall.length_m;
  const previewDepth = second > 0 ? second : Math.max(parentWall.length_m * 0.7, 1);
  const previewOffset = mismatch
    ? (Number.isFinite(childOffset) ? Math.max(0, Math.min(childOffset, previewWidth - opening.width_m)) : 0)
    : Math.max(0, previewWidth - opening.offset_m - opening.width_m);
  // The new room is drawn turned the way it will stand on the plan: its door wall faces the parent's.
  const oriented = createRectangleRoom({
    name: "preview", firstLengthM: previewWidth, secondLengthM: previewDepth,
    baseAngleDeg: ((parentWall.angle_deg ?? 0) + 180) % 360,
  });
  const previewSources = [
    mismatch ? "measured" : "inherited_shared", second > 0 ? "measured" : "unmeasured",
    "inferred_opposite", second > 0 ? "inferred_opposite" : "unmeasured",
  ];
  const preview = {
    ...oriented,
    walls: oriented.walls.map((wall, index) => ({ ...wall, id: "adjacent-preview-" + (index + 1), source: previewSources[index] })),
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
  // The new room is the highlighted one on the small plan.
  elements.adjacentOverviewCanvas.highlightRoom = overview ? overview.rooms.length - 1 : null;
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
    elements.adjacentStatus.hidden = false;
    elements.adjacentStatus.className = "message error";
    elements.adjacentStatus.textContent = shapeProblem;
    elements.createAdjacentButton.disabled = true;
  }
  // The drawing keeps clear of the plan overview in the corner (Bolat, 05.10.2026).
  const canvasBox = elements.adjacentCanvas.getBoundingClientRect();
  const insetBox = elements.adjacentOverviewCanvas.getBoundingClientRect();
  // topReserve: canvas y below which the room may be drawn (overview bottom plus room for the wall length label).
  elements.adjacentCanvas.topReserve = canvasBox.height && insetBox.height
    ? (insetBox.bottom - canvasBox.top) * elements.adjacentCanvas.height / canvasBox.height + 46
    : 0;
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
      false,
    );
    if (currentScreen === "adjacent" && activeWall !== null) adjacentPulseFrame = requestAnimationFrame(draw);
  };
  draw();
  syncHint();
}
const OPENING_OF = { door: "двери", window: "окна", passage: "проёма" };
const BEHIND_OPENING = { door: "дверью", passage: "проёмом" };
// What the app does not understand for the final plan, in words of the technician, each with its place
// on the plan, the screen where it is fixed and the numbers that can be said again right there
// (Bolat, 05-06.10.2026).
function problemIssue(pkg, problem) {
  const name = (index) => `«${pkg.rooms[index]?.name ?? `Помещение ${index + 1}`}»`;
  const opening = pkg.rooms[problem.roomIndex]?.openings?.find((item) => item.id === problem.openingId);
  const room = { type: "room", roomIndex: problem.roomIndex };
  const id = (index) => pkg.rooms[index]?.id ?? "";
  const key = [problem.kind, id(problem.roomIndex), id(problem.otherRoomIndex ?? problem.fromRoomIndex), problem.openingId ?? ""].join(":");
  const fixes = (problem.fixes ?? []).map((fix) => ({
    ...fix,
    label: fix.type === "wall" ? `${name(fix.roomIndex)} ${formatLength(fix.value)} м`
      : fix.type === "height" ? "высота ?" : "толщина ?",
  }));
  const text = (() => {
    switch (problem.kind) {
      case "no_door":
        return problem.roomIndex === 0
          ? "Нет входной двери: коснитесь стены, где она."
          : `${name(problem.roomIndex)}: нет двери — непонятно, как в неё войти. Коснитесь стены, где дверь.`;
      case "no_thickness":
        return `${name(problem.roomIndex)}: не названа толщина стены у ${OPENING_OF[opening?.kind] ?? "проёма"}. Нажмите и назовите её.`;
      case "door_leads_nowhere":
        return `${name(problem.roomIndex)}: за ${BEHIND_OPENING[opening?.kind] ?? "дверью"} ничего не обмерено — непонятно, что там. Обмерьте комнату за ней.`;
      case "door_missing_behind":
        return `${name(problem.roomIndex)}: из ${name(problem.fromRoomIndex)} сюда ведёт дверь, а здесь её нет. Поставьте её на этой стене.`;
      case "rooms_overlap":
        return `${name(problem.otherRoomIndex)} и ${name(problem.roomIndex)} налезают друг на друга. Нажмите неверный размер и назовите его заново.`;
      case "no_height":
        return "Не названа высота потолка — она пишется на плане. Нажмите и назовите её.";
      case "thin_wall":
        return `Стена между ${name(problem.otherRoomIndex)} и ${name(problem.roomIndex)} получается ${Math.max(0, Math.round(problem.gap_m * 100))} см — так не бывает. Нажмите неверный размер и назовите его заново.`;
      default:
        return "Непонятное место на плане.";
    }
  })();
  const action = problem.kind === "door_leads_nowhere"
    ? { type: "door", roomIndex: problem.roomIndex, openingId: problem.openingId }
    : ["no_thickness", "no_height"].includes(problem.kind) ? null : room;
  return { key, text, action, fixes };
}
function validationIssues(pkg) {
  const issues = [];
  try {
    validatePackage(pkg);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    issues.push({ key: "invalid:" + text, text, action: /^Адрес/.test(text) ? { type: "address" } : null, fixes: [] });
    return issues;
  }
  for (const problem of planProblems(pkg)) issues.push({ ...problemIssue(pkg, problem), point: problem.point });
  const seen = new Set();
  return issues.filter((issue) => !seen.has(issue.key) && seen.add(issue.key));
}
// Every warning leads to the place where it is fixed; from there a button returns to the remarks.
function followIssue(action) {
  returnToIssues = true;
  if (action.type === "address") {
    startMode = "new";
    showScreen("start");
    elements.address.value = packageData?.address ?? "";
    elements.startButton.disabled = !elements.address.value.trim();
    elements.address.focus();
  } else if (action.type === "room") {
    currentRoomIndex = action.roomIndex;
    clearOpeningEdit();
    showScreen("openings");
  } else if (action.type === "door") {
    goThroughOpening(action.roomIndex, action.openingId);
  }
  persist();
}
// A number in a remark is said again on the spot (Bolat, 06.10.2026): the microphone opens on it, and the
// whole plan is rebuilt for the new value.
// A corrected wall keeps every opening's distance from the start corner of its wall. An opening the technician
// measured from the other corner (`openingAnchors` "end") keeps that distance instead: the plan still says what was
// measured ("окно 0,50 от угла D" stays 0,50 after the wall is made longer).
function keepEndAnchors(before, after) {
  let next = after;
  after.rooms.forEach((room, roomIndex) => {
    const old = before.rooms.find((item) => item.id === room.id);
    if (!old) return;
    for (const opening of room.openings) {
      if (openingAnchors[opening.id] !== "end") continue;
      const wallIndex = room.walls.findIndex((wall) => wall.id === opening.wall_id);
      const oldWall = old.walls.find((wall) => wall.id === opening.wall_id);
      const oldOpening = old.openings.find((item) => item.id === opening.id);
      const length = room.walls[wallIndex]?.length_m;
      if (!oldWall || !oldOpening || Math.abs(length - oldWall.length_m) < 1e-9) continue;
      const fromEnd = oldWall.length_m - oldOpening.offset_m - oldOpening.width_m;
      const offset = Math.round((length - fromEnd - opening.width_m) * 1000) / 1000;
      try {
        next = updateOpeningInPackage(next, roomIndex, opening.id, {
          kind: opening.kind, wallIndex, offsetM: String(offset), widthM: String(opening.width_m),
        });
      } catch {
        // It no longer fits from that corner: it stays where the corrected wall put it.
      }
    }
  });
  return next;
}
async function applyFix(fix, raw) {
  const value = decimal(raw);
  if (!(value > 0)) return;
  const room = packageData.rooms[fix.roomIndex];
  const incoming = packageData.connections.find((item) => item.room_b_id === room?.id && (item.mode ?? "full_wall") === "full_wall");
  const parentSide = incoming ? openingAnchors[incoming.opening_a_id] : undefined;
  try {
    packageData = fix.type === "wall" ? keepEndAnchors(packageData, setWallLength(packageData, fix.roomIndex, fix.wallIndex, String(value), { parentSide }))
      : fix.type === "height" ? setCeilingHeight(packageData, String(value))
      : fix.type === "angle" ? keepEndAnchors(packageData, setCornerAngle(packageData, fix.roomIndex, fix.corner, String(value)))
      : fix.type === "wallThickness" ? setWallThickness(packageData, fix.roomIndex, fix.wallIndex, spokenMeasurement(raw, "thickness"))
      : setOpeningWallThickness(packageData, fix.roomIndex, fix.openingId, String(value));
    clearError();
  } catch (error) {
    showError(error);
  }
  if (currentScreen === "done") renderSummary();
  else if (currentScreen === "openings") renderOpenings();
  await persist();
}
function fixButton(fix) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fix-number";
  button.textContent = fix.label;
  button.addEventListener("click", () => {
    const input = document.createElement("input");
    input.className = "fix-input";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.value = fix.value ? formatLength(fix.value) : "";
    const what = { wall: ["Новая длина стены, м", "measurement", "новую длину стены"],
      height: ["Высота потолка, м", "measurement", "высоту потолка"],
      thickness: ["Толщина стены", "thickness", "толщину стены"] }[fix.type];
    input.setAttribute("aria-label", what[0]);
    input.addEventListener("change", () => applyFix(fix, input.value));
    button.replaceWith(input);
    selectVoiceTarget(input, what[1], what[2]);
    if (voiceController.capability().available) startContextVoice();
    else input.focus();
  });
  return button;
}
function issueRows(issues) {
  const current = new Map(issues.map((issue) => [issue.key, issue]));
  const baseline = issueBaseline ?? [];
  const rows = baseline.map((item) => current.get(item.key) ?? { ...item, resolved: true });
  for (const issue of issues) if (!baseline.some((item) => item.key === issue.key)) rows.push(issue);
  return rows;
}
function renderSummary() {
  if (!packageData?.rooms?.length) return;
  elements.summaryAddress.textContent = packageData.address;
  const issues = validationIssues(packageData);
  // After "Закончить замер" the survey finishes by itself once the last remark is fixed.
  if (issueBaseline && !issues.length && confirmedPlan !== planSignature(packageData)) {
    confirmedPlan = planSignature(packageData);
    schedulePersist();
  }
  // "Отличная работа" and the green plan only after "Готово", for exactly the plan that was confirmed
  // (Bolat, 05.10.2026); passing by the plan on the way is not the end of the survey.
  const finished = issues.length === 0 && confirmedPlan === planSignature(packageData);
  const rows = issueRows(issues);
  elements.planCanvas.planReady = finished;
  // Every place the app does not understand is numbered on the whole plan, the same number as in the list.
  elements.planCanvas.problemPoints = rows.map((row) => row.resolved ? null : row.point ?? null);
  drawPlan(elements.planCanvas, packageData, planView);
  elements.validationPanel.hidden = !rows.length && !finished;
  elements.validationPanel.classList.toggle("ready", issues.length === 0);
  elements.validationPanel.classList.toggle("needs-work", issues.length > 0);
  elements.validationTitle.textContent = issues.length
    ? `Непонятно для плана: ${issues.length}. Места отмечены на плане номерами.`
    : rows.length ? "Отличная работа! Всё исправлено, план готов." : "Отличная работа! План готов без замечаний.";
  elements.validationList.replaceChildren();
  for (const [index, row] of rows.entries()) {
    const item = document.createElement("li");
    const number = `${index + 1}. `;
    if (row.resolved) {
      // Fixed since "Закончить замер": struck through, so the technician sees what he has done.
      item.className = "resolved";
      const text = document.createElement("s");
      text.textContent = number + row.text;
      item.append(text, " — исправлено ✓");
    } else {
      const text = document.createElement("p");
      text.className = "issue-text";
      text.textContent = number + row.text;
      item.append(text);
      if (row.fixes?.length) {
        const numbers = document.createElement("div");
        numbers.className = "fix-numbers";
        for (const fix of row.fixes) numbers.append(fixButton(fix));
        item.append(numbers);
      }
      if (row.action) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "issue-link";
        link.textContent = row.action.type === "door" ? "Обмерить комнату за дверью →" : "Открыть это место →";
        link.addEventListener("click", () => followIssue(row.action));
        item.append(link);
      }
    }
    elements.validationList.append(item);
  }
  // A named ceiling height is shown under the plan and said again by a tap.
  elements.summaryHeight.replaceChildren();
  elements.summaryHeight.hidden = !(packageData.ceiling_height_m > 0);
  if (packageData.ceiling_height_m > 0) {
    elements.summaryHeight.append("Высота потолка ", fixButton({
      type: "height", value: packageData.ceiling_height_m, label: `${formatLength(packageData.ceiling_height_m)} м`,
    }));
  }
  elements.shareButton.disabled = issues.length > 0;
  if (finished && celebratedRevision !== packageData.updated_at) {
    celebratedRevision = packageData.updated_at;
    if (navigator.vibrate) navigator.vibrate([55, 35, 85]);
  }
}
// A wall length tapped on the doors screen is said again; the room and every room behind it are rebuilt.
let wallFix = null;
// One question at a time: a new step closes the wall length that was opened and not answered.
function hideWallFix() {
  wallFix = null;
  elements.wallFixBar.hidden = true;
}
function startWallThicknessFix(wallIndex) {
  const room = packageData.rooms[currentRoomIndex];
  hideWallFix();
  openingStep = null;
  wallFix = { type: "wallThickness", roomIndex: currentRoomIndex, wallIndex,
    value: wallThickness(room, room.walls[wallIndex]) };
  elements.wallFixLabel.textContent = "Стена " + cornerName(wallIndex) + "–" +
    cornerName((wallIndex + 1) % room.walls.length) + ", толщина (см или м):";
  elements.wallFixInput.value = formatLength(wallFix.value);
  elements.wallFixBar.hidden = false;
  selectVoiceTarget(elements.wallFixInput, "thickness",
    "толщину стены " + cornerName(wallIndex) + "–" + cornerName((wallIndex + 1) % room.walls.length));
  if (voiceController.capability().available) startContextVoice();
  else elements.wallFixInput.focus();
}
function startWallFix(wallIndex) {
  const room = packageData.rooms[currentRoomIndex];
  wallFix = { type: "wall", roomIndex: currentRoomIndex, wallIndex, value: room.walls[wallIndex].length_m };
  elements.wallFixLabel.textContent = `Стена ${cornerName(wallIndex)}–${cornerName((wallIndex + 1) % room.walls.length)}, новая длина, м:`;
  elements.wallFixInput.value = formatLength(wallFix.value);
  elements.wallFixBar.hidden = false;
  selectVoiceTarget(elements.wallFixInput, "measurement",
    `новую длину стены ${cornerName(wallIndex)}–${cornerName((wallIndex + 1) % room.walls.length)}`);
  if (voiceController.capability().available) startContextVoice();
  else elements.wallFixInput.focus();
}
// A corner of a free-form room tapped by its letter is said again in degrees; corner A follows from the others.
function startAngleFix(corner) {
  const room = packageData.rooms[currentRoomIndex];
  if (corner === 0) {
    hideWallFix();
    showNotice("Угол A считается сам из остальных углов: исправьте соседний угол.");
    return;
  }
  wallFix = { type: "angle", roomIndex: currentRoomIndex, corner, value: roomInteriorAngles(room)[corner] };
  elements.wallFixLabel.textContent = `Угол ${cornerName(corner)}, градусов:`;
  elements.wallFixInput.value = String(Math.round(wallFix.value * 10) / 10).replace(".", ",");
  elements.wallFixBar.hidden = false;
  selectVoiceTarget(elements.wallFixInput, "angle", `угол ${cornerName(corner)} в градусах`);
  if (voiceController.capability().available) startContextVoice();
  else elements.wallFixInput.focus();
}
elements.removeRoomButton.addEventListener("click", async () => {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room || currentRoomIndex === 0) return;
  const behind = roomsBehind(packageData, currentRoomIndex).map((index) => `«${packageData.rooms[index].name}»`);
  const more = behind.length ? `

Вместе с ней уйдут комнаты, обмеренные через неё: ${behind.join(", ")}.` : "";
  if (!confirm(`Удалить «${room.name}»?${more}

Дверь в неё останется. Удалили не то — стрелка ↶ вверху вернёт.`)) return;
  try {
    const parentId = packageData.connections.find((item) => item.room_b_id === room.id)?.room_a_id;
    packageData = removeRoomFromPackage(packageData, currentRoomIndex);
    currentRoomIndex = Math.max(0, packageData.rooms.findIndex((item) => item.id === parentId));
    clearOpeningEdit();
    showScreen("openings");
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.issuesReturnButton.addEventListener("click", () => {
  clearOpeningEdit();
  pendingAdjacent = null;
  showScreen("done");
  persist();
});
elements.wallFixInput.addEventListener("change", async () => {
  if (!wallFix) return;
  const fix = wallFix;
  wallFix = null;
  elements.wallFixBar.hidden = true;
  await applyFix(fix, elements.wallFixInput.value);
});
// Back to the remarks from the screen a remark opened, with how many are left.
function syncIssuesReturn() {
  const visible = Boolean(returnToIssues && issueBaseline && packageData?.rooms?.length && currentScreen !== "done");
  elements.issuesReturnButton.hidden = !visible;
  if (!visible) return;
  const left = validationIssues(packageData).length;
  elements.issuesReturnButton.textContent = left
    ? `← К замечаниям: осталось ${left}`
    : "← К плану: всё исправлено ✓";
}
function recordDate(record) {
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
    // Opens where the work stopped; a finished plan opens as finished.
    workScreen: record.workScreen ?? "openings",
    confirmedPlan: record.confirmedPlan ?? null,
    // The remarks of "Закончить замер" and the first-room steps come back with the object, as after a restart.
    issueBaseline: record.issueBaseline ?? null,
    entrance: record.entrance ?? null,
    openingAnchors: record.openingAnchors ?? {},
    form: record.form ?? {},
  };
}

async function openSurveyRecord(record) {
  if (!record.package?.rooms?.length) {
    // Nothing measured yet: the object opens where its work stopped, on the first room.
    const draft = { ...record };
    delete draft.storage_kind;
    delete draft.saved_at;
    await saveDraft(draft);
    restoreForm(draft);
    packageData = draft.package;
    currentRoomIndex = 0;
    showScreen("room");
    return;
  }
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
  resumeWork();
  setSaveStatus("Открыт сохранённый объект");
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
    details.textContent = recordDate(record) + (record.package.rooms.length
      ? " · комнат: " + record.package.rooms.length : " · замер не начат") +
      (hasRemarks(record) ? " · есть замечания" : "");
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
          syncHeaderTitle();
        }
        await renderSurveyCatalog();
        setSaveStatus("Сохранённый объект удалён");
      } catch (error) {
        showError(error);
      }
    });
    actions.append(open, remove);
    row.append(text, actions);
    elements.surveyList.append(row);
  }

  const today = surveysForLocalDay(records);
  const unfinished = today.filter(hasRemarks).length;
  elements.shareTodayButton.disabled = today.length === 0;
  elements.shareTodayButton.textContent = today.length
    ? `Поделиться за сегодня: ${today.length} (ZIP)` + (unfinished ? ` · с замечаниями: ${unfinished}` : "")
    : "Сегодняшних замеров для ZIP пока нет";
}

async function deliverFile(blob, name, title, text, successMessage) {
  const file = typeof File === "function"
    ? new File([blob], name, { type: blob.type })
    : null;
  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, text, files: [file] });
      setSaveStatus(successMessage);
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
  setSaveStatus(successMessage);
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
    const json = JSON.stringify(withExplicitWallThickness(inferPartitionThickness(packageData)), null, 2);
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
  if (keptInCatalog(packageData)) await saveSurvey(draftValue());
  await clearDraft();
  packageData = null;
  currentRoomIndex = 0;
  pendingAdjacent = null;
  restoreForm(null);
  showScreen("start");
  setSaveStatus(message);
}

elements.address.addEventListener("input", () => {
  syncHeaderTitle();
  elements.startButton.disabled = !elements.address.value.trim();
  syncRememberAddress();
  schedulePersist();
});
for (const input of [elements.firstLength, elements.secondLength]) {
  input.addEventListener("change", () => {
    const tap = roomOppositeTap;
    if (!tap || elements[tap.field] !== input || currentScreen !== "room") return;
    roomOppositeTap = null;
    const given = decimal(input.value);
    if (!(given > 0) || Math.abs(given - decimal(tap.baseline)) < 0.005) return;
    // The opposite wall differs: hand over to the free-form room screen, keeping what was measured.
    const text = (value) => String(value).replace(".", ",");
    const first = text(decimal(elements.firstLength.value));
    const second = text(decimal(elements.secondLength.value));
    const walls = [first, second, first, second];
    walls[tap.wallIndex] = text(given);
    input.value = tap.baseline;
    openShape("first");
    shapeState = { ...shapeState, count: 4, walls, angles: ["", "90", "90", "90"], active: null };
    showScreen("shape");
  });
}
// The door wall's length is known: the door appears in its middle and the pieces beside it start blinking.
elements.firstLength.addEventListener("change", () => {
  if (currentScreen !== "room" || entrance.step !== "wall" || !(decimal(elements.firstLength.value) > 0)) return;
  entrance.step = "anchor";
  entrance.side = null;
  activeRoomWall = null;
  renderRoomInput();
  refreshVoiceTarget();
  schedulePersist();
});
function entranceWallLength() {
  return decimal(elements[entrance.wall % 2 === 0 ? "firstLength" : "secondLength"].value);
}
elements.doorAnchor.addEventListener("change", () => {
  if (currentScreen !== "room" || entrance.step !== "anchor") return;
  const value = decimal(elements.doorAnchor.value);
  if (!Number.isFinite(value) || value < 0 || !String(elements.doorAnchor.value).trim()) return;
  const length = entranceWallLength();
  if (length > 0 && value + ENTRANCE_WIDTH_M > length + 1e-9) {
    showError(`Дверь не помещается: от угла ${formatLength(value)} м, а вся стена ${formatLength(length)} м. Назовите расстояние ещё раз.`);
    return;
  }
  clearError();
  // Dictated through the plain microphone button without picking a piece: count from the left corner.
  entrance.side ??= "start";
  entrance.anchor = value;
  if (entrance.thickness) {
    // A distance asked again after a misfit: thickness is known, the walls may be too.
    entrance.step = "measure";
    activeRoomWall = (entrance.wall + 1) % 4;
    renderRoomInput();
    refreshVoiceTarget();
    if (decimal(elements.firstLength.value) > 0 && decimal(elements.secondLength.value) > 0) saveRoomFromForm();
    schedulePersist();
    return;
  }
  // Next comes the red "Толщина ?": the technician taps it and names the thickness.
  entrance.step = "thickness";
  activeRoomWall = null;
  renderRoomInput();
  selectVoiceTargetById("wallThickness");
  schedulePersist();
});
function hideThicknessChip() {
  clearTimeout(thicknessChipTimer);
  elements.thicknessChip.hidden = true;
  // The drawing gets back the room the chip took.
  if (currentScreen === "room") renderRoomInput();
}
elements.thicknessChip.addEventListener("click", (event) => {
  event.stopPropagation();
  if (entrance.step !== "thickness") {
    hideThicknessChip();
    return;
  }
  selectVoiceTargetById("wallThickness");
  startContextVoice();
});
// Any tap removes the green "Толщина 0,40 м" before its time.
document.addEventListener("pointerdown", (event) => {
  if (entrance.step !== "thickness" && !elements.thicknessChip.hidden && event.target !== elements.thicknessChip) hideThicknessChip();
}, true);
elements.wallThickness.addEventListener("change", () => {
  if (currentScreen !== "room" || entrance.step !== "thickness" || !(decimal(elements.wallThickness.value) > 0)) return;
  entrance.thickness = elements.wallThickness.value;
  entrance.step = "measure";
  // The door wall is already measured: the wall next to it blinks now.
  activeRoomWall = entranceWallLength() > 0 ? (entrance.wall + 1) % 4 : entrance.wall;
  renderRoomInput();
  elements.thicknessChip.textContent = `Толщина ${formatLength(decimal(entrance.thickness))} м`;
  elements.thicknessChip.classList.add("done");
  elements.thicknessChip.hidden = false;
  clearTimeout(thicknessChipTimer);
  thicknessChipTimer = setTimeout(hideThicknessChip, 4000);
  refreshVoiceTarget();
  schedulePersist();
});
// The thickness asked on the doors screen goes to the opening being placed, otherwise to the latest one without it.
// Applied once the value is complete (dictated, or typed and confirmed), never per keystroke: typing "0,12" set 0,1
// and walked into the next room before the "2", and typing "12" set a 1 m wall.
elements.wallThickness.addEventListener("change", () => {
  if (currentScreen !== "openings" || !(decimal(elements.wallThickness.value) > 0)) return;
  const room = packageData?.rooms?.[currentRoomIndex];
  const missing = (openingStep?.step === "thickness" ? stepOpening() : null) ?? latestOpeningWithoutThickness(room);
  if (!missing) return;
  try {
    // Typed the way it is said: "12" is 12 cm, "0,12" stays 0,12.
    const thickness = spokenMeasurement(elements.wallThickness.value, "thickness");
    packageData = setOpeningWallThickness(packageData, currentRoomIndex, missing.id, thickness);
  } catch (error) {
    showError(`${error instanceof Error ? error.message : error} Назовите ещё раз.`);
    return;
  }
  clearError();
  renderOpenings();
  schedulePersist();
  afterOpeningThickness(missing.id);
});
// Both walls known: go straight to doors and windows, no "continue" button.
for (const input of [elements.firstLength, elements.secondLength]) {
  input.addEventListener("change", () => {
    if (currentScreen !== "room") return;
    if (entrance.step === "measure" && decimal(elements.firstLength.value) > 0 && decimal(elements.secondLength.value) > 0) saveRoomFromForm();
  });
}
for (const input of [elements.roomName, elements.firstLength, elements.secondLength, elements.wallThickness]) {
  input.addEventListener("input", () => {
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
    // In the guided steps the distance is applied by its own "change" handler, never as a new opening.
    if (openingStep) return;
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
  if (openingStep) {
    chooseOpeningKind(button.dataset.kind);
    return;
  }
  if (!editingOpeningId) {
    // Nothing is being placed: the button is taken like a pencil, the next tap on a wall puts it there.
    armedKind = armedKind === button.dataset.kind ? null : button.dataset.kind;
    for (const item of kindButtons) item.classList.toggle("active", item.dataset.kind === armedKind);
    if (armedKind) {
      const what = { door: "дверь", window: "окно", passage: "проём", balcony: "дверь балкона" }[armedKind];
      showNotice(`Теперь коснитесь стены, где ${what}.`);
    }
    return;
  }
  openingPlacementActive = true;
  setKind(button.dataset.kind === "balcony" ? "door" : button.dataset.kind);
});
for (const button of interiorKindButtons) button.addEventListener("click", () => {
  if (!interiorStep) {
    showError("Сначала нажмите внутрь комнаты, где это находится.");
    return;
  }
  chooseInteriorKind(button.dataset.interiorKind);
});
// A dictated or typed distance or size of the object being placed: apply it and go to the next question.
for (const [step, field] of Object.entries(INTERIOR_FIELDS)) {
  elements[field].addEventListener("change", async () => {
    if (interiorStep?.step !== step) return;
    const room = packageData?.rooms?.[currentRoomIndex];
    const interior = stepInterior();
    if (!room || !interior) return;
    const value = decimal(elements[field].value);
    const positive = step === "width" || step === "depth" || step === "partition";
    if (!Number.isFinite(value) || value < 0 || (positive && !(value > 0)) || !String(elements[field].value).trim()) return;
    try {
      packageData = updateInteriorInPackage(packageData, currentRoomIndex, interior.id,
        fitStorageDoor({ ...interiorValues(room, interior), [INTERIOR_KEYS[step]]: value }));
    } catch (error) {
      showError(`${error instanceof Error ? error.message : error} Назовите ещё раз.`);
      return;
    }
    clearError();
    // Against a wall the distance to it is zero and not asked, unless every question was asked for ("Изменить").
    const all = Boolean(interiorStep.all);
    const next = INTERIOR_STEPS.slice(INTERIOR_STEPS.indexOf(step) + 1)
      .find((item) => (item !== "partition" || interior.kind === "storage") && (item !== "inset" || all || interior.inset_m > 0));
    interiorStep = next ? { step: next, id: interior.id, all } : null;
    if (!next) {
      // Everything about it is said: back to the room, where the next tap inside places the next one.
      showScreen("openings");
      const title = interior.kind === "storage" ? interior.name || "Кладовка" : interior.kind === "column" ? "Колонна" : "Готово";
      showNotice(`${title} — на плане. Ещё что-то внутри — коснитесь места в комнате.`);
      await persist();
      return;
    }
    renderInteriors();
    await persist();
  });
}
elements.interiorAskChip.addEventListener("click", (event) => {
  event.stopPropagation();
  startInteriorVoice();
});
elements.interiorCanvas.addEventListener("click", async (event) => {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const bounds = elements.interiorCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.interiorCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.interiorCanvas.height / bounds.height;
  const map = canvasMap(elements.interiorCanvas, room);
  const corners = roomPoints(room).slice(0, -1).map((point) => map.to(point));
  const nearCorner = corners.findIndex((point) => Math.hypot(point[0] - x, point[1] - y) < 44);
  // A tap outside the room is the way back to its doors and windows (there is no ← any more, Bolat 08.10.2026);
  // a tap inside by mistake is undone the same way.
  if (nearCorner < 0 && !pointInPolygon([x, y], corners)) {
    if (voiceListening) stopContextVoice();
    clearInteriorEdit();
    showScreen("openings");
    persist();
    return;
  }
  const current = stepInterior();
  if (current) {
    const base = room.walls.findIndex((wall) => wall.id === current.wall_id);
    if (nearCorner >= 0 && nearCorner !== base) {
      // Measured from another corner: the object stays, the distances are asked from that corner.
      try {
        packageData = updateInteriorInPackage(packageData, currentRoomIndex, current.id, reanchorInterior(room, current, nearCorner));
        interiorStep = { step: "offset", id: current.id, all: true };
        renderInteriors();
        await persist();
      } catch (error) {
        showError(error);
      }
      return;
    }
    // Standing elsewhere: a tap in the room where it really is moves it there, against the wall near the tap, and the
    // questions start again for the new place. A tap on the object itself opens the microphone.
    const contour = interiorPoints(room, current).map((item) => map.to(item));
    if (!pointInPolygon([x, y], contour) && pointInPolygon([x, y], corners)) {
      try {
        const tap = map.from(x, y);
        const corner = nearestCorner(room, tap);
        const turned = corner === base ? interiorValues(room, current) : reanchorInterior(room, current, corner);
        const partition = current.kind === "storage" ? (current.partition_m ?? 0.1) : 0;
        const spot = snapAt(room, corner, tap, Number(turned.widthM) + 2 * partition, Number(turned.depthM) + 2 * partition);
        // Its door keeps its side, unless that side now stands against a wall (moved into another corner): then the
        // door goes to a free side, the one facing into the room first. Before, such a move said "не помещается".
        const sides = current.kind === "storage" ? [...new Set([turned.doorWall, 2, 1, 3, 0])] : [turned.doorWall];
        let moved = null;
        for (const doorWall of sides) {
          try {
            moved = updateInteriorInPackage(packageData, currentRoomIndex, current.id,
              fitStorageDoor({ ...turned, wallIndex: corner, ...spot, doorWall }));
            break;
          } catch { /* the next side */ }
        }
        if (!moved) throw new Error("no place");
        packageData = moved;
        interiorStep = { step: firstInteriorStep(stepInterior()), id: current.id };
        clearError();
        renderInteriors();
        await persist();
      } catch {
        showError("Здесь не помещается. Коснитесь другого места комнаты.");
      }
      return;
    }
    startInteriorVoice();
    return;
  }
  // A tap on a side of a storage moves its door there.
  const point = map.from(x, y);
  for (const interior of room.interiors ?? []) {
    if (interior.kind !== "storage") continue;
    const contour = interiorPoints(room, interior).map((item) => map.to(item));
    const side = contour.findIndex((item, index) => distanceToCanvasSegment(x, y, item, contour[(index + 1) % 4]) < 22);
    if (side >= 0) {
      if (side !== interior.door_wall) {
        try {
          packageData = updateInteriorInPackage(packageData, currentRoomIndex, interior.id,
            fitStorageDoor({ ...interiorValues(room, interior), doorWall: side }));
          renderInteriors();
          await persist();
        } catch (error) {
          showError(error);
        }
      }
      return;
    }
  }
  if (nearCorner < 0 && pointInPolygon([x, y], corners)) startInteriorAt(point);
});

elements.startButton.addEventListener("click", async () => {
  try {
    // A typed address gets the same form as a dictated one: "Спартака 2 41" -> "Спартака д 2 кв 41".
    elements.address.value = spokenAddress(elements.address.value) || elements.address.value.trim();
    addressDictation = null;
    elements.rememberAddressButton.hidden = true;
    if (editingAddress()) {
      // "Сохранить адрес": the current object keeps its plan and gets the corrected address.
      packageData.address = elements.address.value;
      packageData.updated_at = new Date().toISOString();
      resumeWork();
      await persist();
      return;
    }
    // "Начать" starts a new object; an old draft without an address is never reused (it once showed
    // someone else's bare rectangle as a finished plan).
    packageData = createPackage(elements.address.value);
    // A new object never inherits the previous room's sizes.
    elements.firstLength.value = "";
    elements.secondLength.value = "";
    elements.wallThickness.value = "";
    elements.roomName.value = "Прихожая";
    entrance = newEntrance();
    confirmedPlan = null;
    issueBaseline = null;
    returnToIssues = false;
    openingAnchors = {};
    elements.doorAnchor.value = "";
    activeRoomWall = 0;
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
function confirmFirstRoomReplacement() {
  const hasMeasuredWork = packageData.rooms.length > 1 || packageData.rooms[0]?.openings?.length ||
    packageData.rooms[0]?.interiors?.length;
  return !hasMeasuredWork ||
    confirm("Изменение первой комнаты удалит её проёмы и все связанные комнаты. Продолжить?");
}
async function saveFirstRoom(room) {
  const withDoor = entrance.step === "measure" && entrance.anchor !== null;
  const length = withDoor ? room.walls[entrance.wall].length_m : 0;
  const offset = withDoor ? Math.round(entranceOffset(length) * 1000) / 1000 : 0;
  // Checked before the room is stored: a failed door must not leave a doorless room behind.
  if (withDoor && (offset < 0 || offset + ENTRANCE_WIDTH_M > length + 1e-9)) {
    throw new Error("Дверь не помещается: расстояние от неё до стены больше самой стены.");
  }
  packageData.rooms = [room];
  packageData.connections = [];
  // The address belongs to the object since "Начать"; only "Сохранить адрес" changes it, never an unsaved field.
  packageData.updated_at = new Date().toISOString();
  currentRoomIndex = 0;
  pendingAdjacent = null;
  pendingShape = null;
  validatePackage(packageData);
  if (withDoor) {
    packageData = addOpeningToPackage(packageData, 0, {
      kind: "door",
      wallIndex: entrance.wall,
      offsetM: String(offset),
      widthM: String(ENTRANCE_WIDTH_M),
    });
    const door = packageData.rooms[0].openings.at(-1);
    if (entrance.thickness) packageData = setOpeningWallThickness(packageData, 0, door.id, entrance.thickness);
    openingAnchors = { [door.id]: entrance.side ?? "start" };
  }
  showScreen("openings");
  await persist();
}
// The first room is already measured: a wall said again on its screen is a correction (Bolat, 06.10.2026: any number
// can be fixed and the plan follows), never a new room that would drop its doors, windows and the rooms behind them.
function firstRoomToCorrect() {
  const room = packageData?.rooms?.[0];
  return room && !isPolygonRoom(room) ? room : null;
}
async function correctFirstRoom(room) {
  let next = packageData;
  try {
    [elements.firstLength.value, elements.secondLength.value].forEach((value, wallIndex) => {
      const length = decimal(value);
      if (Math.abs(length - room.walls[wallIndex].length_m) > 1e-9) next = setWallLength(next, 0, wallIndex, String(length));
    });
  } catch (error) {
    // Nothing changes; the drawing goes back to the room as it is.
    fillRoomForm(room);
    renderRoomInput();
    showError(`${error instanceof Error ? error.message : error} Назовите ещё раз.`);
    return;
  }
  packageData = keepEndAnchors(packageData, next);
  clearError();
  showScreen("openings");
  await persist();
}
async function saveRoomFromForm() {
  const existing = firstRoomToCorrect();
  if (existing) {
    await correctFirstRoom(existing);
    return;
  }
  try {
    if (!confirmFirstRoomReplacement()) return;
    await saveFirstRoom(createRectangleRoom({
      name: elements.roomName.value,
      firstLengthM: elements.firstLength.value,
      secondLengthM: elements.secondLength.value,
      wallThicknessM: entrance.thickness || elements.wallThickness.value || PROVISIONAL_WALL_THICKNESS,
    }));
  } catch (error) {
    showError(error);
    if (entrance.step === "measure") {
      // The measured door position did not fit: ask for the distance again.
      entrance.step = "anchor";
      entrance.anchor = null;
      activeRoomWall = null;
      renderRoomInput();
    }
  }
}
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
  // Nothing measured (or the draft not loaded yet): never store an empty survey over the real one.
  if (!packageData?.rooms?.length) return;
  try {
    clearOpeningEdit();
    // The app itself decides whether it understands the whole plan (Bolat, 05.10.2026): no question to the
    // technician. A door with nothing behind it, a missing door on the other side, a wall thinner than 5 cm are
    // numbered on the whole plan, each with what is unclear. Partitions take the gap between rooms only in the
    // file that goes out, so a corrected size never leaves a stale thickness behind.
    pendingAdjacent = null;
    const issues = validationIssues(packageData);
    issueBaseline = issues.map(({ key, text }) => ({ key, text }));
    returnToIssues = false;
    confirmedPlan = issues.length ? null : planSignature(packageData);
    showScreen("done");
    await persist();
  } catch (error) {
    showError(error);
  }
});
elements.adjacentBalconyButton.addEventListener("click", () => {
  const target = pendingAdjacent;
  if (!target) return;
  if (voiceListening) stopContextVoice();
  pendingAdjacent = null;
  pendingShape = null;
  currentRoomIndex = target.roomIndex;
  balconyStep = { openingId: target.openingId, asking: true };
  showScreen("openings");
  persist();
});
elements.balconySize.addEventListener("change", async () => {
  const raw = elements.balconySize.value.trim();
  if (!balconyStep || !raw) return;
  try {
    const [firstM, secondM] = spokenBalcony(raw);
    const balcony = balconyForOpening(packageData.rooms[currentRoomIndex], balconyStep.openingId);
    packageData = balcony
      ? updateBalconyInPackage(packageData, currentRoomIndex, balcony.id, { firstM, secondM })
      : addBalconyToPackage(packageData, currentRoomIndex, balconyStep.openingId, { firstM, secondM });
  } catch (error) {
    showError(error);
    return;
  }
  clearError();
  elements.balconySize.value = "";
  balconyStep = { openingId: balconyStep.openingId, asking: false };
  renderOpenings();
  syncHint();
  await persist();
});
elements.balconyPrompt.addEventListener("click", askBalconySize);
elements.balconyRemoveButton.addEventListener("click", async () => {
  const balcony = balconyStep && balconyForOpening(packageData.rooms[currentRoomIndex], balconyStep.openingId);
  if (!balcony) return;
  try {
    packageData = removeBalconyFromPackage(packageData, currentRoomIndex, balcony.id);
  } catch (error) {
    showError(error);
    return;
  }
  balconyStep = null;
  renderOpenings();
  syncHint();
  await persist();
});
// The room behind a door is created as soon as it is measured: there is no "Готово — войти" (Bolat, 05.10.2026).
function maybeCreateAdjacent() {
  if (currentScreen !== "adjacent") return;
  try { renderAdjacent(); } catch (error) { showError(error); return; }
  const measured = decimal(elements.adjacentSecondLength.value) > 0 || pendingShape;
  if (measured && !elements.createAdjacentButton.disabled) elements.createAdjacentButton.click();
}
for (const input of [elements.adjacentFirstLength, elements.adjacentSecondLength, elements.adjacentAnchorOffset]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  input.addEventListener("change", () => {
    if (input === elements.adjacentSecondLength) {
      const raw = input.value.trim();
      try {
        // One answer may name both measured walls in order, for example "4,5 на 4".
        if (/\s+на\s+|[×*]|\d\s*[xх]\s*\d/iu.test(raw)) {
          const [first, second] = spokenBalcony(raw);
          elements.adjacentFirstLength.value = formatLength(first);
          input.value = formatLength(second);
        } else if (raw && !(decimal(raw) > 0)) {
          input.value = spokenMeasurement(raw, "length");
        }
      } catch (error) {
        showError(error);
        return;
      }
    }
    if (input === elements.adjacentFirstLength && adjacentOppositeTap) {
      // The wall opposite the door named different: the room is not a rectangle, its own screen takes over.
      const tap = adjacentOppositeTap;
      adjacentOppositeTap = null;
      const given = decimal(input.value);
      if (given > 0 && Math.abs(given - decimal(tap.baseline)) >= 0.005) {
        input.value = tap.baseline;
        const text = (value) => String(value).replace(".", ",");
        const second = decimal(elements.adjacentSecondLength.value) > 0 ? text(decimal(elements.adjacentSecondLength.value)) : "";
        openShape("adjacent");
        shapeState = { ...shapeState, count: 4, walls: [text(decimal(tap.baseline)), second, text(given), second], angles: ["", "90", "90", "90"], active: null };
        showScreen("shape");
        return;
      }
    }
    maybeCreateAdjacent();
  });
}
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
elements.adjacentShapeButton.addEventListener("click", () => openShape("adjacent"));
elements.shapeFewerButton.addEventListener("click", () => {
  shapeState.count = Math.max(3, shapeState.count - 1);
  shapeState.active = null;
  renderShape();
  schedulePersist();
});
elements.shapeMoreButton.addEventListener("click", () => {
  shapeState.count = Math.min(MAX_SHAPE_WALLS, shapeState.count + 1);
  shapeState.active = null;
  renderShape();
  schedulePersist();
});
elements.shapeMirrorButton.addEventListener("click", () => {
  shapeState.clockwise = !shapeState.clockwise;
  renderShape();
  schedulePersist();
});
// The way out of the shape screen (there is no ← any more, Bolat 08.10.2026): behind a door the room stays a
// rectangle; the first room stays as it was.
elements.shapeResetButton.addEventListener("click", () => {
  if (shapeState.context === "adjacent") {
    pendingShape = null;
    showScreen("adjacent");
  } else {
    showScreen(packageData?.rooms?.length ? "openings" : "room");
  }
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
      maybeCreateAdjacent();
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
elements.shareButton.addEventListener("click", sharePackage);
elements.shareTodayButton.addEventListener("click", shareTodaySurveys);
elements.newSurveyButton.addEventListener("click", () => elements.newButton.click());
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
  if (entrance.step === "wall") {
    // The entrance is always at the bottom (Bolat, 05.10.2026): the technician turns the drawing so that he
    // walks in from below. Its length comes first, so the door is placed on a real wall and never jumps.
    if (wallIndex === entrance.wall) {
      selectVoiceTargetById("firstLength");
      startContextVoice();
    }
    return;
  }
  if (entrance.step === "anchor") {
    if (wallIndex === entrance.wall) {
      // The piece of the door wall the tap fell on (left or right of the door) is the one measured:
      // from its corner to the near edge of the door.
      const along = [x - box.left, box.bottom - y, box.right - x, y - box.top][wallIndex] / box.scale;
      const door = room.openings?.[0];
      entrance.side = door && along > door.offset_m + door.width_m / 2 ? "end" : "start";
      renderRoomInput();
      selectVoiceTargetById("doorAnchor");
      startContextVoice();
      schedulePersist();
    }
    return;
  }
  if (entrance.step === "thickness") {
    if (wallIndex === entrance.wall) {
      // A tap on the door wall while the thickness is asked means the distance was said wrong (Bolat, 08.10.2026:
      // tapped there to correct it, and the number became the thickness). The distance is asked again.
      const along = [x - box.left, box.bottom - y, box.right - x, y - box.top][wallIndex] / box.scale;
      const door = room.openings?.[0];
      entrance = { ...entrance, step: "anchor", side: door && along > door.offset_m + door.width_m / 2 ? "end" : "start" };
      renderRoomInput();
      selectVoiceTargetById("doorAnchor");
      startContextVoice();
      schedulePersist();
      return;
    }
    selectVoiceTargetById("wallThickness");
    startContextVoice();
    return;
  }
  if (wallIndex !== activeRoomWall && !firstRoomToCorrect()) {
    // First tap only moves the blinking; the tap on the blinking wall opens the microphone.
    activeRoomWall = wallIndex;
    renderRoomInput();
    refreshVoiceTarget();
    return;
  }
  // Correcting a measured room: nothing blinks before, one tap on the wall to fix opens the microphone.
  activeRoomWall = wallIndex;
  const tappedField = wallIndex % 2 === 0 ? "firstLength" : "secondLength";
  roomOppositeTap = wallIndex >= 2 && decimal(elements[tappedField].value) > 0
    ? { wallIndex, field: tappedField, baseline: elements[tappedField].value }
    : null;
  renderRoomInput();
  selectVoiceTargetById(tappedField);
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
  adjacentOppositeTap = wallIndex === 2 ? { baseline: elements.adjacentFirstLength.value } : null;
  selectVoiceTargetById(wallIndex % 2 === 0 ? "adjacentFirstLength" : "adjacentSecondLength");
  startContextVoice();
});
elements.openingCanvas.addEventListener("click", async (event) => {
  const room = packageData?.rooms?.[currentRoomIndex];
  if (!room) return;
  const bounds = elements.openingCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * elements.openingCanvas.width / bounds.width;
  const y = (event.clientY - bounds.top) * elements.openingCanvas.height / bounds.height;
  // Any tap on the drawing closes a wall length opened and not answered: one question on the screen at a time.
  hideWallFix();
  // A distance written on the drawing is corrected by a tap on it, at any moment (the eraser, Bolat 08.10.2026).
  const distanceLabel = (elements.openingCanvas.offsetHitboxes ?? [])
    .map((box) => ({ ...box, distance: Math.hypot(x - box.x, y - box.y) }))
    .filter((box) => box.distance < box.radius)
    .sort((a, b) => a.distance - b.distance)[0];
  if (distanceLabel && !(openingStep?.step === "side" && openingStep.id === distanceLabel.openingId)) {
    fixOpeningDistance(distanceLabel.openingId, distanceLabel.side);
    return;
  }
  // The letter of a corner of a free-form room: the corner is said again (it used to be fixed only through the shape
  // screen behind the ← arrow, which built the room anew).
  const cornerLabel = openingStep ? null : (elements.openingCanvas.cornerHitboxes ?? [])
    .find((box) => Math.hypot(x - box.x, y - box.y) < box.radius);
  if (cornerLabel) {
    startAngleFix(cornerLabel.corner);
    return;
  }
  const thicknessLabel = openingStep ? null : (elements.openingCanvas.thicknessHitboxes ?? [])
    .filter((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
    .sort((first, second) => Math.hypot(x - first.x, y - first.y) - Math.hypot(x - second.x, y - second.y))[0];
  if (thicknessLabel) {
    startWallThicknessFix(thicknessLabel.wallIndex);
    return;
  }
  // A length label is outside its wall: only a tap outside the room and clear of the wall line corrects the number.
  // Its box used to reach over the wall, and a tap meant for a door opened "новая длина" with the microphone.
  // A balcony: a tap on it selects it; with one selected, a tap outside along its wall moves it there.
  const balconyHit = openingStep ? null
    : (elements.openingCanvas.balconyShapes ?? []).find((shape) => pointInPolygon([x, y], shape.points));
  if (balconyHit) {
    selectBalcony(balconyHit.openingId);
    return;
  }
  const balconyAlong = openingStep || balconyStep?.asking ? null : balconyTapAlong(elements.openingCanvas, room, x, y);
  if (balconyAlong !== null) {
    const balcony = balconyForOpening(room, balconyStep.openingId);
    try {
      packageData = updateBalconyInPackage(packageData, currentRoomIndex, balcony.id, { centerM: balconyAlong });
    } catch (error) {
      showError(error);
      return;
    }
    clearError();
    renderOpenings();
    await persist();
    return;
  }
  if (balconyStep) {
    balconyStep = null;
    renderOpenings();
  }
  const outline = canvasRoomOutline(elements.openingCanvas, room);
  const clearOfWalls = !pointInPolygon([x, y], outline) && outline.every((point, index) =>
    distanceToCanvasSegment(x, y, point, outline[(index + 1) % outline.length]) >= 18);
  const length = openingStep || !clearOfWalls ? null : (elements.openingCanvas.lengthHitboxes ?? []).find((box) =>
    x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
  if (length) {
    startWallFix(length.wallIndex);
    return;
  }
  if (tapIsInsideRoom(elements.openingCanvas, room, x, y)) {
    // A tap inside the room: what is there (storage, column, floor opening) is asked at once at that place.
    clearOpeningEdit();
    clearInteriorEdit();
    openingStep = null;
    const tap = canvasMap(elements.openingCanvas, room).from(x, y);
    showScreen("interior");
    startInteriorAt(tap);
    return;
  }
  // While the piece of wall at a just placed opening is asked, a tap near that wall is meant for it, even at the corner
  // where the next wall is as near (Codex walk 08.10.2026: the finger slid onto the next wall, a new opening began and
  // the door kept the wrong distance).
  const asked = ["side", "width", "thickness"].includes(openingStep?.step) ? stepOpening() : null;
  const askedWall = asked ? openingWallIndex(room, asked) : -1;
  const askedSegment = askedWall >= 0
    ? canvasWallSegment(elements.openingCanvas, room, askedWall, { offset_m: 0, width_m: room.walls[askedWall].length_m })
    : null;
  const nearAsked = askedSegment &&
    distanceToCanvasSegment(x, y, askedSegment.slice(0, 2), askedSegment.slice(2)) < ASKED_WALL_REACH;
  const wallIndex = nearAsked ? askedWall : nearestWallIndex(elements.openingCanvas, room, x, y);
  const wall = room.walls[wallIndex];
  const hit = room.openings.find((opening) => {
    if (opening.wall_id !== wall.id) return false;
    const [x1, y1, x2, y2] = canvasWallSegment(elements.openingCanvas, room, wallIndex, opening);
    return distanceToCanvasSegment(x, y, [x1, y1], [x2, y2]) < 36;
  });
  const placing = stepOpening();
  if (placing && placing.wall_id === wall.id && (!hit || hit.id === placing.id)
    && ["side", "width", "thickness"].includes(openingStep?.step)) {
    // The tap tells which piece of the wall anchors the opening: left or right of its middle. Asked for the width or
    // the thickness, a tap on the same wall means the distance was said wrong (Bolat tapped there to correct it, and
    // the number went into the thickness): the distance is asked again.
    if (openingStep.step !== "side") openingStep = { ...openingStep, step: "side", side: null, distanceOnly: openingStep.step === "thickness" };
    const [sx, sy, ex, ey] = canvasWallSegment(elements.openingCanvas, room, wallIndex, { offset_m: 0, width_m: wall.length_m });
    const along = ((x - sx) * (ex - sx) + (y - sy) * (ey - sy)) / ((ex - sx) ** 2 + (ey - sy) ** 2 || 1) * wall.length_m;
    startOpeningDistance(along > placing.offset_m + placing.width_m / 2 ? "end" : "start");
    return;
  }
  if (hit) {
    // A placed door leads into the room behind it; a window or passage opens for editing (doors via the list).
    // The entrance leads outside and has no room behind it.
    if (isEntranceOpening(currentRoomIndex, hit)) return;
    openingStep = null;
    if (hit.kind === "door" || connectionForOpening(packageData, currentRoomIndex, hit.id) || balconyForOpening(room, hit.id)) {
      goThroughOpening(currentRoomIndex, hit.id);
    } else {
      // A window or passage tapped again is placed again by the same steps.
      clearOpeningEdit(false);
      openingStep = { step: "side", id: hit.id, side: null, editing: true };
      renderOpenings();
      schedulePersist();
    }
    return;
  }
  // A tap on a wall starts a new opening there: first the question what is in it, unless it was chosen before.
  clearOpeningEdit(false);
  clearError();
  openingStep = { step: "kind", wallIndex };
  if (armedKind) {
    const kind = armedKind;
    armedKind = null;
    await chooseOpeningKind(kind);
    return;
  }
  renderOpenings();
  schedulePersist();
});
// The distance from the corner, dictated or typed, puts the opening in its place.
elements.openingOffset.addEventListener("change", () => {
  if (openingStep?.step !== "side" || !openingStep.side) return;
  const room = packageData.rooms[currentRoomIndex];
  const opening = stepOpening();
  if (!opening) return;
  const wallIndex = openingWallIndex(room, opening);
  const length = room.walls[wallIndex].length_m;
  const value = decimal(elements.openingOffset.value);
  if (!Number.isFinite(value) || value < 0 || !String(elements.openingOffset.value).trim()) return;
  const offset = openingStep.side === "start" ? value : length - value - opening.width_m;
  if (offset < -1e-9 || offset + opening.width_m > length + 1e-9) {
    showError(`${typeName(opening.kind)} не помещается: от угла ${formatLength(value)} м, а вся стена ${formatLength(length)} м. Назовите расстояние ещё раз.`);
    return;
  }
  try {
    packageData = updateOpeningInPackage(packageData, currentRoomIndex, opening.id, {
      kind: opening.kind, wallIndex, offsetM: String(Math.round(Math.max(0, offset) * 1000) / 1000), widthM: String(opening.width_m),
    });
  } catch (error) {
    showError(error);
    return;
  }
  clearError();
  openingAnchors[opening.id] = openingStep.side;
  if (opening.kind !== "door" && !openingStep.distanceOnly) {
    // A window or passage has no standard width: it is asked next, keeping the distance just named.
    openingStep = { step: "width", id: opening.id, side: openingStep.side, distance: value, editing: openingStep.editing };
    elements.openingWidth.value = "";
    renderOpenings();
    persist();
    return;
  }
  finishOpeningPlacement(opening.id);
});
elements.openingWidth.addEventListener("change", () => {
  if (openingStep?.step !== "width") return;
  const room = packageData.rooms[currentRoomIndex];
  const opening = stepOpening();
  if (!opening) return;
  const width = decimal(elements.openingWidth.value);
  if (!(width > 0) || !String(elements.openingWidth.value).trim()) return;
  const wallIndex = openingWallIndex(room, opening);
  const length = room.walls[wallIndex].length_m;
  // The distance from the chosen corner stays; from the far corner the opening grows towards it.
  const offset = openingStep.side === "start" ? openingStep.distance : length - openingStep.distance - width;
  if (offset < -1e-9 || offset + width > length + 1e-9) {
    showError(`${typeName(opening.kind)} шириной ${formatLength(width)} м не помещается на стене ${formatLength(length)} м. Назовите ширину ещё раз.`);
    return;
  }
  try {
    packageData = updateOpeningInPackage(packageData, currentRoomIndex, opening.id, {
      kind: opening.kind, wallIndex, offsetM: String(Math.round(Math.max(0, offset) * 1000) / 1000), widthM: String(width),
    });
  } catch (error) {
    showError(error);
    return;
  }
  clearError();
  finishOpeningPlacement(opening.id);
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

let draftLoaded = false;
async function start() {
  try {
    const draft = await loadDraft();
    restoreForm(draft);
    packageData = draft?.package ?? null;
    draftLoaded = true;
    try {
      restoreHistory(await loadHistory(), draft);
    } catch {
      // Without the saved history ↶ starts from now, as before.
    }
    if (keptInCatalog(packageData)) {
      await saveSurvey({ ...draft, version: 4 });
    }
    if (packageData?.rooms?.length) {
      currentRoomIndex = Math.min(Math.max(currentRoomIndex, 0), packageData.rooms.length - 1);
      fillRoomForm(packageData.rooms[0]);
      // Back to where the measuring stopped; drafts from before workScreen open on the doors, not the final plan.
      if (["openings", "interior", "adjacent", "shape", "done"].includes(draft.screen)) workScreen = draft.screen;
      resumeWork();
    } else if (editingAddress()) {
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
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {
      setSaveStatus("Офлайн-режим станет доступен после установки приложения");
    });
  }
}
// The app runs from the phone's copy; a newer version, once fully downloaded, takes over with one reload.
// Listened for before anything else, so a version that arrives while the page loads is not missed. The draft is
// saved first so nothing typed is lost; the very first install (no previous worker) needs no reload.
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    clearTimeout(saveTimer);
    // Before the draft is loaded there is nothing of this page to save, and saving would overwrite it with empty.
    (draftLoaded ? persist() : Promise.resolve()).finally(() => window.location.reload());
  });
}
initializeUi();
installVoiceInputs();
start();
