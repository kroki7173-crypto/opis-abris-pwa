import {
  addOpeningToPackage, connectionForOpening, cornerName, createAdjacentRoom, createDoorAnchoredRoom, createRectangleRoom,
  roomAcrossOpening, setOpeningWallThickness, setWallLength, validatePackage, withRoom,
} from "./model.js";
import { OPENING_WIDTHS, cornerOfSide, planPhrase, wallsNamed } from "./phrase.js";

const EPSILON = 1e-8;
const KIND_NAMES = { door: "Дверь", window: "Окно", passage: "Проём", balcony: "Балкон" };

function metres(value) {
  return Number(value).toFixed(2).replace(".", ",");
}

function wallLabel(room, index) {
  return `${cornerName(index)}–${cornerName((index + 1) % room.walls.length)}`;
}

function plannedSteps(part, room, entryWall, currentWall) {
  const steps = planPhrase(part, room, { entryWall, currentWall });
  const said = part.groups.flatMap((group) =>
    wallsNamed(room, entryWall, group.wall, currentWall).length === 1 ? group.openings : []);
  let openingIndex = 0;
  return steps.map((step) => step.type === "opening"
    ? { ...step, said: said[openingIndex++] ?? null } : step);
}

function measuredAxes(steps) {
  const lengths = {};
  const axes = [null, null];
  for (const step of steps) {
    if (step.type !== "length") continue;
    lengths[step.wallIndex] = step.value;
    const axis = step.wallIndex % 2;
    if (axes[axis] !== null && Math.abs(axes[axis] - step.value) > EPSILON) {
      throw new Error("Противоположные стены прямоугольной комнаты имеют разные длины. Проверьте замер.");
    }
    axes[axis] = step.value;
  }
  return { lengths, axes };
}

function openingOffset(step, wallLength, width) {
  if (step.missing?.includes("place") || step.anchor === "middle") return (wallLength - width) / 2;
  if (step.anchor === "start") return step.offset;
  if (step.anchor === "end") return wallLength - step.offset - width;
  return (wallLength - width) / 2;
}

function entryForRoom(pkg, index, known) {
  if (known.has(index)) return known.get(index);
  if (index === 0) return 0;
  const room = pkg.rooms[index];
  const incoming = pkg.connections.find((item) => item.room_b_id === room.id);
  return incoming ? room.walls.findIndex((wall) => wall.id === incoming.wall_b_id) : 0;
}

function roomFromReference(pkg, reference, current) {
  if (!reference) return current;
  if (Number.isInteger(reference.index)) {
    if (pkg.rooms[reference.index]) return reference.index;
    throw new Error("Названной комнаты пока нет.");
  }
  if (typeof reference.name === "string") {
    const matches = pkg.rooms.flatMap((room, index) =>
      room.name.toLocaleLowerCase("ru").startsWith(reference.name.toLocaleLowerCase("ru")) ? [index] : []);
    if (matches.length === 1) return matches[0];
    throw new Error(matches.length ? "Уточните, из какой комнаты идти: названия совпадают."
      : "Названной комнаты пока нет.");
  }
  throw new Error("Не удалось определить комнату перехода.");
}

// Применяет фразу в копии пакета; при ошибке возвращает исходный пакет целиком.
export function applyPhrase(pkg, read, { roomIndex = 0, entryWall = 0, currentWall = entryWall, firstRoom = null } = {}) {
  const original = { pkg, roomIndex, entryWall, currentWall, anchors: {}, understood: [],
    questions: [], firstRoom: null, error: null };
  const state = { ...original, anchors: {}, understood: [], questions: [] };
  const roomEntries = new Map([[roomIndex, entryWall]]);
  let pending = null;
  let lastOpening = null;
  const balconyDoors = new Set();
  let stopped = false;

  const ask = (question) => state.questions.push(question);
  const room = () => state.pkg.rooms[state.roomIndex];

  function applyWalls(part, index, entry, selected) {
    const source = state.pkg.rooms[index];
    const steps = plannedSteps(part, source, entry, selected);
    if (source.walls.length === 4 && source.right_angles) measuredAxes(steps);
    // Сначала задаём все длины фразы: проём может стоять на стене, размер которой назван позже.
    for (const step of steps) {
      if (step.type !== "length") continue;
      state.pkg = setWallLength(state.pkg, index, step.wallIndex, step.value);
      state.understood.push(`стена ${wallLabel(state.pkg.rooms[index], step.wallIndex)} ${metres(step.value)}`);
      state.currentWall = step.wallIndex;
    }
    let recentOpening = null;
    for (const step of steps) {
      if (step.type === "length" || step.type === "entry") continue;
      if (step.type === "choose_wall") {
        ask({ type: "choose_wall", roomIndex: index, walls: step.walls,
          text: "Коснитесь стены, которую имели в виду." });
        continue;
      }
      if (step.type === "thickness") {
        const onWall = state.pkg.rooms[index].openings.filter((opening) =>
          opening.wall_id === state.pkg.rooms[index].walls[step.wallIndex].id);
        const target = recentOpening?.wallIndex === step.wallIndex
          ? recentOpening.id : onWall.length === 1 ? onWall[0].id : null;
        if (!target) throw new Error("Неясно, какому проёму относится толщина стены.");
        state.pkg = setOpeningWallThickness(state.pkg, index, target, step.value);
        state.understood.push(`толщина у проёма ${metres(step.value)}`);
        continue;
      }
      if (step.type !== "opening") continue;
      state.currentWall = step.wallIndex;
      if (!step.kind || step.missing?.includes("kind")) {
        ask({ type: "kind", roomIndex: index, wallIndex: step.wallIndex,
          text: "Что находится в этой стене: дверь, окно или проём ?" });
        continue;
      }
      const target = state.pkg.rooms[index];
      const wall = target.walls[step.wallIndex];
      const entrance = index === 0 && target.openings.length === 0 && step.kind === "door";
      const width = entrance && step.said?.width == null ? 1 : step.width ?? OPENING_WIDTHS[step.kind];
      if (step.said?.after && recentOpening?.wallIndex === step.wallIndex &&
          !step.missing?.includes("place")) {
        const previous = target.openings.find((opening) => opening.id === recentOpening.id);
        const anchor = state.anchors[previous.id];
        if (anchor) {
          const measured = anchor === "start" ? previous.offset_m
            : wall.length_m - previous.offset_m - previous.width_m;
          const toward = step.said.after.side
            ? cornerOfSide(step.wallIndex, entry, step.said.after.side) : null;
          step.offset = toward === anchor
            ? measured - step.said.after.gap - width
            : measured + previous.width_m + step.said.after.gap;
        }
      }
      const offset = openingOffset(step, wall.length_m, width);
      if (offset < -EPSILON || offset + width > wall.length_m + EPSILON) {
        throw new Error(`${KIND_NAMES[step.kind]} ${metres(width)} не помещается на стене ${metres(wall.length_m)}.`);
      }
      // В базовой модели допускаются пересекающиеся проёмы; для голосовой фразы это ошибка.
      const overlap = target.openings.some((other) => other.wall_id === wall.id &&
        offset < other.offset_m + other.width_m - EPSILON && other.offset_m < offset + width - EPSILON);
      if (overlap) throw new Error(`${KIND_NAMES[step.kind]} накладывается на другой проём этой стены.`);
      state.pkg = addOpeningToPackage(state.pkg, index, {
        kind: step.kind === "balcony" ? "door" : step.kind,
        wallIndex: step.wallIndex, offsetM: Math.max(0, offset), widthM: width,
      });
      const placed = state.pkg.rooms[index].openings.at(-1);
      recentOpening = { id: placed.id, wallIndex: step.wallIndex };
      lastOpening = { roomIndex: index, openingId: placed.id };
      if (step.anchor === "start" || step.anchor === "end") state.anchors[placed.id] = step.anchor;
      const placement = step.missing?.includes("place") ? "; место уточнить"
        : step.anchor === "middle" ? "; посередине"
          : `; от угла ${cornerName(step.anchor === "start" ? step.wallIndex
            : (step.wallIndex + 1) % target.walls.length)} ${metres(step.offset)}`;
      state.understood.push(`${KIND_NAMES[step.kind]} ${metres(width)}${placement}`);
      if (step.thickness !== undefined) {
        state.pkg = setOpeningWallThickness(state.pkg, index, placed.id, step.thickness);
      }
      if (step.missing?.includes("place")) {
        ask({ type: "place", roomIndex: index, openingId: placed.id, wallIndex: step.wallIndex,
          anchor: step.side ?? null, text: `${KIND_NAMES[step.kind]}: сколько от угла ?` });
      }
      if (step.kind === "balcony") {
        balconyDoors.add(placed.id);
        ask({ type: "balcony_size", roomIndex: index, openingId: placed.id, wallIndex: step.wallIndex,
          text: "Балкон: сколько на сколько ?" });
      }
    }
  }

  function makeFirstRoom(part) {
    const draft = createRectangleRoom({ firstLengthM: 1, secondLengthM: 1 });
    const steps = plannedSteps(part, draft, state.entryWall, state.currentWall);
    const known = measuredAxes(steps);
    for (const [key, value] of Object.entries(firstRoom?.lengths ?? {})) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= 4) continue;
      if (known.axes[index % 2] !== null && Math.abs(known.axes[index % 2] - value) > EPSILON) {
        throw new Error("Названы разные длины одной пары противоположных стен.");
      }
      known.lengths[index] = value;
      known.axes[index % 2] = value;
    }
    if (known.axes[0] === null || known.axes[1] === null) {
      const missing = known.axes[0] === null ? 0 : 1;
      state.firstRoom = { lengths: known.lengths };
      for (const [index, value] of Object.entries(known.lengths)) {
        state.understood.push(`стена ${wallLabel(draft, Number(index))} ${metres(value)}`);
      }
      state.currentWall = missing;
      ask({ type: "length", roomIndex: 0, wallIndex: missing,
        text: `Длина стены ${wallLabel(draft, missing)} ?` });
      return false;
    }
    const first = createRectangleRoom({ firstLengthM: known.axes[0], secondLengthM: known.axes[1] });
    state.pkg = withRoom(state.pkg, first);
    applyWalls(part, 0, state.entryWall, state.currentWall);
    return true;
  }

  function createBehindDoor(part) {
    const source = state.pkg.rooms[pending.roomIndex];
    const door = source.openings.find((opening) => opening.id === pending.openingId);
    const wallIndex = source.walls.findIndex((wall) => wall.id === door.wall_id);
    const wall = source.walls[wallIndex];
    const draft = createRectangleRoom({ firstLengthM: wall.length_m, secondLengthM: 1 });
    const steps = plannedSteps(part, draft, 0, 0);
    const dimensions = measuredAxes(steps);
    if (dimensions.axes[1] === null) {
      ask({ type: "length", roomIndex: pending.roomIndex, openingId: door.id, wallIndex: 1,
        text: "Назовите длину правой стены новой комнаты." });
      return false;
    }
    const parentAnchor = state.anchors[door.id] ??
      (door.offset_m <= wall.length_m - door.offset_m - door.width_m ? "start" : "end");
    const sameCorner = parentAnchor === "start" ? "end" : "start";
    const sameDistance = parentAnchor === "start" ? door.offset_m
      : wall.length_m - door.offset_m - door.width_m;
    const entry = steps.find((step) => step.type === "entry");
    if (entry?.missing?.length) {
      ask({ type: "place", roomIndex: pending.roomIndex, openingId: door.id,
        text: "Сколько от двери до угла новой комнаты ?" });
      return false;
    }
    const explicitShift = entry && (entry.anchor !== sameCorner || Math.abs(entry.offset - sameDistance) > EPSILON);
    const create = explicitShift ? createDoorAnchoredRoom : createAdjacentRoom;
    state.pkg = create(state.pkg, {
      roomIndex: pending.roomIndex, openingId: door.id,
      name: `Комната ${state.pkg.rooms.length + 1}`,
      firstLengthM: dimensions.axes[0] ?? wall.length_m,
      secondLengthM: dimensions.axes[1],
      anchorCorner: entry?.anchor ?? sameCorner,
      anchorOffsetM: entry?.offset ?? sameDistance,
    });
    state.roomIndex = state.pkg.rooms.length - 1;
    state.entryWall = 0;
    state.currentWall = 0;
    roomEntries.set(state.roomIndex, 0);
    state.understood.push(`→ «${room().name}»`);
    applyWalls(part, state.roomIndex, 0, 0);
    pending = null;
    return true;
  }

  function goThrough(part) {
    const from = roomFromReference(state.pkg, part.from, state.roomIndex);
    const source = state.pkg.rooms[from];
    const fromEntry = entryForRoom(state.pkg, from, roomEntries);
    let doors = source.openings.filter((opening) => opening.kind === "door" &&
      !(from === 0 && source.openings[0]?.id === opening.id) && !balconyDoors.has(opening.id) &&
      !(source.balconies ?? []).some((balcony) => balcony.opening_id === opening.id));
    if (part.last && lastOpening?.roomIndex === from) {
      doors = doors.filter((opening) => opening.id === lastOpening.openingId);
    } else if (part.wall) {
      const walls = wallsNamed(source, fromEntry, part.wall, from === state.roomIndex ? state.currentWall : fromEntry);
      if (walls.length !== 1) {
        ask({ type: "choose_wall", roomIndex: from, walls,
          text: "Коснитесь стены с дверью, в которую хотите войти." });
        return false;
      }
      doors = doors.filter((opening) => opening.wall_id === source.walls[walls[0]].id);
    } else {
      doors = doors.filter((opening) => roomAcrossOpening(state.pkg, from, opening.id) < 0);
    }
    if (doors.length > 1) {
      ask({ type: "choose_door", roomIndex: from, openingIds: doors.map((door) => door.id),
        text: "Коснитесь двери, в которую хотите войти." });
      return false;
    }
    if (!doors.length) throw new Error("На названной стене нет двери для перехода.");
    const door = doors[0];
    const behind = roomAcrossOpening(state.pkg, from, door.id);
    if (behind >= 0) {
      const connection = connectionForOpening(state.pkg, from, door.id);
      const destination = state.pkg.rooms[behind];
      const nextEntry = connection ? destination.walls.findIndex((wall) => wall.id ===
        (connection.room_a_id === destination.id ? connection.wall_a_id : connection.wall_b_id)) : 0;
      state.roomIndex = behind;
      state.entryWall = Math.max(0, nextEntry);
      state.currentWall = state.entryWall;
      roomEntries.set(behind, state.entryWall);
      state.understood.push(`→ «${destination.name}»`);
    } else {
      pending = { roomIndex: from, openingId: door.id };
      state.roomIndex = from;
      state.entryWall = fromEntry;
      state.currentWall = fromEntry;
    }
    return true;
  }

  try {
    for (const part of read?.parts ?? []) {
      if (part.type === "go") {
        if (!state.pkg.rooms.length) throw new Error("Сначала назовите размеры первой комнаты.");
        if (pending) throw new Error("Сначала назовите глубину комнаты за предыдущей дверью.");
        if (!goThrough(part)) { stopped = true; break; }
        continue;
      }
      if (part.type !== "walls") continue;
      if (pending) {
        if (!createBehindDoor(part)) { stopped = true; break; }
      } else if (!state.pkg.rooms.length) {
        if (!makeFirstRoom(part)) { stopped = true; break; }
      } else {
        applyWalls(part, state.roomIndex, state.entryWall, state.currentWall);
      }
    }
    if (pending && !stopped) {
      ask({ type: "length", roomIndex: pending.roomIndex, openingId: pending.openingId, wallIndex: 1,
        text: "Назовите длину правой стены новой комнаты." });
    }
    if (state.pkg.rooms.length) validatePackage(state.pkg);
    return state;
  } catch (error) {
    return { ...original, error: error instanceof Error ? error.message : String(error) };
  }
}
