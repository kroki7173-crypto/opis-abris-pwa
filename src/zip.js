const encoder = new TextEncoder();

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return encoder.encode(value);
  throw new TypeError("Содержимое ZIP должно быть строкой или Uint8Array.");
}

function join(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function set16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function set32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function dosTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Некорректная дата ZIP.");
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

export function crc32(value) {
  const data = asBytes(value);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checkedName(value) {
  if (typeof value !== "string" || !value || value.includes("\0")) {
    throw new TypeError("Каждому файлу ZIP нужно безопасное имя.");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new TypeError("Путь файла ZIP не должен выходить из архива.");
  }
  return normalized;
}

export function createStoredZip(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError("Для ZIP нужен хотя бы один файл.");
  }
  if (entries.length > 0xffff) throw new RangeError("Слишком много файлов для ZIP.");
  const timestamp = dosTimestamp(options.date ?? new Date());
  const names = new Set();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = checkedName(entry?.name);
    if (names.has(name)) throw new TypeError("Имена файлов ZIP не должны повторяться.");
    names.add(name);
    const nameBytes = encoder.encode(name);
    const data = asBytes(entry.data);
    if (nameBytes.length > 0xffff || data.length > 0xffffffff) {
      throw new RangeError("Файл слишком большой для ZIP.");
    }
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    set32(localView, 0, 0x04034b50);
    set16(localView, 4, 20);
    set16(localView, 6, 0x0800);
    set16(localView, 8, 0);
    set16(localView, 10, timestamp.time);
    set16(localView, 12, timestamp.date);
    set32(localView, 14, checksum);
    set32(localView, 18, data.length);
    set32(localView, 22, data.length);
    set16(localView, 26, nameBytes.length);
    set16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    set32(centralView, 0, 0x02014b50);
    set16(centralView, 4, 20);
    set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800);
    set16(centralView, 10, 0);
    set16(centralView, 12, timestamp.time);
    set16(centralView, 14, timestamp.date);
    set32(centralView, 16, checksum);
    set32(centralView, 20, data.length);
    set32(centralView, 24, data.length);
    set16(centralView, 28, nameBytes.length);
    set16(centralView, 30, 0);
    set16(centralView, 32, 0);
    set16(centralView, 34, 0);
    set16(centralView, 36, 0);
    set32(centralView, 38, 0);
    set32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    localOffset += local.length + data.length;
  }

  const central = join(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, entries.length);
  set16(endView, 10, entries.length);
  set32(endView, 12, central.length);
  set32(endView, 16, localOffset);
  set16(endView, 20, 0);
  return join([...localParts, central, end]);
}
