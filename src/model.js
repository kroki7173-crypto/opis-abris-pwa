export const FORMAT = "opis-abris-measurement";
export const VERSION = 1;

function identifier(prefix) {
  if (globalThis.crypto?.randomUUID) return prefix + "-" + globalThis.crypto.randomUUID();
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}

function positiveNumber(value, label) {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000) {
    throw new Error(label + ": введите число больше нуля.");
  }
  return parsed;
}

function requiredText(value, label, maximum) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maximum) {
    throw new Error(label + ": заполните поле (до " + maximum + " символов).");
  }
  return result;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function signedArea(points) {
  let result = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    result += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return result / 2;
}

function pointOnSegment(point, start, end) {
  const cross = (point[0] - start[0]) * (end[1] - start[1]) -
    (point[1] - start[1]) * (end[0] - start[0]);
  if (Math.abs(cross) > 1e-8) return false;
  return point[0] >= Math.min(start[0], end[0]) - 1e-8 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-8 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-8 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-8;
}

function containsPoint(polygon, point) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const start = polygon[previous];
    const end = polygon[index];
    if (pointOnSegment(point, start, end)) return true;
    if ((end[1] > point[1]) !== (start[1] > point[1]) &&
        point[0] < (start[0] - end[0]) * (point[1] - end[1]) / (start[1] - end[1]) + end[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonsOverlap(first, second) {
  const axes = [];
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const length = distance(start, end);
      axes.push([-(end[1] - start[1]) / length, (end[0] - start[0]) / length]);
    }
  }
  return axes.every((axis) => {
    const project = (polygon) => polygon.map((point) => point[0] * axis[0] + point[1] * axis[1]);
    const a = project(first);
    const b = project(second);
    return Math.max(...a) > Math.min(...b) + 1e-8 && Math.max(...b) > Math.min(...a) + 1e-8;
  });
}

function wallOpenings(room, wallId) {
  return room.openings.filter((opening) => opening.wall_id === wallId)
    .sort((a, b) => a.offset_m - b.offset_m);
}

function cross2(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

function distanceToSegment(point, start, end) {
  const along = [end[0] - start[0], end[1] - start[1]];
  const lengthSquared = along[0] * along[0] + along[1] * along[1];
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * along[0] +
    (point[1] - start[1]) * along[1]) / lengthSquared));
  return distance(point, [start[0] + along[0] * t, start[1] + along[1] * t]);
}

function segmentsTouch(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominator = cross2(r, s);
  const offset = [c[0] - a[0], c[1] - a[1]];
  if (Math.abs(denominator) > 1e-12) {
    const t = cross2(offset, s) / denominator;
    const u = cross2(offset, r) / denominator;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
  }
  return [[a, c, d], [b, c, d], [c, a, b], [d, a, b]]
    .some(([point, start, end]) => distanceToSegment(point, start, end) <= 1e-9);
}

// Positions along segment a-b where the polygon boundary touches or crosses it.
function boundaryParameters(a, b, polygon) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const lengthSquared = r[0] * r[0] + r[1] * r[1];
  const result = [0, 1];
  for (let index = 0; index < polygon.length; index += 1) {
    const c = polygon[index];
    const d = polygon[(index + 1) % polygon.length];
    const s = [d[0] - c[0], d[1] - c[1]];
    const denominator = cross2(r, s);
    const offset = [c[0] - a[0], c[1] - a[1]];
    if (Math.abs(denominator) > 1e-12) {
      const t = cross2(offset, s) / denominator;
      const u = cross2(offset, r) / denominator;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) result.push(t);
    } else if (lengthSquared > 0) {
      for (const point of [c, d]) {
        if (distanceToSegment(point, a, b) > 1e-9) continue;
        const t = ((point[0] - a[0]) * r[0] + (point[1] - a[1]) * r[1]) / lengthSquared;
        if (t > 0 && t < 1) result.push(t);
      }
    }
  }
  return result.sort((first, second) => first - second);
}

function strictlyInside(polygon, point) {
  for (let index = 0; index < polygon.length; index += 1) {
    if (distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]) <= 1e-9) return false;
  }
  return containsPoint(polygon, point);
}

// True when part of first's boundary runs through the interior of second.
function boundaryEntersInterior(first, second) {
  const orientation = signedArea([...first, first[0]]) > 0 ? 1 : -1;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index];
    const b = first[(index + 1) % first.length];
    const length = distance(a, b);
    if (length === 0) continue;
    const inward = [-(b[1] - a[1]) / length * orientation, (b[0] - a[0]) / length * orientation];
    const parameters = boundaryParameters(a, b, second);
    for (let step = 0; step < parameters.length - 1; step += 1) {
      if (parameters[step + 1] - parameters[step] < 1e-9) continue;
      const t = (parameters[step] + parameters[step + 1]) / 2;
      const probe = [
        a[0] + (b[0] - a[0]) * t + inward[0] * 1e-6,
        a[1] + (b[1] - a[1]) * t + inward[1] * 1e-6,
      ];
      if (strictlyInside(second, probe)) return true;
    }
  }
  return false;
}

// Interiors of two simple polygons share area (touching edges do not count).
export function polygonInteriorsOverlap(first, second) {
  return boundaryEntersInterior(first, second) || boundaryEntersInterior(second, first);
}

// Whole inner polygon lies inside outer, boundary contact allowed; outer may be concave.
export function polygonContains(outer, inner) {
  for (let index = 0; index < inner.length; index += 1) {
    const a = inner[index];
    const b = inner[(index + 1) % inner.length];
    if (!containsPoint(outer, a)) return false;
    const parameters = boundaryParameters(a, b, outer);
    for (let step = 0; step < parameters.length - 1; step += 1) {
      const t = (parameters[step] + parameters[step + 1]) / 2;
      if (!containsPoint(outer, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
  }
  return true;
}

export function isSimplePolygon(points) {
  const count = points.length;
  if (count < 3) return false;
  if (Math.abs(signedArea([...points, points[0]])) < 1e-9) return false;
  for (let first = 0; first < count; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % count];
    if (distance(a, b) < 1e-9) return false;
    for (let second = first + 1; second < count; second += 1) {
      const c = points[second];
      const d = points[(second + 1) % count];
      const adjacent = second === first + 1 || (first === 0 && second === count - 1);
      if (!adjacent) {
        if (segmentsTouch(a, b, c, d)) return false;
        continue;
      }
      // Neighbouring walls meet at one corner; they must not fold back over each other.
      const shared = second === first + 1 ? b : a;
      const one = second === first + 1 ? a : b;
      const two = second === first + 1 ? d : c;
      const u = [one[0] - shared[0], one[1] - shared[1]];
      const v = [two[0] - shared[0], two[1] - shared[1]];
      if (Math.abs(cross2(u, v)) < 1e-9 * distance(one, shared) * distance(two, shared) &&
          u[0] * v[0] + u[1] * v[1] > 0) return false;
    }
  }
  return true;
}

function roomsOverlap(first, second) {
  return polygonInteriorsOverlap(roomPolygon(first), roomPolygon(second));
}

export function createPackage(address) {
  const now = new Date().toISOString();
  return {
    format: FORMAT,
    version: VERSION,
    package_id: identifier("pkg"),
    created_at: now,
    updated_at: now,
    units: "m",
    address: requiredText(address, "Адрес", 1000),
    rooms: [],
    connections: [],
  };
}

export function createRectangleRoom({
  name = "Прихожая",
  firstLengthM,
  secondLengthM,
  wallThicknessM = 0.1,
  originM = [0, 0],
  baseAngleDeg = 0,
} = {}) {
  const first = positiveNumber(firstLengthM, "Первая стена");
  const second = positiveNumber(secondLengthM, "Вторая стена");
  const thickness = positiveNumber(wallThicknessM, "Толщина стены");
  if (thickness > 2) throw new Error("Толщина стены: допустимо до 2 м.");
  if (!Array.isArray(originM) || originM.length !== 2 || !originM.every(Number.isFinite)) {
    throw new Error("Неверная начальная точка комнаты.");
  }
  if (!Number.isFinite(baseAngleDeg) || baseAngleDeg < -360 || baseAngleDeg > 360) {
    throw new Error("Неверное направление первой стены.");
  }

  const roomId = identifier("room");
  const lengths = [first, second, first, second];
  const sources = ["measured", "measured", "inferred_opposite", "inferred_opposite"];
  return {
    id: roomId,
    name: requiredText(name, "Название комнаты", 120),
    origin_m: [...originM],
    wall_thickness_m: thickness,
    right_angles: true,
    walls: lengths.map((length, index) => ({
      id: identifier("wall"),
      length_m: length,
      angle_deg: ((baseAngleDeg + index * 90 + 360) % 360),
      source: sources[index],
    })),
    openings: [],
    interiors: [],
  };
}

export const MIN_SHAPE_WALLS = 3;
// One limit for the shape screen and the model (README: 3 to 12 walls).
export const MAX_SHAPE_WALLS = 12;
export const CLOSURE_GREEN_M = 0.05;
export const CLOSURE_LIMIT_M = 0.15;

export function cornerName(index) {
  return "ABCDEFGHIJKLMNOPQRSTUVWX"[index] ?? String(index + 1);
}

export function isPolygonRoom(room) {
  // A plain rectangle is drawn from two lengths; anything else follows its wall angles.
  return (Array.isArray(room?.walls) && room.walls.length !== 4) || room?.right_angles === false;
}

function blank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

// Builds an outline from wall lengths in walking order and the interior angle at every
// corner except the first (corners B, C, ...; angle A follows from the others).
// The last two lengths may be left blank: they are then worked out from the rest, which
// closes the outline exactly. With every length given, the leftover gap (tolerance 15 cm)
// is closed by one extra closing line; entered lengths and angles are never changed.
// A clockwise walk is turned into the stored counter-clockwise form starting at corner B,
// so that the first stored wall is still the first entered wall.
export function solveOutline({
  wallLengthsM, interiorAnglesDeg, baseAngleDeg = 0, clockwise = false,
} = {}) {
  if (!Array.isArray(wallLengthsM) || wallLengthsM.length < MIN_SHAPE_WALLS ||
      wallLengthsM.length > MAX_SHAPE_WALLS) {
    throw new Error("В комнате должно быть от " + MIN_SHAPE_WALLS + " до " + MAX_SHAPE_WALLS + " стен.");
  }
  const count = wallLengthsM.length;
  if (!Array.isArray(interiorAnglesDeg) || interiorAnglesDeg.length !== count - 1) {
    throw new Error("Для " + count + " стен нужно углов: " + (count - 1) + ".");
  }
  const angles = interiorAnglesDeg.map((value, index) => {
    const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
    if (blank(value) || !Number.isFinite(parsed) || parsed <= 0 || parsed >= 360) {
      throw new Error("Угол " + cornerName(index + 1) + ": введите градусы больше 0 и меньше 360.");
    }
    return parsed;
  });
  const angleA = (count - 2) * 180 - angles.reduce((sum, value) => sum + value, 0);
  if (angleA <= 1e-9 || angleA >= 360 - 1e-9) {
    throw new Error("Углы не складываются в замкнутый контур: сумма всех углов должна быть " +
      (count - 2) * 180 + "°, а угол A получается " + Math.round(angleA * 10) / 10 + "°.");
  }

  const given = wallLengthsM.map((value, index) => {
    if (blank(value)) return null;
    const length = positiveNumber(value, "Стена " + cornerName(index) + "–" + cornerName((index + 1) % count));
    if (length < 0.05) throw new Error("Стены должны быть не меньше 0,05 м.");
    return length;
  });
  const blanks = given.flatMap((value, index) => (value === null ? [index] : []));
  const inferLast = blanks.length === 2 && blanks[0] === count - 2;
  if (blanks.length && !inferLast) {
    throw new Error("Введите все стены или оставьте пустыми две последние: их длины вычислятся.");
  }

  const sign = clockwise ? -1 : 1;
  const directions = [0];
  for (let index = 1; index < count; index += 1) {
    directions.push(directions[index - 1] + sign * (180 - angles[index - 1]));
  }
  const unit = directions.map((degrees) => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]);
  const lengths = [...given];
  if (inferLast) {
    const known = given.slice(0, count - 2).reduce(
      (sum, length, index) => [sum[0] + length * unit[index][0], sum[1] + length * unit[index][1]],
      [0, 0],
    );
    const need = [-known[0], -known[1]];
    const determinant = cross2(unit[count - 2], unit[count - 1]);
    if (Math.abs(determinant) < 1e-6) {
      throw new Error("Две последние стены идут параллельно: их длины нельзя вычислить. Введите их.");
    }
    lengths[count - 2] = cross2(need, unit[count - 1]) / determinant;
    lengths[count - 1] = cross2(unit[count - 2], need) / determinant;
    if (lengths[count - 2] < 0.05 || lengths[count - 1] < 0.05) {
      throw new Error("Размеры не сходятся: две последние стены получились бы короче 5 см. " +
        "Проверьте длины стен и углы.");
    }
  }

  // Stored form: counter-clockwise; clockwise entries are read backwards from corner B.
  const order = clockwise
    ? [0, ...Array.from({ length: count - 1 }, (_, index) => count - 1 - index)]
    : Array.from({ length: count }, (_, index) => index);
  const storedLengths = order.map((index) => lengths[index]);
  const turnBy = baseAngleDeg - (directions[order[0]] + (clockwise ? 180 : 0));
  const storedDirections = order.map((index) => directions[index] + (clockwise ? 180 : 0) + turnBy);
  const walls = order.map((index, position) => ({
    length_m: storedLengths[position],
    angle_deg: (((storedDirections[position] % 360) + 360) % 360),
    source: inferLast && index >= count - 2 ? "confirmed_inferred" : "measured",
  }));

  const chain = (lengthValues, degreeValues) => {
    const points = [[0, 0]];
    lengthValues.forEach((length, index) => {
      const radians = degreeValues[index] * Math.PI / 180;
      const last = points[points.length - 1];
      points.push([last[0] + length * Math.cos(radians), last[1] + length * Math.sin(radians)]);
    });
    return points;
  };
  const stored = chain(storedLengths, storedDirections);
  const entered = chain(lengths, directions);
  const gap = distance(stored[0], stored[count]);
  if (!isSimplePolygon(stored.slice(0, count))) {
    throw new Error("Контур пересекает сам себя. Проверьте порядок стен и углы.");
  }
  const interior = [angleA, ...angles];
  return {
    walls,
    stored,
    entered,
    gap_m: gap,
    zone: gap <= CLOSURE_GREEN_M + 1e-9 ? "green" : gap <= CLOSURE_LIMIT_M + 1e-9 ? "yellow" : "red",
    right_angles: interior.every((value) => Math.abs(value - 90) < 1e-9 || Math.abs(value - 270) < 1e-9),
    inferred: inferLast ? [count - 2, count - 1] : [],
    inferred_lengths_m: inferLast ? [lengths[count - 2], lengths[count - 1]] : [],
    interior_angles_deg: interior,
  };
}

export function createPolygonRoom({
  name = "Комната",
  wallLengthsM,
  interiorAnglesDeg,
  clockwise = false,
  wallThicknessM = 0.1,
  originM = [0, 0],
  baseAngleDeg = 0,
} = {}) {
  const thickness = positiveNumber(wallThicknessM, "Толщина стены");
  if (thickness > 2) throw new Error("Толщина стены: допустимо до 2 м.");
  if (!Array.isArray(originM) || originM.length !== 2 || !originM.every(Number.isFinite)) {
    throw new Error("Неверная начальная точка комнаты.");
  }
  if (!Number.isFinite(baseAngleDeg) || baseAngleDeg < -360 || baseAngleDeg > 360) {
    throw new Error("Неверное направление первой стены.");
  }
  const outline = solveOutline({ wallLengthsM, interiorAnglesDeg, baseAngleDeg, clockwise });
  if (outline.zone === "red") {
    throw new Error("Невязка " + Math.round(outline.gap_m * 100) +
      " см больше 15 см. Проверьте длины стен и углы.");
  }
  return {
    id: identifier("room"),
    name: requiredText(name, "Название комнаты", 120),
    origin_m: [...originM],
    wall_thickness_m: thickness,
    right_angles: outline.right_angles,
    walls: outline.walls.map((wall) => ({
      id: identifier("wall"),
      length_m: wall.length_m,
      angle_deg: wall.angle_deg,
      source: wall.source,
    })),
    openings: [],
    interiors: [],
  };
}

// The corners of the room outline. The last wall is taken to run to the first corner; the
// closing line that covers a small gap is only drawn, it is not a wall of its own.
export function roomPolygon(room) {
  return roomPoints(room).slice(0, -1);
}

export function roomPoints(room) {
  let [x, y] = room.origin_m;
  const points = [[x, y]];
  for (const wall of room.walls) {
    const angle = wall.angle_deg * Math.PI / 180;
    x += wall.length_m * Math.cos(angle);
    y += wall.length_m * Math.sin(angle);
    points.push([x, y]);
  }
  return points;
}

export function interiorPoints(room, interior) {
  const wallIndex = room.walls.findIndex((wall) => wall.id === interior.wall_id);
  if (wallIndex < 0) throw new Error("Внутренний объект ссылается на отсутствующую стену.");
  const points = roomPoints(room);
  const [start, end] = points.slice(wallIndex, wallIndex + 2);
  const length = distance(start, end);
  const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const direction = signedArea(points) > 0 ? 1 : -1;
  const inward = [-unit[1] * direction, unit[0] * direction];
  const partition = interior.kind === "storage" ? interior.partition_m : 0;
  const width = interior.width_m + 2 * partition;
  const depth = interior.depth_m + 2 * partition;
  return [[interior.offset_m, interior.inset_m], [interior.offset_m + width, interior.inset_m],
    [interior.offset_m + width, interior.inset_m + depth], [interior.offset_m, interior.inset_m + depth]]
    .map(([along, inside]) => [start[0] + unit[0] * along + inward[0] * inside,
      start[1] + unit[1] * along + inward[1] * inside]);
}

function storageApproachPoints(room, interior) {
  const contour = interiorPoints(room, interior);
  const start = contour[interior.door_wall];
  const end = contour[(interior.door_wall + 1) % 4];
  const length = distance(start, end);
  const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  const direction = signedArea([...contour, contour[0]]) > 0 ? 1 : -1;
  const center = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const first = [center[0] - unit[0] * interior.door_width_m / 2,
    center[1] - unit[1] * interior.door_width_m / 2];
  const second = [center[0] + unit[0] * interior.door_width_m / 2,
    center[1] + unit[1] * interior.door_width_m / 2];
  const outward = [direction * unit[1] * 0.001, -direction * unit[0] * 0.001];
  return [first, second, [second[0] + outward[0], second[1] + outward[1]],
    [first[0] + outward[0], first[1] + outward[1]]];
}

export function createInterior(room, values = {}) {
  const {
    kind = "storage", wallIndex = 0, offsetM = 0, insetM = 0, widthM, depthM,
    partitionM = 0.1, doorWidthM = 0.8, doorWall = 0, name = "Кладовка",
  } = values;
  if (!["storage", "column", "void"].includes(kind)) {
    throw new Error("Выберите кладовку, колонну или проём в перекрытии.");
  }
  if (!Number.isInteger(wallIndex) || wallIndex < 0 || wallIndex >= room.walls.length) {
    throw new Error("Выберите базовую стену внутреннего объекта.");
  }
  const numberAtLeastZero = (value, label) => {
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
      throw new Error(label + ": введите число от нуля.");
    }
    return parsed;
  };
  const interior = {
    id: identifier("interior"), kind, wall_id: room.walls[wallIndex].id,
    offset_m: numberAtLeastZero(offsetM, "Отступ вдоль стены"),
    inset_m: numberAtLeastZero(insetM, "Отступ внутрь комнаты"),
    width_m: positiveNumber(widthM, "Ширина объекта"),
    depth_m: positiveNumber(depthM, "Глубина объекта"),
  };
  if (kind !== "storage") return interior;
  interior.partition_m = positiveNumber(partitionM, "Толщина перегородок");
  if (interior.partition_m > 2) throw new Error("Толщина перегородок: допустимо до 2 м.");
  interior.door_width_m = positiveNumber(doorWidthM, "Ширина двери");
  interior.door_wall = Number(doorWall);
  if (!Number.isInteger(interior.door_wall) || interior.door_wall < 0 || interior.door_wall > 3) {
    throw new Error("Выберите сторону двери кладовки.");
  }
  interior.name = String(name ?? "").trim() || "Кладовка";
  if (interior.name.length > 120 || /[\x00-\x1f]/.test(interior.name)) {
    throw new Error("Название кладовки: одна строка до 120 символов.");
  }
  const doorSide = interior.door_wall % 2 === 0 ? interior.width_m : interior.depth_m;
  if (interior.door_width_m > doorSide - 0.1 + 1e-9) {
    throw new Error("Для двери оставьте по 5 см от углов выбранной стороны кладовки.");
  }
  return interior;
}

export function addInteriorToPackage(pkg, roomIndex, values) {
  const room = pkg?.rooms?.[roomIndex];
  if (!room) throw new Error("Выберите комнату для внутреннего объекта.");
  const next = structuredClone(pkg);
  next.rooms[roomIndex].interiors ??= [];
  next.rooms[roomIndex].interiors.push(createInterior(room, values));
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

export function removeInteriorFromPackage(pkg, roomIndex, interiorId) {
  const room = pkg?.rooms?.[roomIndex];
  if (!room?.interiors?.some((item) => item.id === interiorId)) {
    throw new Error("Внутренний объект не найден.");
  }
  const next = structuredClone(pkg);
  next.rooms[roomIndex].interiors = next.rooms[roomIndex].interiors.filter((item) => item.id !== interiorId);
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

export function updateInteriorInPackage(pkg, roomIndex, interiorId, values) {
  const room = pkg?.rooms?.[roomIndex];
  const interiorIndex = room?.interiors?.findIndex((item) => item.id === interiorId) ?? -1;
  if (interiorIndex < 0) throw new Error("Внутренний объект не найден.");
  const replacement = createInterior(room, values);
  replacement.id = interiorId;
  const next = structuredClone(pkg);
  next.rooms[roomIndex].interiors[interiorIndex] = replacement;
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

function validateInteriorFields(interior, wallIds) {
  requiredText(interior.id, "Номер внутреннего объекта", 80);
  if (!["storage", "column", "void"].includes(interior.kind) || !wallIds.has(interior.wall_id)) {
    throw new Error("Внутренний объект ссылается на неизвестную стену или имеет неверный тип.");
  }
  for (const [value, label, allowZero] of [
    [interior.offset_m, "Отступ вдоль стены", true],
    [interior.inset_m, "Отступ внутрь комнаты", true],
    [interior.width_m, "Ширина объекта", false],
    [interior.depth_m, "Глубина объекта", false],
  ]) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < (allowZero ? 0 : 0.01) || parsed > 10000) {
      throw new Error(label + ": неверное значение.");
    }
  }
  if (interior.kind !== "storage") return;
  const partition = positiveNumber(interior.partition_m, "Толщина перегородок");
  const doorWidth = positiveNumber(interior.door_width_m, "Ширина двери кладовки");
  if (partition > 2) throw new Error("Толщина перегородок: допустимо до 2 м.");
  if (!Number.isInteger(interior.door_wall) || interior.door_wall < 0 || interior.door_wall > 3) {
    throw new Error("Выберите сторону двери кладовки.");
  }
  requiredText(interior.name, "Название кладовки", 120);
  const doorSide = interior.door_wall % 2 === 0 ? interior.width_m : interior.depth_m;
  if (doorWidth > doorSide - 0.1 + 1e-9) {
    throw new Error("Для двери оставьте по 5 см от углов выбранной стороны кладовки.");
  }
}

function validateInteriors(room, wallIds) {
  const interiors = room.interiors ?? [];
  if (!Array.isArray(interiors) || interiors.length > 200) {
    throw new Error("Слишком много внутренних объектов.");
  }
  const outline = roomPolygon(room);
  const ids = new Set();
  const polygons = [];
  for (const interior of interiors) {
    validateInteriorFields(interior, wallIds);
    if (ids.has(interior.id)) throw new Error("Номера внутренних объектов не должны повторяться.");
    ids.add(interior.id);
    const polygon = interiorPoints(room, interior);
    if (!polygonContains(outline, polygon)) {
      throw new Error("Внутренний объект выходит за границы комнаты.");
    }
    if (polygons.some((other) => polygonsOverlap(polygon, other))) {
      throw new Error("Внутренние объекты перекрываются.");
    }
    polygons.push(polygon);
  }
  interiors.forEach((interior, index) => {
    if (interior.kind !== "storage") return;
    const approach = storageApproachPoints(room, interior);
    if (!polygonContains(outline, approach) ||
        polygons.some((other, otherIndex) => otherIndex !== index && polygonsOverlap(approach, other))) {
      throw new Error("Вход в кладовку упирается в стену или объект. Измените сторону двери или отступ.");
    }
  });
  const roomArea = Math.abs(signedArea(outline));
  const excludedArea = interiors.reduce((total, interior) => {
    const partition = interior.kind === "storage" ? interior.partition_m : 0;
    return total + (interior.width_m + 2 * partition) * (interior.depth_m + 2 * partition);
  }, 0);
  if (excludedArea >= roomArea - 1e-8) {
    throw new Error("Внутренние объекты занимают всю площадь комнаты.");
  }
}

export const OPENING_PRESETS = {
  door: [0.6, 0.7, 0.8, 0.9, 1.0],
  window: [0.6, 0.9, 1.3, 1.5, 1.8],
  passage: [0.8, 0.9, 1.0, 1.2, 1.5],
};

export function addOpening(room, {
  kind = "door",
  wallIndex = 0,
  offsetM = 0,
  widthM = 0.8,
  reverse = false,
} = {}) {
  if (!["door", "window", "passage"].includes(kind)) {
    throw new Error("Выберите дверь, окно или открытый проём.");
  }
  if (!Number.isInteger(wallIndex) || wallIndex < 0 || wallIndex >= room.walls.length) {
    throw new Error("Выберите стену для проёма.");
  }
  const offset = Number(String(offsetM).replace(",", "."));
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error("Отступ от угла не может быть отрицательным.");
  }
  const width = positiveNumber(widthM, "Ширина проёма");
  if (offset + width > room.walls[wallIndex].length_m + 1e-9) {
    throw new Error("Проём выходит за границы выбранной стены.");
  }
  const next = structuredClone(room);
  next.openings.push({
    id: identifier("opening"),
    kind,
    wall_id: room.walls[wallIndex].id,
    offset_m: offset,
    width_m: width,
    reverse: Boolean(reverse),
  });
  return next;
}

export function removeOpening(room, openingId) {
  const next = structuredClone(room);
  next.openings = next.openings.filter((opening) => opening.id !== openingId);
  return next;
}

export function connectionsForWall(pkg, roomIndex, wallId) {
  const roomId = pkg?.rooms?.[roomIndex]?.id;
  if (!roomId) return [];
  return pkg.connections.filter((connection) =>
    (connection.room_a_id === roomId && connection.wall_a_id === wallId) ||
    (connection.room_b_id === roomId && connection.wall_b_id === wallId),
  );
}

export function connectionForWall(pkg, roomIndex, wallId) {
  return connectionsForWall(pkg, roomIndex, wallId)[0] ?? null;
}

export function connectionForOpening(pkg, roomIndex, openingId) {
  const roomId = pkg?.rooms?.[roomIndex]?.id;
  if (!roomId) return null;
  return pkg.connections.find((connection) =>
    (connection.room_a_id === roomId && connection.opening_a_id === openingId) ||
    (connection.room_b_id === roomId && connection.opening_b_id === openingId),
  ) ?? null;
}

function fullWallConnection(pkg, roomIndex, wallId) {
  return connectionsForWall(pkg, roomIndex, wallId)
    .find((connection) => (connection.mode ?? "full_wall") === "full_wall") ?? null;
}

// Any number can be corrected, and the whole plan follows it (Bolat, 06.10.2026): people make mistakes.
// Rooms hang on the doors they were measured through; after every correction each room behind a door is put back
// against that door (`relayoutRooms`), so a corrected wall, door or thickness moves everything behind it.
function normalAngle(value) {
  const angle = Math.round((((value % 360) + 360) % 360) * 1e9) / 1e9;
  return angle >= 360 ? 0 : angle;
}
function roundMetres(value) {
  return Math.round(value * 1e9) / 1e9;
}
function setOwnThickness(room, wall, thickness) {
  if (Math.abs(thickness - room.wall_thickness_m) > 1e-8) wall.thickness_m = thickness;
  else delete wall.thickness_m;
}
// A rectangle keeps its opposite walls equal.
function setRoomWallLength(room, wallIndex, length) {
  room.walls[wallIndex].length_m = length;
  if (room.right_angles && room.walls.length === 4) room.walls[(wallIndex + 2) % 4].length_m = length;
}
function isRectangle(room) {
  return room.right_angles && room.walls.length === 4;
}

function connectionThickness(room, wall, opening, full) {
  return full ? wallThickness(room, wall) : opening?.wall_thickness_m ?? wallThickness(room, wall);
}
function placeChild(parent, child, connection) {
  const parentIndex = parent.walls.findIndex((wall) => wall.id === connection.wall_a_id);
  const childIndex = child.walls.findIndex((wall) => wall.id === connection.wall_b_id);
  const parentWall = parent.walls[parentIndex];
  const childWall = child.walls[childIndex];
  const openingA = parent.openings.find((item) => item.id === connection.opening_a_id);
  const openingB = child.openings.find((item) => item.id === connection.opening_b_id);
  const full = (connection.mode ?? "full_wall") === "full_wall";
  // A room behind a door stands as far as that door's wall is thick: one corridor wall may have doors into rooms
  // behind partitions of different thickness. A whole shared wall has one thickness.
  const thickness = connectionThickness(parent, parentWall, openingA, full);
  setOwnThickness(child, childWall, thickness);
  if (openingA && openingB) {
    openingB.kind = openingA.kind;
    openingB.width_m = openingA.width_m;
    openingA.wall_thickness_m = thickness;
    openingB.wall_thickness_m = thickness;
  }
  if (full) {
    if (Math.abs(childWall.length_m - parentWall.length_m) > 1e-9) setRoomWallLength(child, childIndex, parentWall.length_m);
    const source = wallOpenings(parent, parentWall.id);
    const target = wallOpenings(child, childWall.id).reverse();
    if (source.length === target.length) {
      source.forEach((opening, index) => {
        Object.assign(target[index], {
          kind: opening.kind,
          width_m: opening.width_m,
          offset_m: roundMetres(Math.max(0, parentWall.length_m - opening.offset_m - opening.width_m)),
          reverse: !opening.reverse,
          wall_thickness_m: thickness,
        });
        opening.wall_thickness_m = thickness;
      });
    }
  } else if (openingB) {
    // The door stays as far from the corner the technician measured from as he said.
    openingB.offset_m = roundMetres(connection.anchor_corner === "end"
      ? childWall.length_m - connection.anchor_offset_m - openingB.width_m
      : connection.anchor_offset_m);
  }
  const turn = normalAngle(parentWall.angle_deg + 180 - childWall.angle_deg);
  if (turn > 1e-9 && turn < 360 - 1e-9) {
    for (const wall of child.walls) wall.angle_deg = normalAngle(wall.angle_deg + turn);
  }
  const parentSide = roomWalls(parent)[parentIndex];
  const childSide = roomWalls({ ...child, origin_m: [0, 0] })[childIndex];
  const along = full ? parentSide.length : openingA.offset_m + openingA.width_m;
  const target = [
    parentSide.start[0] + parentSide.unit[0] * along + parentSide.outward[0] * thickness,
    parentSide.start[1] + parentSide.unit[1] * along + parentSide.outward[1] * thickness,
  ];
  const from = full ? childSide.start : [
    childSide.start[0] + childSide.unit[0] * openingB.offset_m,
    childSide.start[1] + childSide.unit[1] * openingB.offset_m,
  ];
  child.origin_m = [roundMetres(target[0] - from[0]), roundMetres(target[1] - from[1])];
}

// Puts every room back against the door it was measured through, from the first room outwards.
export function relayoutRooms(pkg) {
  const next = structuredClone(pkg);
  if (!next.rooms?.length) return next;
  const byId = new Map(next.rooms.map((room) => [room.id, room]));
  const placed = new Set([next.rooms[0].id]);
  const queue = [next.rooms[0].id];
  while (queue.length) {
    const parentId = queue.shift();
    for (const connection of next.connections ?? []) {
      if (connection.room_a_id !== parentId || placed.has(connection.room_b_id)) continue;
      placeChild(byId.get(parentId), byId.get(connection.room_b_id), connection);
      placed.add(connection.room_b_id);
      queue.push(connection.room_b_id);
    }
  }
  return next;
}
function finishEdit(next) {
  const result = relayoutRooms(next);
  result.updated_at = new Date().toISOString();
  validatePackage(result);
  return result;
}

// The other side of a whole shared wall: the room and the opening that mirrors this one.
function fullWallPartner(pkg, roomIndex, wallId) {
  const connection = fullWallConnection(pkg, roomIndex, wallId);
  if (!connection) return null;
  const roomId = pkg.rooms[roomIndex].id;
  const mine = connection.room_a_id === roomId;
  const otherId = mine ? connection.room_b_id : connection.room_a_id;
  const otherIndex = pkg.rooms.findIndex((room) => room.id === otherId);
  return { connection, otherIndex, otherWallId: mine ? connection.wall_b_id : connection.wall_a_id };
}
function mirroredOpening(pkg, roomIndex, opening) {
  const partner = fullWallPartner(pkg, roomIndex, opening.wall_id);
  if (!partner) return null;
  const length = pkg.rooms[roomIndex].walls.find((wall) => wall.id === opening.wall_id).length_m;
  const expected = length - opening.offset_m - opening.width_m;
  const other = pkg.rooms[partner.otherIndex].openings.find((item) => item.wall_id === partner.otherWallId &&
    Math.abs(item.offset_m - expected) < 1e-6 && Math.abs(item.width_m - opening.width_m) < 1e-6);
  return other ? { ...partner, opening: other } : null;
}

export function addOpeningToPackage(pkg, roomIndex, values) {
  const room = pkg?.rooms?.[roomIndex];
  const wall = room?.walls?.[values.wallIndex];
  if (!room || !wall) throw new Error("Выберите комнату и стену для проёма.");
  const next = structuredClone(pkg);
  next.rooms[roomIndex] = addOpening(room, values);
  // A whole shared wall has its openings on both sides: the room behind it gets the same one.
  const partner = fullWallPartner(pkg, roomIndex, wall.id);
  if (partner) {
    const added = next.rooms[roomIndex].openings.at(-1);
    const other = next.rooms[partner.otherIndex];
    const otherWall = other.walls.findIndex((item) => item.id === partner.otherWallId);
    next.rooms[partner.otherIndex] = addOpening(other, {
      kind: added.kind,
      wallIndex: otherWall,
      offsetM: roundMetres(Math.max(0, wall.length_m - added.offset_m - added.width_m)),
      widthM: added.width_m,
      reverse: !added.reverse,
    });
  }
  return finishEdit(next);
}

export function updateOpeningInPackage(pkg, roomIndex, openingId, values) {
  const room = pkg?.rooms?.[roomIndex];
  const openingIndex = room?.openings?.findIndex((item) => item.id === openingId) ?? -1;
  if (openingIndex < 0) throw new Error("Проём не найден.");
  const opening = room.openings[openingIndex];
  const targetWall = room.walls?.[values.wallIndex];
  if (!targetWall) throw new Error("Выберите комнату и стену для проёма.");
  const connection = connectionForOpening(pkg, roomIndex, opening.id);
  const mirror = mirroredOpening(pkg, roomIndex, opening);
  if ((connection || mirror) && targetWall.id !== opening.wall_id) {
    throw new Error("Дверь, за которой обмерена комната, двигается только вдоль своей стены.");
  }
  if (connection && values.kind === "window") throw new Error("За окном не бывает комнаты: выберите дверь или проём.");
  const roomWithoutOpening = removeOpening(room, openingId);
  const replacementRoom = addOpening(roomWithoutOpening, { ...values, reverse: opening.reverse });
  const replacement = replacementRoom.openings.at(-1);
  replacement.id = openingId;
  if (opening.wall_id === replacement.wall_id && opening.wall_thickness_m !== undefined) {
    replacement.wall_thickness_m = opening.wall_thickness_m;
  }
  const next = structuredClone(pkg);
  next.rooms[roomIndex].openings[openingIndex] = replacement;
  if (mirror) {
    const other = next.rooms[mirror.otherIndex].openings.find((item) => item.id === mirror.opening.id);
    Object.assign(other, {
      kind: replacement.kind,
      width_m: replacement.width_m,
      offset_m: roundMetres(Math.max(0, targetWall.length_m - replacement.offset_m - replacement.width_m)),
    });
  }
  if (connection && (connection.mode ?? "full_wall") === "door_anchor") {
    const nextConnection = next.connections.find((item) => item.id === connection.id);
    if (connection.room_b_id === room.id) {
      // The door of the room behind moved along its own wall: the room slides along the door.
      nextConnection.anchor_offset_m = roundMetres(connection.anchor_corner === "end"
        ? targetWall.length_m - replacement.offset_m - replacement.width_m
        : replacement.offset_m);
    } else {
      const child = next.rooms.find((item) => item.id === connection.room_b_id);
      child.openings.find((item) => item.id === connection.opening_b_id).width_m = replacement.width_m;
      child.openings.find((item) => item.id === connection.opening_b_id).kind = replacement.kind;
    }
  }
  return finishEdit(next);
}

// The first opening of the first room is the entrance from the stairs: its wall is the perimeter.
function isEntrance(pkg, roomIndex, openingId) {
  return roomIndex === 0 && pkg.rooms[0]?.openings?.[0]?.id === openingId;
}

export function setOpeningWallThickness(pkg, roomIndex, openingId, thicknessM) {
  const room = pkg?.rooms?.[roomIndex];
  const opening = room?.openings?.find((item) => item.id === openingId);
  if (!opening) throw new Error("Проём для толщины стены не найден.");
  const thickness = positiveNumber(thicknessM, "Толщина стены");
  if (thickness > 2) throw new Error("Толщина стены: допустимо до 2 м.");
  // The entrance names the perimeter: every room takes the corrected one.
  let next = isEntrance(pkg, roomIndex, openingId) && room.walls.find((wall) => wall.id === opening.wall_id)?.thickness_m === undefined
    ? setOuterWallThickness(pkg, thickness)
    : structuredClone(pkg);
  const nextRoom = next.rooms[roomIndex];
  const nextOpening = nextRoom.openings.find((item) => item.id === openingId);
  const wall = nextRoom.walls.find((item) => item.id === nextOpening.wall_id);
  nextOpening.wall_thickness_m = thickness;
  // Per-wall thickness (Bolat, 05.10.2026): the perimeter has one thickness (the room's), partitions their own.
  setOwnThickness(nextRoom, wall, thickness);
  // The room behind this door takes the corrected thickness and moves; rooms behind other doors of the same wall
  // stay where they are. A whole shared wall is one wall: both sides and all its openings change.
  for (const connection of connectionsForWall(next, roomIndex, wall.id)) {
    const full = (connection.mode ?? "full_wall") === "full_wall";
    const mine = connection.room_a_id === nextRoom.id;
    if (!full && (mine ? connection.opening_a_id : connection.opening_b_id) !== openingId) continue;
    const other = next.rooms.find((item) => item.id === (mine ? connection.room_b_id : connection.room_a_id));
    const otherWall = other.walls.find((item) => item.id === (mine ? connection.wall_b_id : connection.wall_a_id));
    setOwnThickness(other, otherWall, thickness);
    if (full) {
      for (const item of other.openings) if (item.wall_id === otherWall.id) item.wall_thickness_m = thickness;
      for (const item of nextRoom.openings) if (item.wall_id === wall.id) item.wall_thickness_m = thickness;
    } else {
      other.openings.find((item) => item.id === (mine ? connection.opening_b_id : connection.opening_a_id)).wall_thickness_m = thickness;
    }
  }
  return finishEdit(next);
}

// A corrected wall length (Bolat, 06.10.2026): a rectangle changes both opposite walls, and every room behind its
// doors moves with it. A wall shared whole with the room it was measured from is that room's wall.
export function setWallLength(pkg, roomIndex, wallIndex, lengthM) {
  const room = pkg?.rooms?.[roomIndex];
  const wall = room?.walls?.[wallIndex];
  if (!wall) throw new Error("Стена не найдена.");
  const length = positiveNumber(lengthM, "Длина стены");
  if (length < 0.05) throw new Error("Стена должна быть не меньше 0,05 м.");
  const sameWalls = isRectangle(room) ? [wallIndex, (wallIndex + 2) % 4] : [wallIndex];
  for (const index of sameWalls) {
    const incoming = pkg.connections.find((connection) => connection.room_b_id === room.id &&
      connection.wall_b_id === room.walls[index].id && (connection.mode ?? "full_wall") === "full_wall");
    if (incoming) {
      const parentIndex = pkg.rooms.findIndex((item) => item.id === incoming.room_a_id);
      const parentWall = pkg.rooms[parentIndex].walls.findIndex((item) => item.id === incoming.wall_a_id);
      return setWallLength(pkg, parentIndex, parentWall, length);
    }
  }
  const next = structuredClone(pkg);
  const nextRoom = next.rooms[roomIndex];
  setRoomWallLength(nextRoom, wallIndex, length);
  if (["inferred_opposite", "confirmed_inferred"].includes(nextRoom.walls[wallIndex].source)) {
    nextRoom.walls[wallIndex].source = "measured";
  }
  return finishEdit(next);
}

export function removeOpeningFromPackage(pkg, roomIndex, openingId) {
  const room = pkg?.rooms?.[roomIndex];
  const opening = room?.openings?.find((item) => item.id === openingId);
  if (!opening) throw new Error("Проём не найден.");
  if (connectionForOpening(pkg, roomIndex, opening.id)) {
    throw new Error("Нельзя удалить проём, через который связаны комнаты.");
  }
  const next = structuredClone(pkg);
  next.rooms[roomIndex] = removeOpening(room, openingId);
  // A whole shared wall loses the opening on both sides.
  const mirror = mirroredOpening(pkg, roomIndex, opening);
  if (mirror) next.rooms[mirror.otherIndex] = removeOpening(next.rooms[mirror.otherIndex], mirror.opening.id);
  return finishEdit(next);
}

// The perimeter thickness named at the entrance: every room takes it; walls with their own thickness
// (partitions, shared walls) keep theirs.
export function setOuterWallThickness(pkg, thicknessM) {
  const thickness = positiveNumber(thicknessM, "Толщина стены");
  if (thickness > 2) throw new Error("Толщина стены: допустимо до 2 м.");
  const next = structuredClone(pkg);
  next.rooms.forEach((room, roomIndex) => {
    for (const wall of room.walls) {
      // A shared wall without its own value would move with the perimeter: pin its present thickness.
      if (wall.thickness_m === undefined && connectionsForWall(pkg, roomIndex, wall.id).length) {
        wall.thickness_m = room.wall_thickness_m;
      }
      if (wall.thickness_m !== undefined && Math.abs(wall.thickness_m - thickness) <= 1e-8) delete wall.thickness_m;
    }
    room.wall_thickness_m = thickness;
  });
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}
// The thickness a wall is drawn and joined with: its own, otherwise the room's (the perimeter).
export function wallThickness(room, wall) {
  return wall?.thickness_m ?? room.wall_thickness_m;
}

export function createAdjacentRoom(pkg, {
  roomIndex,
  openingId,
  name,
  firstLengthM,
  secondLengthM,
  depthM,
  anchorCorner = "start",
  anchorOffsetM = 0,
  shape = null,
} = {}) {
  validatePackage(pkg);
  const parent = pkg.rooms[roomIndex];
  if (!parent) throw new Error("Исходная комната не найдена.");
  const opening = parent.openings.find((item) => item.id === openingId);
  if (!opening) throw new Error("Выберите дверь или проём для перехода.");
  if (opening.kind === "window") throw new Error("Через окно нельзя перейти в следующую комнату.");
  if (connectionForOpening(pkg, roomIndex, opening.id)) {
    throw new Error("Через этот проём уже создана комната.");
  }

  const wallIndex = parent.walls.findIndex((wall) => wall.id === opening.wall_id);
  const wall = parent.walls[wallIndex];
  const existingWallConnections = connectionsForWall(pkg, roomIndex, wall.id);
  if (existingWallConnections.some((connection) => (connection.mode ?? "full_wall") === "full_wall")) {
    throw new Error("За этой полной общей стеной уже создана комната.");
  }

  const first = firstLengthM === undefined
    ? wall.length_m
    : positiveNumber(firstLengthM, "Первая стена новой комнаты");
  // With a shape, the walls after the door wall and the corner angles come from it.
  const second = shape
    ? null
    : positiveNumber(secondLengthM ?? depthM, "Соседняя стена новой комнаты");
  if (first < 0.05 || (second !== null && second < 0.05)) {
    throw new Error("Стены новой комнаты должны быть не меньше 0,05 м.");
  }
  const fullWall = Math.abs(first - wall.length_m) <= 1e-6;
  let childOpeningOffset;
  let anchorOffset = 0;
  if (fullWall) {
    if (existingWallConnections.length) {
      throw new Error("На этой стене уже есть частично привязанная комната.");
    }
    childOpeningOffset = wall.length_m - opening.offset_m - opening.width_m;
  } else {
    if (!["start", "end"].includes(anchorCorner)) {
      throw new Error("Выберите угол A или B для привязки двери.");
    }
    if (anchorOffsetM === undefined || anchorOffsetM === null || String(anchorOffsetM).trim() === "") {
      throw new Error("Укажите расстояние от выбранного угла до ближайшего края двери.");
    }
    anchorOffset = Number(String(anchorOffsetM).replace(",", "."));
    if (!Number.isFinite(anchorOffset) || anchorOffset < 0) {
      throw new Error("Привязка двери от угла не может быть отрицательной.");
    }
    childOpeningOffset = anchorCorner === "start"
      ? anchorOffset
      : first - anchorOffset - opening.width_m;
    if (childOpeningOffset < -1e-9 || childOpeningOffset + opening.width_m > first + 1e-9) {
      throw new Error("Дверь с такой привязкой не помещается на первой стене новой комнаты.");
    }
    childOpeningOffset = Math.max(0, childOpeningOffset);
  }

  const points = roomPoints(parent);
  const start = points[wallIndex];
  const end = points[wallIndex + 1];
  const unit = [
    (end[0] - start[0]) / wall.length_m,
    (end[1] - start[1]) / wall.length_m,
  ];
  const winding = signedArea(points) > 0 ? 1 : -1;
  const outward = [winding * unit[1], -winding * unit[0]];
  // The new room keeps the perimeter thickness; only the wall it shares is as thick as the door's wall.
  const shared = opening.wall_thickness_m ?? wallThickness(parent, wall);
  const placement = {
    name,
    wallThicknessM: parent.wall_thickness_m,
    originM: [
      start[0] + unit[0] * (opening.offset_m + opening.width_m + childOpeningOffset) + outward[0] * shared,
      start[1] + unit[1] * (opening.offset_m + opening.width_m + childOpeningOffset) + outward[1] * shared,
    ],
    baseAngleDeg: (wall.angle_deg + 180) % 360,
  };
  const neighbor = shape
    ? createPolygonRoom({
      ...placement,
      wallLengthsM: [first, ...(shape.wallLengthsM ?? []).slice(1)],
      interiorAnglesDeg: shape.interiorAnglesDeg,
      clockwise: Boolean(shape.clockwise),
    })
    : createRectangleRoom({ ...placement, firstLengthM: first, secondLengthM: second });
  if (fullWall) neighbor.walls[0].source = "inherited_shared";
  if (Math.abs(shared - neighbor.wall_thickness_m) > 1e-8) neighbor.walls[0].thickness_m = shared;

  const mirroredIds = new Map();
  const sourceOpenings = fullWall ? wallOpenings(parent, wall.id) : [opening];
  neighbor.openings = sourceOpenings.map((source) => {
    const mirrored = {
      id: identifier("opening"),
      kind: source.kind,
      wall_id: neighbor.walls[0].id,
      offset_m: fullWall
        // Rounded past float noise (0.2999999999999996 -> 0.3), far below the 1e-7 tolerance of validation.
        ? Math.round(Math.max(0, wall.length_m - source.offset_m - source.width_m) * 1e9) / 1e9
        : childOpeningOffset,
      width_m: source.width_m,
      wall_thickness_m: shared,
      reverse: !Boolean(source.reverse),
    };
    mirroredIds.set(source.id, mirrored.id);
    return mirrored;
  });
  for (const existing of pkg.rooms) {
    if (roomsOverlap(existing, neighbor)) {
      throw new Error("Новая комната пересекается с уже построенной. Проверьте размеры, угол привязки и расстояние до двери.");
    }
  }

  const next = structuredClone(pkg);
  next.rooms.push(neighbor);
  const connection = {
    id: identifier("connection"),
    mode: fullWall ? "full_wall" : "door_anchor",
    room_a_id: parent.id,
    wall_a_id: wall.id,
    opening_a_id: opening.id,
    room_b_id: neighbor.id,
    wall_b_id: neighbor.walls[0].id,
    opening_b_id: mirroredIds.get(opening.id),
  };
  if (!fullWall) {
    connection.anchor_corner = anchorCorner;
    connection.anchor_offset_m = anchorOffset;
  }
  next.connections.push(connection);
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

// The rooms measured through this one, and further through them: they hang on its doors.
export function roomsBehind(pkg, roomIndex) {
  const start = pkg.rooms[roomIndex]?.id;
  const ids = new Set(start ? [start] : []);
  for (let added = true; added;) {
    added = false;
    for (const connection of pkg.connections ?? []) {
      if (ids.has(connection.room_a_id) && !ids.has(connection.room_b_id)) {
        ids.add(connection.room_b_id);
        added = true;
      }
    }
  }
  ids.delete(start);
  return pkg.rooms.flatMap((room, index) => ids.has(room.id) ? [index] : []);
}
// A wrongly measured room goes away with every room measured through it (Bolat, 06.10.2026: any edit must be
// possible). The door it was entered by stays: it is a real door, and the final check names it until a room is
// measured behind it again or the door itself is removed. The first room is the survey itself: "Новый замер".
export function removeRoomFromPackage(pkg, roomIndex) {
  if (roomIndex <= 0 || !pkg.rooms[roomIndex]) throw new Error("Первую комнату не удаляют: для этого есть «Новый замер».");
  const gone = new Set([roomIndex, ...roomsBehind(pkg, roomIndex)].map((index) => pkg.rooms[index].id));
  const next = structuredClone(pkg);
  next.rooms = next.rooms.filter((room) => !gone.has(room.id));
  next.connections = next.connections.filter((connection) => !gone.has(connection.room_a_id) && !gone.has(connection.room_b_id));
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

export function withRoom(pkg, room) {
  const next = structuredClone(pkg);
  next.rooms.push(room);
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

function validateRoomShape(room) {
  const points = roomPoints(room);
  if (distance(points[0], points[points.length - 1]) > CLOSURE_LIMIT_M + 1e-9) {
    throw new Error("Контур комнаты «" + room.name + "» не замкнут: невязка больше 15 см.");
  }
  if (!isSimplePolygon(roomPolygon(room))) {
    throw new Error("Контур комнаты «" + room.name + "» пересекает сам себя.");
  }
}

export function validatePackage(pkg) {
  if (!pkg || pkg.format !== FORMAT || pkg.version !== VERSION || pkg.units !== "m") {
    throw new Error("Неподдерживаемый формат замера.");
  }
  requiredText(pkg.package_id, "Номер пакета", 80);
  requiredText(pkg.address, "Адрес", 1000);
  if (pkg.ceiling_height_m !== undefined) {
    const height = positiveNumber(pkg.ceiling_height_m, "Высота потолка");
    if (height < 1.5 || height > 10) throw new Error("Высота потолка: от 1,5 до 10 м.");
  }
  if (!Array.isArray(pkg.rooms) || pkg.rooms.length < 1 || pkg.rooms.length > 100) {
    throw new Error("Добавьте хотя бы одну комнату.");
  }
  const rooms = new Map();
  for (const room of pkg.rooms) {
    requiredText(room.id, "Номер комнаты", 80);
    if (rooms.has(room.id)) throw new Error("Номера комнат не должны повторяться.");
    requiredText(room.name, "Название комнаты", 120);
    if (!Array.isArray(room.origin_m) || room.origin_m.length !== 2 || !room.origin_m.every(Number.isFinite)) {
      throw new Error("Неверное положение комнаты.");
    }
    positiveNumber(room.wall_thickness_m, "Толщина стены");
    if (room.wall_thickness_m > 2) throw new Error("Толщина стены: допустимо до 2 м.");
    if (!Array.isArray(room.walls) || room.walls.length < 3 || room.walls.length > 500) {
      throw new Error("В комнате должно быть от 3 до 500 стен.");
    }
    const wallIds = new Set();
    for (const wall of room.walls) {
      requiredText(wall.id, "Номер стены", 80);
      if (wallIds.has(wall.id)) throw new Error("Номера стен одной комнаты не должны повторяться.");
      wallIds.add(wall.id);
      positiveNumber(wall.length_m, "Длина стены");
      if (!Number.isFinite(wall.angle_deg) || wall.angle_deg < -360 || wall.angle_deg > 360) {
        throw new Error("Направление стены должно быть от −360 до 360°.");
      }
      if (!["measured", "inferred_opposite", "confirmed_inferred", "inherited_shared"].includes(wall.source)) {
        throw new Error("Неизвестный источник размера стены.");
      }
      if (wall.thickness_m !== undefined) {
        const own = positiveNumber(wall.thickness_m, "Толщина стены");
        if (own > 2) throw new Error("Толщина стены: допустимо до 2 м.");
      }
    }
    validateRoomShape(room);
    if (!Array.isArray(room.openings) || room.openings.length > 500) {
      throw new Error("Слишком много проёмов.");
    }
    const openingIds = new Set();
    for (const opening of room.openings) {
      requiredText(opening.id, "Номер проёма", 80);
      if (openingIds.has(opening.id)) throw new Error("Номера проёмов одной комнаты не должны повторяться.");
      openingIds.add(opening.id);
      if (!["door", "window", "passage"].includes(opening.kind) || !wallIds.has(opening.wall_id)) {
        throw new Error("Проём ссылается на неизвестную стену или имеет неверный тип.");
      }
      const wall = room.walls.find((item) => item.id === opening.wall_id);
      const offset = Number(opening.offset_m);
      const width = positiveNumber(opening.width_m, "Ширина проёма");
      if (opening.wall_thickness_m !== undefined) {
        const openingThickness = positiveNumber(opening.wall_thickness_m, "Толщина стены проёма");
        if (openingThickness > 2) throw new Error("Толщина стены проёма: допустимо до 2 м.");
      }
      if (!Number.isFinite(offset) || offset < 0 || offset + width > wall.length_m + 1e-9) {
        throw new Error("Проём выходит за границы выбранной стены.");
      }
    }
    validateInteriors(room, wallIds);
    rooms.set(room.id, { room, wallIds, openingIds });
  }

  if (!Array.isArray(pkg.connections) || pkg.connections.length > 2500) {
    throw new Error("Некорректный список связей комнат.");
  }
  const connectionIds = new Set();
  const connectedOpenings = new Set();
  const wallConnectionModes = new Map();
  const openingSegment = (room, wallIndex, opening) => {
    const points = roomPoints(room);
    const start = points[wallIndex];
    const end = points[wallIndex + 1];
    const length = room.walls[wallIndex].length_m;
    const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    return [
      [start[0] + unit[0] * opening.offset_m, start[1] + unit[1] * opening.offset_m],
      [
        start[0] + unit[0] * (opening.offset_m + opening.width_m),
        start[1] + unit[1] * (opening.offset_m + opening.width_m),
      ],
    ];
  };
  for (const connection of pkg.connections) {
    requiredText(connection.id, "Номер связи", 80);
    if (connectionIds.has(connection.id)) throw new Error("Номера связей не должны повторяться.");
    connectionIds.add(connection.id);
    const mode = connection.mode ?? "full_wall";
    if (!["full_wall", "door_anchor"].includes(mode)) {
      throw new Error("Неизвестный способ связи комнат.");
    }
    const a = rooms.get(connection.room_a_id);
    const b = rooms.get(connection.room_b_id);
    if (!a || !b || connection.room_a_id === connection.room_b_id) {
      throw new Error("Связь ссылается на отсутствующую или ту же комнату.");
    }
    if (!a.wallIds.has(connection.wall_a_id) || !b.wallIds.has(connection.wall_b_id)) {
      throw new Error("Связь ссылается на отсутствующую стену.");
    }

    const aKey = connection.room_a_id + ":" + connection.wall_a_id;
    const bKey = connection.room_b_id + ":" + connection.wall_b_id;
    for (const key of [aKey, bKey]) {
      const modes = wallConnectionModes.get(key) ?? [];
      if (mode === "full_wall" ? modes.length > 0 : modes.includes("full_wall")) {
        throw new Error("Полная общая стена не может одновременно иметь другие связи.");
      }
      modes.push(mode);
      wallConnectionModes.set(key, modes);
    }

    const hasOpeningA = connection.opening_a_id !== undefined;
    const hasOpeningB = connection.opening_b_id !== undefined;
    if (hasOpeningA !== hasOpeningB || (mode === "door_anchor" && !hasOpeningA)) {
      throw new Error("В дверной связи должны быть указаны оба переходных проёма.");
    }
    let openingA = null;
    let openingB = null;
    if (hasOpeningA) {
      openingA = a.room.openings.find((item) => item.id === connection.opening_a_id);
      openingB = b.room.openings.find((item) => item.id === connection.opening_b_id);
      if (!openingA || !openingB || openingA.wall_id !== connection.wall_a_id ||
          openingB.wall_id !== connection.wall_b_id || openingA.kind === "window" || openingB.kind === "window") {
        throw new Error("Связь ссылается на неверный переходный проём.");
      }
      const aOpeningKey = connection.room_a_id + ":" + connection.opening_a_id;
      const bOpeningKey = connection.room_b_id + ":" + connection.opening_b_id;
      if (connectedOpenings.has(aOpeningKey) || connectedOpenings.has(bOpeningKey)) {
        throw new Error("Один проём не может вести в две комнаты.");
      }
      connectedOpenings.add(aOpeningKey);
      connectedOpenings.add(bOpeningKey);
      if (openingA.kind !== openingB.kind ||
          Math.abs(openingA.width_m - openingB.width_m) > 1e-7 ||
          Boolean(openingA.reverse) === Boolean(openingB.reverse)) {
        throw new Error("Переходные проёмы двух комнат не совпадают.");
      }
    }

    const aWallIndex = a.room.walls.findIndex((wall) => wall.id === connection.wall_a_id);
    const bWallIndex = b.room.walls.findIndex((wall) => wall.id === connection.wall_b_id);
    const aPoints = roomPoints(a.room);
    const bPoints = roomPoints(b.room);
    const start = aPoints[aWallIndex];
    const end = aPoints[aWallIndex + 1];
    const wallLength = a.room.walls[aWallIndex].length_m;
    const winding = signedArea(aPoints) > 0 ? 1 : -1;
    const outward = [
      winding * (end[1] - start[1]) / wallLength,
      -winding * (end[0] - start[0]) / wallLength,
    ];
    // The gap between connected rooms is the thickness of the door's wall (a whole shared wall: of that wall),
    // the same from both sides.
    const full = mode === "full_wall";
    const thickness = connectionThickness(a.room, a.room.walls[aWallIndex], openingA, full);
    if (Math.abs(thickness - connectionThickness(b.room, b.room.walls[bWallIndex], openingB, full)) > 1e-8) {
      throw new Error("Толщина общей стены связанных комнат не совпадает.");
    }

    if (mode === "full_wall") {
      const expected = [
        [end[0] + outward[0] * thickness, end[1] + outward[1] * thickness],
        [start[0] + outward[0] * thickness, start[1] + outward[1] * thickness],
      ];
      if (distance(expected[0], bPoints[bWallIndex]) > 1e-7 ||
          distance(expected[1], bPoints[bWallIndex + 1]) > 1e-7) {
        throw new Error("Полная общая стена связанной комнаты смещена.");
      }

      const expectedOpenings = wallOpenings(a.room, connection.wall_a_id).map((opening) => ({
        kind: opening.kind,
        offset_m: wallLength - opening.offset_m - opening.width_m,
        width_m: opening.width_m,
        reverse: !Boolean(opening.reverse),
      })).sort((first, second) => first.offset_m - second.offset_m);
      const actualOpenings = wallOpenings(b.room, connection.wall_b_id);
      if (expectedOpenings.length !== actualOpenings.length || expectedOpenings.some((opening, index) => {
        const actual = actualOpenings[index];
        return opening.kind !== actual.kind || opening.reverse !== Boolean(actual.reverse) ||
          Math.abs(opening.offset_m - actual.offset_m) > 1e-7 ||
          Math.abs(opening.width_m - actual.width_m) > 1e-7;
      })) {
        throw new Error("Проёмы полной общей стены не совпадают.");
      }
      continue;
    }

    if (!["start", "end"].includes(connection.anchor_corner)) {
      throw new Error("Для дверной привязки нужен угол A или B.");
    }
    const anchorOffset = Number(connection.anchor_offset_m);
    if (!Number.isFinite(anchorOffset) || anchorOffset < 0) {
      throw new Error("Неверное расстояние привязки двери от угла.");
    }
    const childWall = b.room.walls[bWallIndex];
    const derivedAnchor = connection.anchor_corner === "start"
      ? openingB.offset_m
      : childWall.length_m - openingB.offset_m - openingB.width_m;
    if (Math.abs(anchorOffset - derivedAnchor) > 1e-7) {
      throw new Error("Привязка двери не совпадает с положением проёма новой комнаты.");
    }

    const parentSegment = openingSegment(a.room, aWallIndex, openingA);
    const childSegment = openingSegment(b.room, bWallIndex, openingB);
    const expectedChild = [
      [
        parentSegment[1][0] + outward[0] * thickness,
        parentSegment[1][1] + outward[1] * thickness,
      ],
      [
        parentSegment[0][0] + outward[0] * thickness,
        parentSegment[0][1] + outward[1] * thickness,
      ],
    ];
    if (distance(expectedChild[0], childSegment[0]) > 1e-7 ||
        distance(expectedChild[1], childSegment[1]) > 1e-7) {
      throw new Error("Дверная привязка новой комнаты смещена.");
    }
  }
  return pkg;
}

// The final plan check (Bolat, 05.10.2026): after "Закончить замер" the app itself decides whether it
// understands the whole plan, and names every place it does not, with a point to mark on the plan.
const THIN_WALL_M = 0.05;
const PARTITION_MAX_M = 0.6;
const FACING_MIN_M = 0.3;

function roomWalls(room) {
  const points = roomPoints(room);
  const winding = signedArea(points.slice(0, -1)) > 0 ? 1 : -1;
  return room.walls.map((wall, index) => {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    const unit = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
    return { wall, index, start, end, length, unit, outward: [winding * unit[1], -winding * unit[0]] };
  });
}

// Walls of two different rooms that look at each other across a partition: antiparallel, overlapping along
// at least 30 cm, the second within 60 cm in front of the first. gap_m < 0 means the rooms overlap there.
function facingWalls(pkg, minGap = -0.02) {
  const walls = pkg.rooms.map(roomWalls);
  const result = [];
  for (let first = 0; first < walls.length; first += 1) {
    for (let second = first + 1; second < walls.length; second += 1) {
      for (const a of walls[first]) {
        for (const b of walls[second]) {
          if (a.unit[0] * b.unit[0] + a.unit[1] * b.unit[1] > -0.999) continue;
          const gap = (b.start[0] - a.start[0]) * a.outward[0] + (b.start[1] - a.start[1]) * a.outward[1];
          if (gap < minGap || gap > PARTITION_MAX_M) continue;
          const along = (point) => (point[0] - a.start[0]) * a.unit[0] + (point[1] - a.start[1]) * a.unit[1];
          const from = Math.max(0, Math.min(along(b.start), along(b.end)));
          const to = Math.min(a.length, Math.max(along(b.start), along(b.end)));
          if (to - from < FACING_MIN_M) continue;
          const middle = (from + to) / 2;
          result.push({
            roomA: first, wallA: a.index, roomB: second, wallB: b.index, gap_m: gap, along_m: to - from,
            lengthA: a.length, lengthB: b.length,
            point: [
              a.start[0] + a.unit[0] * middle + a.outward[0] * gap / 2,
              a.start[1] + a.unit[1] * middle + a.outward[1] * gap / 2,
            ],
          });
        }
      }
    }
  }
  return result;
}

function wallConnected(pkg, roomIndex, wallId) {
  return connectionsForWall(pkg, roomIndex, wallId).length > 0;
}

// A wall facing a neighbour room that is not joined through it is a partition as thick as the gap between them:
// the app takes that thickness itself instead of drawing the perimeter thickness through the neighbour.
export function inferPartitionThickness(pkg) {
  validatePackage(pkg);
  const next = structuredClone(pkg);
  let changed = false;
  for (const pair of facingWalls(pkg)) {
    if (pair.gap_m < THIN_WALL_M) continue;
    const thickness = Math.round(pair.gap_m * 1000) / 1000;
    for (const [roomIndex, wallIndex, length] of [[pair.roomA, pair.wallA, pair.lengthA], [pair.roomB, pair.wallB, pair.lengthB]]) {
      // One thickness per wall: a wall that mostly looks outside stays the perimeter even if its end meets a room.
      if (pair.along_m < length / 2) continue;
      const room = next.rooms[roomIndex];
      const wall = room.walls[wallIndex];
      if (wall.thickness_m !== undefined || wallConnected(pkg, roomIndex, wall.id)) continue;
      if (Math.abs(thickness - room.wall_thickness_m) <= 1e-8) continue;
      wall.thickness_m = thickness;
      changed = true;
    }
  }
  if (!changed) return pkg;
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

function openingMiddle(room, walls, opening, outwardBy) {
  const wall = walls.find((item) => item.wall.id === opening.wall_id);
  const along = opening.offset_m + opening.width_m / 2;
  return [
    wall.start[0] + wall.unit[0] * along + wall.outward[0] * outwardBy,
    wall.start[1] + wall.unit[1] * along + wall.outward[1] * outwardBy,
  ];
}

// Two rooms that come too close are fixed by their sizes across that wall: the wall next to each facing one
// (in a rectangle, the room's width that way). The later room first: it is the one measured last.
function sizeFixes(pkg, pair) {
  return [[pair.roomB, pair.wallB], [pair.roomA, pair.wallA]].map(([roomIndex, wallIndex]) => {
    const room = pkg.rooms[roomIndex];
    const next = (wallIndex + 1) % room.walls.length;
    return { type: "wall", roomIndex, wallIndex: next, value: room.walls[next].length_m };
  });
}

// Places the app does not understand for drawing the final plan. Each has a point on the plan (metres)
// and the room where it is fixed. The entrance (first opening of the first room) leads outside.
export function planProblems(pkg) {
  const problems = [];
  const walls = pkg.rooms.map(roomWalls);
  const polygons = pkg.rooms.map(roomPolygon);
  const centre = (index) => {
    const points = polygons[index];
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  };
  pkg.rooms.forEach((room, roomIndex) => {
    const doors = room.openings.filter((opening) => opening.kind !== "window");
    if (!doors.length) {
      problems.push({ kind: "no_door", roomIndex, point: centre(roomIndex) });
    }
    for (const opening of room.openings) {
      if (!(opening.wall_thickness_m > 0)) {
        problems.push({
          kind: "no_thickness", roomIndex, openingId: opening.id, point: openingMiddle(room, walls[roomIndex], opening, 0),
          fixes: [{ type: "thickness", roomIndex, openingId: opening.id, value: null }],
        });
      }
    }
    for (const opening of doors) {
      if (roomIndex === 0 && opening.id === room.openings[0]?.id) continue;
      if (connectionForOpening(pkg, roomIndex, opening.id)) continue;
      const wall = room.walls.find((item) => item.id === opening.wall_id);
      const thickness = wallThickness(room, wall);
      // Is there a room just behind this door, measured through another door?
      const behind = [thickness + 0.1, PARTITION_MAX_M + 0.1]
        .map((by) => openingMiddle(room, walls[roomIndex], opening, by))
        .map((probe) => polygons.findIndex((polygon, index) => index !== roomIndex && strictlyInside(polygon, probe)))
        .find((index) => index >= 0);
      if (behind === undefined) {
        problems.push({ kind: "door_leads_nowhere", roomIndex, openingId: opening.id, point: openingMiddle(room, walls[roomIndex], opening, 0) });
        continue;
      }
      // The room behind must have the same door in the same place, or its wall would be drawn solid there.
      const middle = openingMiddle(room, walls[roomIndex], opening, 0);
      const matched = pkg.rooms[behind].openings.some((other) => {
        if (other.kind === "window") return false;
        const otherMiddle = openingMiddle(pkg.rooms[behind], walls[behind], other, 0);
        return distance(middle, otherMiddle) <= thickness + CLOSURE_LIMIT_M + opening.width_m / 2;
      });
      if (!matched) {
        problems.push({ kind: "door_missing_behind", roomIndex: behind, fromRoomIndex: roomIndex, openingId: opening.id, point: middle });
      }
    }
  });
  for (let first = 0; first < polygons.length; first += 1) {
    for (let second = first + 1; second < polygons.length; second += 1) {
      if (polygonInteriorsOverlap(polygons[first], polygons[second])) {
        const pair = facingWalls(pkg, -PARTITION_MAX_M)
          .filter((item) => item.roomA === first && item.roomB === second)
          .sort((one, two) => one.gap_m - two.gap_m)[0];
        problems.push({
          kind: "rooms_overlap", roomIndex: second, otherRoomIndex: first, point: pair?.point ?? centre(second),
          fixes: pair ? sizeFixes(pkg, pair) : [],
        });
      }
    }
  }
  const overlapping = new Set(problems.filter((item) => item.kind === "rooms_overlap")
    .map((item) => item.otherRoomIndex + ":" + item.roomIndex));
  for (const pair of facingWalls(pkg)) {
    if (pair.gap_m >= THIN_WALL_M || overlapping.has(pair.roomA + ":" + pair.roomB)) continue;
    const a = pkg.rooms[pair.roomA];
    const b = pkg.rooms[pair.roomB];
    const wallA = a.walls[pair.wallA].id;
    const wallB = b.walls[pair.wallB].id;
    // Two walls joined through a door are exactly the named thickness apart: nothing to understand there.
    const joined = (pkg.connections ?? []).some((connection) =>
      (connection.room_a_id === a.id && connection.wall_a_id === wallA && connection.room_b_id === b.id && connection.wall_b_id === wallB) ||
      (connection.room_a_id === b.id && connection.wall_a_id === wallB && connection.room_b_id === a.id && connection.wall_b_id === wallA));
    if (joined) continue;
    problems.push({
      kind: "thin_wall", roomIndex: pair.roomB, otherRoomIndex: pair.roomA, gap_m: pair.gap_m, point: pair.point,
      fixes: sizeFixes(pkg, pair),
    });
  }
  // The plan carries the ceiling height once, in the largest room (Bolat, 06.10.2026, as on the official plan):
  // it is asked here, at the end, not in the middle of the survey.
  if (!(pkg.ceiling_height_m > 0) && pkg.rooms.length) {
    const largest = pkg.rooms.reduce((best, room, index) =>
      Math.abs(signedArea(roomPolygon(room))) > Math.abs(signedArea(roomPolygon(pkg.rooms[best]))) ? index : best, 0);
    problems.push({ kind: "no_height", roomIndex: largest, point: centre(largest), fixes: [{ type: "height", roomIndex: largest, value: null }] });
  }
  return problems;
}

export function setCeilingHeight(pkg, heightM) {
  const height = positiveNumber(heightM, "Высота потолка");
  if (height < 1.5 || height > 10) throw new Error("Высота потолка: от 1,5 до 10 м. Назовите ещё раз.");
  const next = structuredClone(pkg);
  next.ceiling_height_m = height;
  next.updated_at = new Date().toISOString();
  validatePackage(next);
  return next;
}

export function fileNameFor(pkg) {
  const safe = pkg.address.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
  return (safe || "замер") + ".abris.json";
}
