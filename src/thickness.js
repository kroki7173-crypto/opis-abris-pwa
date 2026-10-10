import { facingWalls, roomWalls, setWallThickness, wallThickness } from "./model.js";

// Допуски для продолжения наружной стены через соседнюю комнату.
export const LINE_OFFSET_M = 0.1;
export const LINE_GAP_M = 0.8;
const PARALLEL_DOT = 0.999;
const EPSILON = 1e-8;

export function isHouseAddress(address) {
  const text = String(address ?? "");
  return !/[\\/]/.test(text) &&
    !/(?:^|[^\p{L}])(?:кв(?:артира)?|ч(?:асть)?|пом(?:ещение)?)(?=$|[^\p{L}])/iu.test(text);
}

function key(roomIndex, wallIndex) {
  return `${roomIndex}:${wallIndex}`;
}

function wallRows(pkg) {
  return pkg.rooms.flatMap((room, roomIndex) => roomWalls(room).map((geometry) => ({
    ...geometry, roomIndex, wallIndex: geometry.index, wallId: geometry.wall.id,
  })));
}

function sameLine(a, b) {
  if (a.roomIndex === b.roomIndex) return false;
  if (Math.abs(a.unit[0] * b.unit[0] + a.unit[1] * b.unit[1]) < PARALLEL_DOT) return false;
  if (a.outward[0] * b.outward[0] + a.outward[1] * b.outward[1] < PARALLEL_DOT) return false;
  const dx = b.start[0] - a.start[0];
  const dy = b.start[1] - a.start[1];
  if (Math.abs(dx * a.outward[0] + dy * a.outward[1]) > LINE_OFFSET_M + EPSILON) return false;
  const first = dx * a.unit[0] + dy * a.unit[1];
  const second = (b.end[0] - a.start[0]) * a.unit[0] + (b.end[1] - a.start[1]) * a.unit[1];
  const gap = Math.max(0, Math.min(first, second) - a.length, -Math.max(first, second));
  return gap <= LINE_GAP_M + EPSILON;
}

function connectedSides(pkg, connection) {
  const roomA = pkg.rooms.findIndex((room) => room.id === connection.room_a_id);
  const roomB = pkg.rooms.findIndex((room) => room.id === connection.room_b_id);
  if (roomA < 0 || roomB < 0) return null;
  const wallA = pkg.rooms[roomA].walls.findIndex((wall) => wall.id === connection.wall_a_id);
  const wallB = pkg.rooms[roomB].walls.findIndex((wall) => wall.id === connection.wall_b_id);
  if (wallA < 0 || wallB < 0) return null;
  return { a: key(roomA, wallA), b: key(roomB, wallB), roomA, roomB };
}

function openingHasThickness(room, openingId, wallId) {
  const opening = room.openings.find((item) => item.id === openingId && item.wall_id === wallId);
  return Number.isFinite(opening?.wall_thickness_m);
}

function topology(pkg) {
  const rows = wallRows(pkg);
  const byKey = new Map(rows.map((row) => [key(row.roomIndex, row.wallIndex), row]));
  const byId = new Map(rows.map((row) => [row.wallId, row]));
  const partition = new Set();
  const partners = new Map();
  const doors = new Map();
  const addEdge = (map, a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a).add(b);
    map.get(b).add(a);
  };
  for (const pair of facingWalls(pkg)) {
    const a = key(pair.roomA, pair.wallA);
    const b = key(pair.roomB, pair.wallB);
    partition.add(a);
    partition.add(b);
    addEdge(partners, a, b);
  }
  for (const connection of pkg.connections ?? []) {
    const sides = connectedSides(pkg, connection);
    if (!sides) continue;
    partition.add(sides.a);
    partition.add(sides.b);
    const a = byKey.get(sides.a);
    const b = byKey.get(sides.b);
    if (openingHasThickness(pkg.rooms[sides.roomA], connection.opening_a_id, a.wallId) ||
        openingHasThickness(pkg.rooms[sides.roomB], connection.opening_b_id, b.wallId)) {
      addEdge(doors, sides.a, sides.b);
    }
  }
  const line = new Map();
  const outer = rows.filter((row) => !partition.has(key(row.roomIndex, row.wallIndex)));
  for (let first = 0; first < outer.length; first += 1) {
    for (let second = first + 1; second < outer.length; second += 1) {
      const a = outer[first];
      const b = outer[second];
      if (sameLine(a, b)) addEdge(line, key(a.roomIndex, a.wallIndex), key(b.roomIndex, b.wallIndex));
    }
  }
  return { rows, byKey, byId, outer, partners, doors, line };
}

export function thicknessStatus(pkg, said = [], { house = isHouseAddress(pkg?.address) } = {}) {
  const graph = topology(pkg);
  const known = [...new Set(said)].filter((id) => graph.byId.has(id));
  const knownSet = new Set(known);
  const assignments = new Map();
  const assign = (targetKey, status, from, priority, order) => {
    const row = graph.byKey.get(targetKey);
    if (!row || knownSet.has(row.wallId)) return;
    const old = assignments.get(targetKey);
    if (!old || priority > old.priority || priority === old.priority && order >= old.order) {
      assignments.set(targetKey, { status, from, priority, order });
    }
  };
  const entrance = pkg.rooms[0]?.openings?.[0];
  const entranceId = pkg.rooms[0]?.walls?.find((wall) => wall.id === entrance?.wall_id)?.id;
  if (house && knownSet.has(entranceId)) {
    for (const row of graph.outer) assign(key(row.roomIndex, row.wallIndex), "house", entranceId, 1, known.indexOf(entranceId));
  }
  known.forEach((id, order) => {
    const source = graph.byId.get(id);
    const start = key(source.roomIndex, source.wallIndex);
    const queue = [start];
    const seen = new Set(queue);
    while (queue.length) {
      const current = queue.shift();
      for (const adjacent of graph.line.get(current) ?? []) {
        if (seen.has(adjacent)) continue;
        seen.add(adjacent);
        queue.push(adjacent);
        assign(adjacent, "line", id, 2, order);
      }
    }
    for (const adjacent of graph.partners.get(start) ?? []) assign(adjacent, "partner", id, 3, order);
    for (const adjacent of graph.doors.get(start) ?? []) assign(adjacent, "door", id, 4, order);
  });
  return graph.rows.map((row) => {
    const result = { roomIndex: row.roomIndex, wallIndex: row.wallIndex, wallId: row.wallId };
    if (knownSet.has(row.wallId)) return { ...result, status: "said" };
    const source = assignments.get(key(row.roomIndex, row.wallIndex));
    return source ? { ...result, status: source.status, from: source.from } : { ...result, status: "open" };
  });
}

export function nameThickness(pkg, roomIndex, wallIndex, thicknessM, said = [], { house = isHouseAddress(pkg?.address) } = {}) {
  const wall = pkg?.rooms?.[roomIndex]?.walls?.[wallIndex];
  if (!wall) throw new Error("Стена не найдена.");
  const existing = new Map(wallRows(pkg).map((row) => [row.wallId, wallThickness(pkg.rooms[row.roomIndex], row.wall)]));
  const named = [...new Set(said.filter((id) => existing.has(id) && id !== wall.id)), wall.id];
  const protectedValues = new Map(named.filter((id) => id !== wall.id).map((id) => [id, existing.get(id)]));
  const protect = (candidate) => {
    const rows = wallRows(candidate);
    const byId = new Map(rows.map((row) => [row.wallId, wallThickness(candidate.rooms[row.roomIndex], row.wall)]));
    return [...protectedValues].every(([id, value]) => Math.abs(byId.get(id) - value) <= EPSILON);
  };
  let next = setWallThickness(pkg, roomIndex, wallIndex, thicknessM);
  if (!protect(next)) throw new Error("Названная толщина соседней стены не может быть изменена автоматически.");
  const statuses = thicknessStatus(next, named, { house });
  for (const item of statuses) {
    if (item.status === "open" || item.status === "said") continue;
    const source = next.rooms.flatMap((room) => room.walls).find((candidate) => candidate.id === item.from);
    const sourceRoom = next.rooms.find((room) => room.walls.some((candidate) => candidate.id === item.from));
    if (!source || !sourceRoom) continue;
    const target = next.rooms[item.roomIndex].walls[item.wallIndex];
    const value = wallThickness(sourceRoom, source);
    if (Math.abs(wallThickness(next.rooms[item.roomIndex], target) - value) <= EPSILON) continue;
    const candidate = setWallThickness(next, item.roomIndex, item.wallIndex, value);
    if (protect(candidate)) next = candidate;
  }
  const spread = wallRows(next).filter((row) => !named.includes(row.wallId) &&
    Math.abs(wallThickness(next.rooms[row.roomIndex], row.wall) - existing.get(row.wallId)) > EPSILON)
    .map((row) => row.wallId);
  return { pkg: next, said: named, spread };
}