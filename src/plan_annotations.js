import { interiorPoints, roomPoints } from "./model.js";

function signedArea(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function contains(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function labelPoint(outline, holes) {
  const area = signedArea(outline);
  const cross = (a, b) => a[0] * b[1] - b[0] * a[1];
  const centroid = [0, 1].map((axis) => outline.reduce((sum, a, index) => {
    const b = outline[(index + 1) % outline.length];
    return sum + (a[axis] + b[axis]) * cross(a, b);
  }, 0) / (6 * area));
  const available = (point) => contains(point, outline) && !holes.some((hole) => contains(point, hole));
  if (centroid.every(Number.isFinite) && available(centroid)) return centroid;

  const rings = [outline, ...holes];
  const levels = [...new Set(rings.flatMap((ring) => ring.map((point) => point[1])))].sort((a, b) => a - b);
  let best = null;
  for (let index = 0; index < levels.length - 1; index += 1) {
    const low = levels[index];
    const high = levels[index + 1];
    const y = (low + high) / 2;
    const xs = rings.flatMap((ring) => ring.flatMap((a, edge) => {
      const b = ring[(edge + 1) % ring.length];
      return (a[1] > y) !== (b[1] > y)
        ? [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])] : [];
    })).sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < xs.length; pair += 2) {
      const point = [(xs[pair] + xs[pair + 1]) / 2, y];
      const score = Math.min(xs[pair + 1] - xs[pair], high - low);
      if (score > (best?.score ?? 0) && available(point)) best = { point, score };
    }
  }
  return best?.point ?? outline[0];
}

export function planRoomAnnotations(room) {
  const outline = roomPoints(room).slice(0, -1);
  const holes = (room.interiors ?? []).map((item) => interiorPoints(room, item));
  const orientation = Math.sign(signedArea(outline)) || 1;
  const walls = room.walls.map((wall, index) => {
    const start = outline[index];
    const end = outline[(index + 1) % outline.length];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
    return {
      start, end, length_m: wall.length_m,
      point: [(start[0] + end[0]) / 2 - orientation * (end[1] - start[1]) / length * 0.16,
        (start[1] + end[1]) / 2 + orientation * (end[0] - start[0]) / length * 0.16],
    };
  });
  return {
    walls,
    area_m2: Math.max(0, Math.abs(signedArea(outline)) -
      holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)),
    point: labelPoint(outline, holes),
  };
}
