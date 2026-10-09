// A measuring phrase said through the green microphone (Bolat, 09.10.2026): several sizes, openings and rooms at once,
// e.g. "стена 5 метров, на ней дверь метр семьдесят от правого края, с правой стороны стенка метр семьдесят ...
// вхожу в правую дверь, три метра правая стенка". Two steps, both without the screen:
//   readPhrase(text)            — words into parts: what is said about the walls of a room, and going through a door;
//   planPhrase(part, room, ...) — one part's walls onto the walls and corners of a room.
// Nothing is guessed: what is not said is left empty and the app asks for it; words not understood are returned.
// The rules are in AGENTS.md ("будущий составной голосовой замер") and docs/proposals/2026-10-09_voice-measurement-plan.md.
import { isNumberWord, isSizeWord, spokenMeasurement } from "./voice.js";

const KINDS = [
  [/^двер(ь|и|ью|ей)$/u, "door"], [/^окн(о|а|ом)$/u, "window"], [/^окон$/u, "window"],
  [/^про[её]м(а|ом)?$/u, "passage"], [/^балкон(а|ом)?$/u, "balcony"],
];
const RIGHT_ADJECTIVE = /^прав(ая|ой|ую|ом|ого|ое)$/u;
const LEFT_ADJECTIVE = /^лев(ая|ой|ую|ом|ого|ое)$/u;
// "Прямо" is the wall in front, as "напротив": "с первой комнаты дверь прямо" (Bolat, 10.10.2026).
const OPPOSITE = /^(противоположн[а-я]*|дальн(яя|ей|юю|ее|ем)|напротив|прямо)$/u;
const WALL = /^стен(а|е|у|ы|ой|ка|ке|ку|ки|кой)$/u;
const MIDDLE = new Set(["посередине", "посредине", "посередке", "центр", "центре", "центру"]);
const AFTER_IT = /^(не[её]|него|двери|окна|про[её]ма|этой|этого)$/u;
// Going through a door: "вхожу в правую дверь", "за ней комната", "с первой комнаты дверь прямо".
const GO_VERBS = new Set([
  "вхожу", "входим", "захожу", "заходим", "прохожу", "проходим", "перехожу", "переходим", "иду", "идем", "пошли",
]);
const BEHIND = /^(ней|нею|ним|этой|этим)$/u;
const ORDINALS = new Map([
  ["первая", 0], ["первой", 0], ["первую", 0], ["вторая", 1], ["второй", 1], ["вторую", 1],
  ["третья", 2], ["третьей", 2], ["третью", 2], ["четвертая", 3], ["четвертой", 3], ["четвертую", 3],
  ["пятая", 4], ["пятой", 4], ["пятую", 4],
]);
const ROOM_NAMES = /^(прихож|коридор|кухн|зал|спальн|гостин|детск|кладов|ванн|туалет|санузл|санузел)/u;
const ROOM_WORD = /^комнат(а|ы|у|е|ой)?$/u;
// Words that carry no meaning of their own in a phrase.
const FILLERS = new Set([
  "на", "в", "по", "и", "а", "ну", "там", "же", "это", "эта", "этой", "тут", "здесь", "есть", "стоит", "будет",
  "тоже", "потом", "дальше", "значит", "так", "вот", "до", "края", "угла", "угол", "край", "ней", "нем", "нём",
  "к", "с", "от", "у", "из", "еще", "ещё", "через", "стороны", "сторона", "стороне", "сразу", "после", "того",
]);
// Words that may stand between a size and the wall it belongs to: "три метра правая стенка", "4 метра на правой".
const BEFORE_WALL = new Set(["и", "а", "это", "на", "у", "с"]);

function kindOf(token) {
  return KINDS.find(([pattern]) => pattern.test(token))?.[1] ?? null;
}
function sideAdjective(token) {
  return RIGHT_ADJECTIVE.test(token) ? "right" : LEFT_ADJECTIVE.test(token) ? "left" : null;
}

// Lower case, "ё" as "е", punctuation off except inside numbers; "с права" written apart is "справа".
export function phraseTokens(text) {
  return String(text ?? "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/(\d)\s*:\s*(\d)/gu, "$1 $2")
    .replace(/(\d)\.(\d)/gu, "$1,$2")
    .replace(/,(?!\d)|(?<!\d),/gu, " ")
    .replace(/[^0-9а-я,\s-]+/gu, " ")
    .replace(/(^|\s)с\s+(права|лева)(?=\s|$)/gu, "$1с$2")
    .split(/\s+/u)
    .filter(Boolean)
    // "Вправо от двери полтора метра" (Bolat, 10.10.2026) is "справа".
    .map((token) => (token === "вправо" ? "справа" : token === "влево" ? "слева" : token));
}

function isNumberToken(token) {
  return /^\d+(,\d+)?$/u.test(token) || isNumberWord(token);
}
// A size starts with a number, or with "метр" right before one: "метр семьдесят" is 1,70.
function startsSize(tokens, index) {
  return isNumberToken(tokens[index]) || (/^метр$/u.test(tokens[index]) && isNumberToken(tokens[index + 1] ?? ""));
}
// A size said in a phrase: from its start through units and joining words ("один и два", "2 метра", "пять тридцать",
// "двадцать два сантиметра", "три с половиной"). "и"/"с" join only when a number part follows.
function sizeEnd(tokens, start) {
  let end = start + 1;
  while (end < tokens.length) {
    const token = tokens[end];
    const next = tokens[end + 1];
    if ((token === "и" || token === "с") && next && (isNumberToken(next) || next === "половиной")) {
      end += 1;
      continue;
    }
    if (isSizeWord(token) || /^\d+(,\d+)?$/u.test(token)) {
      // Two digit groups in a row are two numbers, not metres and centimetres: "1,6 1,8".
      if (/^\d/u.test(token) && /^\d/u.test(tokens[end - 1]) && /,/.test(tokens[end - 1] + token)) break;
      end += 1;
      continue;
    }
    break;
  }
  return end;
}

// The wall named at a place in the phrase, if one is: "правая стенка", "на правой", "стена справа", "напротив".
function wallAt(tokens, index) {
  let at = index;
  while (BEFORE_WALL.has(tokens[at])) at += 1;
  const token = tokens[at] ?? "";
  const next = tokens[at + 1] ?? "";
  if (OPPOSITE.test(token)) return "opposite";
  if (sideAdjective(token) && tokens[at - 1] !== "от") return sideAdjective(token);
  if ((token === "справа" || token === "слева") && WALL.test(next)) return token === "справа" ? "right" : "left";
  if (WALL.test(token)) {
    if (sideAdjective(next)) return sideAdjective(next);
    if (next === "справа" || next === "слева") return next === "справа" ? "right" : "left";
    if (OPPOSITE.test(next)) return "opposite";
  }
  return null;
}

function newGroup(wall) {
  return { wall, length: null, thickness: null, openings: [] };
}
function newOpening() {
  return { kind: null, side: null, offset: null, width: null, after: null };
}
function hasPosition(opening) {
  return opening.side !== null || opening.offset !== null || opening.width !== null || opening.after !== null;
}
function groupSaid(group) {
  return group.length !== null || group.thickness !== null || group.openings.length > 0;
}

// Words into parts, in the order said:
//   { type: "walls", groups: [{ wall: "current"|"door"|"right"|"left"|"opposite", length, thickness, openings }],
//     entry?: { side, offset } } — after a "go": where the door one came in through is in the new room;
//   { type: "go", wall, kind, from, to, last } — through the door on that wall (of room `from`, an index or a name),
//     or `last`: through the opening just named; `to` — into a room named without a door ("в кухню").
// An opening: { kind, side: "right"|"left"|"middle"|null, offset, width, after: { gap, side } | null }.
export function readPhrase(text) {
  const tokens = phraseTokens(text);
  const parts = [];
  const unknown = [];
  let part = null;
  let group = null;
  let opening = null;
  let go = null;
  let pendingRole = null;
  let another = false;
  let wallWordSaid = false;

  const startRoom = () => {
    part = { type: "walls", groups: [newGroup("current")] };
    parts.push(part);
    group = part.groups[0];
    opening = null;
    wallWordSaid = false;
  };
  const startWall = (wall) => {
    // An opening named just before its wall belongs to that wall: "окно напротив, справа 1,2". The same wall named
    // again starts a new part of the phrase on it: "на правой стене дверь, стена правая 1,8".
    const moving = group.wall !== wall && opening && opening.kind && !hasPosition(opening) &&
      group.openings.at(-1) === opening ? opening : null;
    if (moving) group.openings.pop();
    if (group.wall !== wall || moving) {
      group = part.groups.find((item) => item.wall === wall) ?? newGroup(wall);
      if (!part.groups.includes(group)) part.groups.push(group);
    }
    if (moving) group.openings.push(moving);
    opening = moving;
    wallWordSaid = true;
  };
  const openGo = () => {
    go = { type: "go", wall: null, kind: null, from: null, to: null, last: false };
    parts.push(go);
  };
  const closeGo = () => {
    go = null;
    startRoom();
  };
  // A room said by number or name: "с первой комнаты", "из прихожей", "в кухню".
  const roomAt = (index) => {
    const token = tokens[index] ?? "";
    if (ORDINALS.has(token)) return { room: { index: ORDINALS.get(token) }, end: ROOM_WORD.test(tokens[index + 1] ?? "") ? index + 2 : index + 1 };
    if (ROOM_NAMES.test(token)) return { room: { name: token.match(ROOM_NAMES)[1] }, end: index + 1 };
    return null;
  };
  const currentOpening = () => {
    if (!opening) {
      opening = newOpening();
      group.openings.push(opening);
    }
    return opening;
  };
  startRoom();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const previous = tokens[index - 1];

    // Going through a door, into another room.
    if (GO_VERBS.has(token)) {
      if (!go) openGo();
      continue;
    }
    if ((token === "с" || token === "из" || token === "в") && roomAt(index + 1)) {
      const { room, end } = roomAt(index + 1);
      if (token === "в" && go && !go.kind) {
        go.to = room;
        index = end - 1;
        continue;
      }
      if (token !== "в") {
        if (!go) openGo();
        go.from = room;
        index = end - 1;
        continue;
      }
    }
    if (token === "за" && BEHIND.test(next ?? "")) {
      index += 1;
      if (ROOM_WORD.test(tokens[index + 1] ?? "")) index += 1;
      // "Вхожу в правую дверь. За ней комната" only repeats the way just said.
      const justWent = !go && parts.at(-2)?.type === "go" && !part.groups.some(groupSaid);
      if (!go && !justWent) {
        openGo();
        go.last = true;
        go.kind = opening?.kind ?? null;
        closeGo();
      }
      continue;
    }
    if (go) {
      // Going through, "справа/слева" names the wall of the door even without "стена": "из прихожей дверь слева".
      const goWallAt = (at) => wallAt(tokens, at) ??
        (tokens[at] === "справа" ? "right" : tokens[at] === "слева" ? "left" : null);
      const wall = goWallAt(index);
      const kind = kindOf(token);
      if (wall && !kind) {
        go.wall = wall;
        if (WALL.test(next ?? "")) index += 1;
      } else if (kind) {
        go.kind = kind;
      } else if (!FILLERS.has(token) && !ROOM_WORD.test(token) && !WALL.test(token)) {
        unknown.push(token);
      }
      // Complete once the door and its wall are said; a door without a wall is the only one there.
      if (go.kind && (go.wall || !goWallAt(index + 1))) closeGo();
      continue;
    }

    const sideWord = token === "справа" || token === "слева";
    const adjective = sideAdjective(token);

    // Where the door one came in through is in the new room (Bolat, 10.10.2026): "вправо от двери полтора метра",
    // "от двери до правой стенки 1,5" — the outline makes a step there. Not said, the door wall goes on from the
    // room one came from (a common corner). A door said with "ещё" or beside it is a new one, below.
    if (parts.at(-2)?.type === "go" && parts.at(-1) === part && !part.entry) {
      let sizeAt = index + 3;
      while (FILLERS.has(tokens[sizeAt]) && !startsSize(tokens, sizeAt)) sizeAt += 1;
      if (sideWord && next === "от" && /^двер/u.test(tokens[index + 2] ?? "") && startsSize(tokens, sizeAt)) {
        part.entry = { side: token === "справа" ? "right" : "left", offset: null };
        pendingRole = "entry";
        index += 2;
        continue;
      }
      const toSide = sideAdjective(tokens[index + 3] ?? "");
      if (token === "от" && /^двер/u.test(next ?? "") && tokens[index + 2] === "до" && toSide) {
        part.entry = { side: toSide, offset: null };
        pendingRole = "entry";
        index += 3;
        if (/^(стен|угл|угол|кра)/u.test(tokens[index + 1] ?? "")) index += 1;
        continue;
      }
    }

    // Which wall: "правая стена", "стена правая", "на правой стене", "на правой", "стена справа", "напротив",
    // "противоположная стена", "у двери". "от правой стены" is the corner of the wall being spoken about, below.
    if (previous !== "от" && (OPPOSITE.test(token) || adjective ||
        (sideWord && (WALL.test(next ?? "") || WALL.test(previous ?? ""))))) {
      startWall(OPPOSITE.test(token) ? "opposite" : adjective ?? (token === "справа" ? "right" : "left"));
      continue;
    }
    if (token === "у" && /^двер/u.test(next ?? "") && !opening?.kind) {
      index += 1;
      startWall("door");
      continue;
    }

    const kind = kindOf(token);
    if (kind) {
      // A kind word fills the opening whose place was said first; after a named one it starts a new one, and after
      // "ещё" the new one stands beside the one just named.
      if (!opening || opening.kind) {
        const beside = another && opening?.kind;
        opening = newOpening();
        group.openings.push(opening);
        if (beside) opening.after = { gap: null, side: null };
      }
      opening.kind = kind;
      another = false;
      continue;
    }
    if (token === "еще") {
      another = true;
      continue;
    }

    // Where along the wall: "справа", "слева", "от правой стены", "от правого края", "посередине".
    // "слева от неё" is beside the opening just named.
    if (sideWord && next === "от" && AFTER_IT.test(tokens[index + 2] ?? "")) {
      index += 2;
      if (!opening || !opening.kind || opening.after !== null || !hasPosition(opening)) currentOpening();
      else {
        opening = newOpening();
        group.openings.push(opening);
      }
      opening.after = { ...(opening.after ?? { gap: null }), side: token === "справа" ? "right" : "left" };
      continue;
    }
    if (sideWord || (previous === "от" && adjective)) {
      const side = sideWord ? (token === "справа" ? "right" : "left") : adjective;
      if (opening && opening.side && (opening.offset !== null || opening.kind)) {
        opening = newOpening();
        group.openings.push(opening);
      }
      currentOpening().side = side;
      if (WALL.test(next ?? "") || /^(края|угла|угол|край)$/u.test(next ?? "")) index += 1;
      continue;
    }
    if (MIDDLE.has(token)) {
      currentOpening().side = "middle";
      continue;
    }

    // What the next size is.
    if (/^ширин/u.test(token)) { pendingRole = "width"; continue; }
    if (/^длин/u.test(token)) { pendingRole = "length"; wallWordSaid = true; continue; }
    if (/^толщин/u.test(token)) { pendingRole = "thickness"; continue; }
    if (token === "через") { pendingRole = "gap"; continue; }

    if (startsSize(tokens, index)) {
      const end = sizeEnd(tokens, index);
      const words = tokens.slice(index, end).join(" ");
      const explicit = pendingRole;
      const role = pendingRole
        ?? (opening && (opening.offset === null) && (opening.kind || opening.side) ? "offset" : "length");
      pendingRole = null;
      let value;
      try {
        value = Number(spokenMeasurement(words, role === "width" ? "width" : role === "thickness" ? "thickness" : "length")
          .replace(",", "."));
      } catch {
        unknown.push(words);
        index = end - 1;
        continue;
      }
      index = end - 1;
      if (role === "entry") {
        part.entry.offset = value;
      } else if (role === "length") {
        // A length said before its wall goes to that wall: "три метра правая стенка, четыре метра напротив"
        // (Bolat, 10.10.2026). After "стена"/"длина" it stays where it was said: "стена 4 метра, правая стенка 3".
        const ahead = explicit ? null : wallAt(tokens, end);
        if (ahead && ahead !== group.wall && (group.length !== null || !wallWordSaid)) startWall(ahead);
        if (group.length !== null) unknown.push(words);
        else group.length = value;
      } else if (role === "thickness") {
        if (opening) opening.thickness = value;
        else group.thickness = value;
      } else if (role === "gap") {
        const target = opening ?? currentOpening();
        target.after = { ...(target.after ?? { side: null }), gap: value };
      } else if (role === "width") {
        currentOpening().width = value;
      } else if (opening.offset === null) {
        opening.offset = value;
      } else {
        unknown.push(words);
      }
      continue;
    }

    if (WALL.test(token)) {
      wallWordSaid = true;
      continue;
    }
    if (FILLERS.has(token) || ROOM_WORD.test(token) || /^метр/u.test(token)) continue;
    unknown.push(token);
  }
  for (const item of parts) {
    if (item.type === "walls") item.groups = item.groups.filter(groupSaid);
  }
  return { parts: parts.filter((item) => item.type === "go" || item.groups.length || item.entry), unknown };
}

// Wall geometry of a stored room: walls run counter-clockwise, the room is on the left of each wall.
function wallVectors(room) {
  return room.walls.map((wall) => {
    const radians = wall.angle_deg * Math.PI / 180;
    const along = [Math.cos(radians), Math.sin(radians)];
    return { along, outward: [along[1], -along[0]] };
  });
}

// The walls a word names, standing at the door one came in through and facing into the room (Bolat, 09.10.2026).
// More than one wall (an L-shaped room) means the technician taps the one meant.
export function wallsNamed(room, entryWall, wall, currentWall = entryWall) {
  if (wall === "current") return [currentWall];
  if (wall === "door") return [entryWall];
  const vectors = wallVectors(room);
  const facing = vectors[entryWall].outward.map((value) => -value);
  const right = [facing[1], -facing[0]];
  const target = { opposite: facing, right, left: right.map((value) => -value) }[wall];
  return vectors.flatMap((vector, index) => {
    if (index === entryWall) return [];
    const dot = vector.outward[0] * target[0] + vector.outward[1] * target[1];
    return dot > 0.7 ? [index] : [];
  });
}

// Which corner of a wall "справа"/"слева" is: facing that wall from inside the room, the right hand points back along
// the wall to its start corner. The wall with the door is not faced: one stands at it, so its right is its end corner.
export function cornerOfSide(wallIndex, entryWall, side) {
  if (side !== "right" && side !== "left") return null;
  const atDoor = wallIndex === entryWall;
  return (side === "right") !== atDoor ? "start" : "end";
}

export const OPENING_WIDTHS = { door: 0.8, window: 1.15, passage: 0.9, balcony: 0.8 };

// One part's walls onto a room: [{ type: "length", wallIndex, value }, { type: "opening", wallIndex, kind, anchor,
// offset, width, thickness, missing: [...] }]. A wall the words do not name exactly is { type: "choose_wall", walls }.
// "missing" lists what to ask: "kind", "place" (side or distance).
export function planPhrase(part, room, { entryWall = 0, currentWall = entryWall, widths = OPENING_WIDTHS } = {}) {
  const steps = [];
  // The door one came in through, from the corner of the new room (the door wall is seen from the door).
  if (part.entry) {
    const step = { type: "entry", wallIndex: entryWall, anchor: cornerOfSide(entryWall, entryWall, part.entry.side),
      offset: part.entry.offset, missing: part.entry.offset === null ? ["place"] : [] };
    steps.push(step);
  }
  for (const group of part.groups) {
    const walls = wallsNamed(room, entryWall, group.wall, currentWall);
    if (walls.length !== 1) {
      steps.push({ type: "choose_wall", wall: group.wall, walls, group });
      continue;
    }
    const wallIndex = walls[0];
    if (group.length !== null) steps.push({ type: "length", wallIndex, value: group.length });
    if (group.thickness !== null) steps.push({ type: "thickness", wallIndex, value: group.thickness });
    let previous = null;
    for (const said of group.openings) {
      const kind = said.kind;
      const width = said.width ?? (kind ? widths[kind] : null);
      const step = { type: "opening", wallIndex, kind, anchor: null, offset: null, width, missing: [] };
      if (said.thickness !== undefined) step.thickness = said.thickness;
      if (!kind) step.missing.push("kind");
      if (said.after) {
        // Beside the opening just named: the gap is between their near edges, never between centres.
        if (!previous || previous.offset === null || said.after.gap === null || width === null) {
          step.missing.push("place");
        } else {
          const toward = said.after.side ? cornerOfSide(wallIndex, entryWall, said.after.side) : null;
          step.anchor = previous.anchor;
          step.offset = toward === previous.anchor
            ? previous.offset - said.after.gap - width
            : previous.offset + previous.width + said.after.gap;
          if (step.offset < -1e-9) step.missing.push("place");
        }
      } else if (said.side === "middle") {
        step.anchor = "middle";
      } else if (said.side && said.offset !== null) {
        step.anchor = cornerOfSide(wallIndex, entryWall, said.side);
        step.offset = said.offset;
      } else {
        step.missing.push("place");
        if (said.side) step.side = cornerOfSide(wallIndex, entryWall, said.side);
        if (said.offset !== null) step.said = said.offset;
      }
      steps.push(step);
      previous = step;
    }
  }
  return steps;
}
