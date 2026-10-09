const ONES = new Map([
  ["ноль", 0], ["нуль", 0], ["один", 1], ["одна", 1], ["одно", 1],
  ["два", 2], ["две", 2], ["три", 3], ["четыре", 4], ["пять", 5],
  ["шесть", 6], ["семь", 7], ["восемь", 8], ["девять", 9],
]);
const NUMBERS = new Map([
  ...ONES,
  ["десять", 10], ["одиннадцать", 11], ["двенадцать", 12],
  ["тринадцать", 13], ["четырнадцать", 14], ["пятнадцать", 15],
  ["шестнадцать", 16], ["семнадцать", 17], ["восемнадцать", 18],
  ["девятнадцать", 19], ["двадцать", 20], ["тридцать", 30],
  ["сорок", 40], ["пятьдесят", 50], ["шестьдесят", 60],
  ["семьдесят", 70], ["восемьдесят", 80], ["девяносто", 90],
  ["сто", 100], ["двести", 200], ["триста", 300], ["четыреста", 400],
  ["пятьсот", 500], ["шестьсот", 600], ["семьсот", 700],
  ["восемьсот", 800], ["девятьсот", 900],
]);
const METER_WORDS = new Set(["м", "метр", "метра", "метров"]);
const CENTIMETER_WORDS = new Set(["см", "сантиметр", "сантиметра", "сантиметров"]);
const WHOLE_WORDS = new Set(["целая", "целое", "целые", "целых"]);
const FILLER_WORDS = new Set(["и", "ровно"]);

function normalizedTokens(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^0-9а-я.,-]+/gu, " ")
    .replace(/(^|\s)-(?=\s|$)/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function wordsToInteger(tokens) {
  const useful = tokens.filter((token) => !FILLER_WORDS.has(token));
  if (!useful.length) return null;
  let value = 0;
  for (const token of useful) {
    if (/^\d+$/.test(token)) {
      value += Number(token);
      continue;
    }
    if (!NUMBERS.has(token)) return null;
    value += NUMBERS.get(token);
  }
  return value;
}

function fractionFromTokens(tokens) {
  const useful = tokens.filter((token) => !FILLER_WORDS.has(token));
  if (!useful.length) return 0;
  const tenths = useful.findIndex((token) => token.startsWith("десят"));
  const hundredths = useful.findIndex((token) => token.startsWith("сот"));
  const qualifier = tenths >= 0 ? tenths : hundredths;
  if (qualifier >= 0) {
    const value = wordsToInteger(useful.slice(0, qualifier));
    if (value === null) return null;
    return value / (tenths >= 0 ? 10 : 100);
  }
  if (useful.every((token) => /^\d$/.test(token) || ONES.has(token))) {
    const digits = useful.map((token) => (/^\d$/.test(token) ? token : String(ONES.get(token)))).join("");
    return Number(`0.${digits}`);
  }
  const value = wordsToInteger(useful);
  if (value === null) return null;
  return value / (value < 10 ? 10 : 100);
}

function partNumber(tokens) {
  const useful = tokens.filter((token) => !FILLER_WORDS.has(token));
  if (!useful.length) return null;
  const raw = useful.join(" ");
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return Number(raw.replace(",", "."));
  return wordsToInteger(useful);
}

function formatted(value) {
  if (!Number.isFinite(value) || value < 0 || value > 10000) {
    throw new Error("Не удалось распознать допустимый размер.");
  }
  return String(Math.round(value * 1000) / 1000).replace(".", ",");
}

// Number words grouped into numbers: "двенадцать пятьдесят пять" -> [12, 55], "пять тридцать" -> [5, 30].
function numberGroups(tokens) {
  const groups = [];
  let last = null;
  for (const token of tokens) {
    if (FILLER_WORDS.has(token)) continue;
    if (/^\d+$/u.test(token)) {
      groups.push(Number(token));
      last = null;
      continue;
    }
    if (!NUMBERS.has(token)) return null;
    const value = NUMBERS.get(token);
    if (last !== null && groups.length && continuesWord(last, value)) groups[groups.length - 1] += value;
    else groups.push(value);
    last = value;
  }
  return groups;
}
function continuesWord(previous, next) {
  if (previous >= 100 && previous % 100 === 0) return next < 100;
  if (previous >= 20 && previous < 100 && previous % 10 === 0) return next > 0 && next < 10;
  return false;
}

// A number said alone, read the way technicians speak (Bolat, 05.10.2026). Lengths are "метры, сантиметры":
// a small number is metres, a glued "пять три" (53) is 5,3, a glued "пять тридцать" (530) is 5,30 and
// "двенадцать пятьдесят пять" (1255) is 12,55. Wall thickness and door width are said in centimetres: "сорок" = 0,40.
function bareNumber(value, kind) {
  if (kind === "thickness" || kind === "width") return value >= 10 ? value / 100 : value / 10;
  if (value <= 30) return value;
  if (value < 100) return value / 10;
  return Math.floor(value / 100) + (value % 100) / 100;
}

// A word that is part of a spoken size: a number word, a unit or a joining word of a number ("целых", "с половиной").
// The phrase reader (phrase.js) cuts the sizes out of a longer phrase with it and reads each with spokenMeasurement.
const SIZE_WORDS = new Set([
  ...METER_WORDS, ...CENTIMETER_WORDS, ...WHOLE_WORDS, "запятая", "половиной", "полтора", "полторы", "полметра",
  "десятых", "сотых",
]);
export function isNumberWord(token) {
  return NUMBERS.has(token) || token === "полтора" || token === "полторы" || token === "полметра";
}
export function isSizeWord(token) {
  return isNumberWord(token) || SIZE_WORDS.has(token);
}

// Voice field modes that are numbers, and how a bare number is read in each.
export const MEASUREMENT_KINDS = { measurement: "length", thickness: "thickness", width: "width" };

// Longest wall accepted from the voice: anything longer is a misheard number and is asked again.
const MAX_SPOKEN_LENGTH_M = 30;

export function spokenMeasurement(transcript, kind = "length") {
  const raw = String(transcript ?? "").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е")
    // iPhone writes "пять тридцать" as a time: "5:30".
    .replace(/(\d)\s*:\s*(\d)/gu, "$1 $2");
  if (!raw) throw new Error("Голосовой ввод ничего не распознал.");
  const value = measuredValue(raw, kind, transcript);
  if (kind === "length" && value > MAX_SPOKEN_LENGTH_M) {
    throw new Error(`Похоже, расслышано неверно: «${transcript}». Повторите размер.`);
  }
  return formatted(value);
}

// A corner of a free-form room is said in whole degrees: "сто тридцать пять", "135 градусов".
export function spokenAngle(transcript) {
  const tokens = normalizedTokens(transcript).filter((token) => !/^градус/u.test(token));
  const raw = tokens.join(" ");
  const value = /^\d+(?:[.,]\d+)?$/u.test(raw) ? Number(raw.replace(",", ".")) : wordsToInteger(tokens);
  if (value === null || !(value > 0 && value < 360)) {
    throw new Error(`Не понял угол: «${transcript}». Скажите градусы, например «сто тридцать пять».`);
  }
  return String(value).replace(".", ",");
}

// A balcony is said as two sizes (Bolat, 08.10.2026): "метр на два", "1,2 на 3", "1х2", "полтора на три метра".
// Returns both numbers in metres as said; which one is the depth is decided by the model (the smaller one).
export function spokenBalcony(transcript) {
  const raw = String(transcript ?? "").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е")
    .replace(/(\d)\s*:\s*(\d)/gu, "$1 $2");
  // "х" splits only between numbers or as a word of its own: it occurs inside number words ("двух").
  const parts = raw.split(/\s+на\s+|\s*[×*]\s*|(?<=\d)\s*[xх]\s*(?=\d)|\s+[xх]\s+/u).map((part) => part.replace(/^балкон\s*/u, "").trim());
  if (parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error(`Не понял размер балкона: «${transcript}». Скажите так: «метр на два».`);
  }
  return parts.map((part) => Number(spokenMeasurement(part, "length").replace(",", ".")));
}

function measuredValue(raw, kind, transcript) {
  const direct = raw.match(/^\s*(\d+(?:[.,]\d+)?)\s*(м|метр(?:а|ов)?|см|сантиметр(?:а|ов)?)?\s*$/u);
  if (direct) {
    const value = Number(direct[1].replace(",", "."));
    if (CENTIMETER_WORDS.has(direct[2])) return value / 100;
    if (direct[2] || /[.,]/u.test(direct[1])) return value;
    return bareNumber(value, kind);
  }
  const numericPair = raw.match(/^\s*(\d+)\s+(\d{1,2})\s*$/u);
  if (numericPair) {
    const fraction = numericPair[2].padEnd(2, "0");
    return Number(numericPair[1]) + Number(fraction) / 100;
  }

  const tokens = normalizedTokens(raw);
  const meterIndex = tokens.findIndex((token) => METER_WORDS.has(token));
  const centimeterIndex = tokens.findIndex((token) => CENTIMETER_WORDS.has(token));
  if (tokens.length === 1 && tokens[0] === "полметра") return 0.5;
  // A length or width "полтора" said alone is 1,5 m, as "полтора метра" is; no wall is that thick.
  if (tokens.length === 1 && /^полтор[аы]$/u.test(tokens[0]) && kind !== "thickness") return 1.5;
  if (meterIndex >= 0) {
    // "метр двадцать" is one metre twenty: a metre with no number before it is one metre; "полтора метра" is 1,5.
    const before = tokens.slice(0, meterIndex);
    const meters = !before.length ? 1
      : before.length === 1 && /^полтор[аы]$/u.test(before[0]) ? 1.5
        : partNumber(before) ?? 0;
    const end = centimeterIndex > meterIndex ? centimeterIndex : tokens.length;
    const rest = tokens.slice(meterIndex + 1, end);
    if (rest.includes("половиной")) return meters + 0.5;
    const centimeters = partNumber(rest) ?? 0;
    return meters + centimeters / 100;
  }
  if (centimeterIndex >= 0) {
    const centimeters = partNumber(tokens.slice(0, centimeterIndex));
    if (centimeters === null) throw new Error("Не удалось распознать число сантиметров.");
    return centimeters / 100;
  }

  const wholeIndex = tokens.findIndex((token) => WHOLE_WORDS.has(token) || token === "запятая");
  if (wholeIndex >= 0) {
    const whole = partNumber(tokens.slice(0, wholeIndex)) ?? 0;
    const fraction = fractionFromTokens(tokens.slice(wholeIndex + 1));
    if (fraction === null) throw new Error("Не удалось распознать дробную часть размера.");
    return whole + fraction;
  }
  if (tokens.includes("половиной")) {
    const halfIndex = tokens.indexOf("половиной");
    const whole = partNumber(tokens.slice(0, halfIndex).filter((token) => token !== "с"));
    if (whole === null) throw new Error("Не удалось распознать размер с половиной.");
    return whole + 0.5;
  }
  if (tokens[0] && ONES.has(tokens[0]) && tokens.length > 1) {
    const whole = ONES.get(tokens[0]);
    const fraction = fractionFromTokens(tokens.slice(1));
    if (fraction !== null) return whole + fraction;
  }
  // Two numbers are metres and centimetres: "двенадцать пятьдесят пять" = 12,55, "двенадцать семь" = 12,7.
  const groups = numberGroups(tokens);
  if (groups?.length === 2 && groups[1] < 100) return groups[0] + groups[1] / (groups[1] < 10 ? 10 : 100);
  if (groups?.length === 1) return bareNumber(groups[0], kind);
  throw new Error(`Не удалось понять размер: «${transcript}».`);
}

// Address markers as the desktop writes them (validation.normalize_address): marker, space, number.
const ADDRESS_MARKERS = new Map([
  ["дом", "д"], ["дома", "д"], ["д", "д"], ["дэ", "д"],
  ["квартира", "кв"], ["квартиру", "кв"], ["квартиры", "кв"], ["кв", "кв"], ["ка", "кв"],
  ["корпус", "к"], ["корпуса", "к"], ["к", "к"],
  ["строение", "стр"], ["стр", "стр"],
  ["литера", "лит"], ["литер", "лит"], ["лит", "лит"],
]);
// Short markers also occur as words of a street name; they count only right before a number.
const SHORT_MARKERS = new Set(["д", "дэ", "кв", "ка", "к", "стр", "лит"]);
const ADDRESS_NUMBER = /^\d+(?:\/\d+)?[а-я]?$/u;

function continuesNumber(previous, next) {
  if (previous >= 100 && previous % 100 === 0) return next < 100;
  if (previous >= 20 && previous < 100 && previous % 10 === 0) return next > 0 && next < 10;
  return false;
}

// "Спартака два квартира сорок один" -> "Спартака д 2 кв 41". Numbers are always digits; a number without a marker
// is the house, the next one the flat (Bolat, 05.10.2026). Numbers before the street ("8 Марта") stay in the street.
export function spokenAddress(transcript, lessons = null) {
  const { street, tail } = addressParts(transcript);
  // A street the technician corrected once by hand is replaced the next time it is heard the same way.
  const learned = lessons?.[streetKey(street)];
  const parts = [...(learned ? [learned] : street ? [street] : []), ...tail];
  if (!parts.length) return "";
  parts[0] = parts[0].charAt(0).toLocaleUpperCase("ru-RU") + parts[0].slice(1);
  return parts.join(" ");
}

function streetKey(street) {
  return String(street ?? "").toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\s+/gu, " ").trim();
}

// What "Запомнить исправление" stores: how the street was heard and how it is really written.
export function addressLesson(transcript, corrected) {
  const key = streetKey(addressParts(transcript).street);
  const street = addressParts(corrected).street.trim();
  if (!key || !street || streetKey(street) === key) return null;
  return { key, street: street.charAt(0).toLocaleUpperCase("ru-RU") + street.slice(1) };
}

function addressParts(transcript) {
  const words = String(transcript ?? "")
    .replace(/([а-яё])\.?(?=\d)/giu, "$1 ")
    .split(/[\s,;]+/u)
    .filter(Boolean);
  const items = [];
  for (const word of words) {
    const key = word.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/\.$/u, "");
    if (/^\d+$/u.test(key) || NUMBERS.has(key)) {
      const value = /^\d+$/u.test(key) ? Number(key) : NUMBERS.get(key);
      const last = items.at(-1);
      if (last?.type === "number" && last.spoken && NUMBERS.has(key) && continuesNumber(last.last, value)) {
        last.value += value;
        last.last = value;
      } else {
        items.push({ type: "number", value, last: value, spoken: NUMBERS.has(key), text: word });
      }
    } else if (ADDRESS_NUMBER.test(key)) {
      items.push({ type: "number", text: key });
    } else if (key === "дробь" || key === "/") {
      items.push({ type: "slash" });
    } else if (ADDRESS_MARKERS.has(key)) {
      items.push({ type: "marker", value: ADDRESS_MARKERS.get(key), short: SHORT_MARKERS.has(key), text: word });
    } else {
      items.push({ type: "word", text: word, key });
    }
  }
  for (const [index, item] of items.entries()) {
    if (item.type === "number" && item.value !== undefined) item.text = String(item.value);
    // "д" or "к" not followed by a number is part of the street name.
    if (item.type === "marker" && item.short && items[index + 1]?.type !== "number") {
      Object.assign(item, { type: "word", key: item.text.toLocaleLowerCase("ru-RU") });
    }
  }

  // With an explicit "дом" the street runs up to it ("микрорайон 5 дом 3"); otherwise to the first number or marker
  // after a word, so leading numbers stay in the street ("8 Марта 5").
  let index = items.findIndex((item) => item.type === "marker" && item.value === "д");
  if (index < 0) {
    const firstWord = items.findIndex((item) => item.type === "word");
    index = items.findIndex((item, position) => position > firstWord && item.type !== "word");
    if (firstWord < 0 || index < 0) index = firstWord < 0 ? 0 : items.length;
  }
  const street = items.slice(0, index).filter((item) => item.type !== "slash");

  const tail = [];
  let house = false;
  let flat = false;
  let marker = null;
  let slash = false;
  for (const item of items.slice(index)) {
    if (item.type === "marker") {
      marker = item.value;
    } else if (item.type === "slash") {
      slash = tail.length > 0;
    } else if (item.type === "number") {
      if (slash) {
        tail[tail.length - 1] += "/" + item.text;
        slash = false;
        continue;
      }
      const mark = marker ?? (!house ? "д" : !flat ? "кв" : null);
      if (mark === "д") house = true;
      if (mark === "кв") flat = true;
      if (mark) tail.push(mark);
      tail.push(item.text);
      marker = null;
    } else if (item.key.length === 1 && item.key !== "и" && tail.length) {
      // A house letter: "17 а".
      tail.push(item.key);
    }
  }
  return { street: street.map((item) => item.text).join(" "), tail };
}

function recognitionError(code) {
  return {
    "not-allowed": "Нет доступа к микрофону. Разрешите его в настройках браузера.",
    "service-not-allowed": "Браузер запретил локальную службу распознавания.",
    "audio-capture": "Микрофон недоступен.",
    "no-speech": "Речь не услышана. Нажмите микрофон и повторите.",
    "language-not-supported": "Офлайн-пакет русского языка недоступен.",
    network: "Нет связи для распознавания речи. Значение можно ввести вручную.",
    aborted: "Голосовой ввод остановлен.",
  }[code] ?? "Не удалось распознать речь. Повторите или введите значение вручную.";
}

export function createVoiceController(scope, onStatus = () => {}) {
  const Recognition = scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition;
  let active = null;
  let activeSession = null;
  let requestVersion = 0;

  function capability() {
    if (!Recognition) return { available: false, reason: "Браузер не поддерживает распознавание речи." };
    try {
      // Decision of Bolat (05.10.2026): dictation works everywhere the browser offers it; where the browser
      // cannot recognise on the device, the audio goes to the browser vendor's service.
      const probe = new Recognition();
      return { available: true, local: "processLocally" in probe, reason: "" };
    } catch {
      return { available: false, reason: "Не удалось запустить распознавание речи." };
    }
  }

  async function prepare() {
    const state = capability();
    if (!state.available) throw new Error(state.reason);
    if (!state.local) return { local: false };
    if (typeof Recognition.available === "function") {
      const availability = await Recognition.available({ langs: ["ru-RU"], processLocally: true });
      if (availability === "unavailable") return { local: false };
      if (availability === "downloadable" || availability === "downloading") {
        if (typeof Recognition.install !== "function") return { local: false };
        onStatus("Устанавливается русский голосовой пакет…", false);
        const installed = await Recognition.install({ langs: ["ru-RU"], processLocally: true });
        if (!installed) return { local: false };
      }
    }
    return { local: true };
  }

  // One press of "Остановить" ends everything at once: the page does not wait for the browser to report the end.
  function stop() {
    requestVersion += 1;
    if (!activeSession) return false;
    activeSession.cancelled = true;
    activeSession.cancel();
    return true;
  }

  async function listen({
    mode, onValue, onListening = () => {}, timeoutMs = 8000, silenceMs = 1200, addressLessons = null,
  }) {
    stop();
    const request = requestVersion;
    const { local } = await prepare();
    if (request !== requestVersion) return null;
    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    // A measuring phrase (Bolat, 10.10.2026) has pauses between its sentences: it is heard on until a longer silence
    // or "Остановить", not cut at the first finished sentence.
    const phrase = mode === "phrase";
    recognition.continuous = phrase;
    // Interim results let the page notice the end of speech itself: iOS keeps the microphone open long after it.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    if (local) recognition.processLocally = true;
    const session = { cancelled: false, timer: null, silence: null, heard: "", cancel: () => {} };
    active = recognition;
    activeSession = session;

    return new Promise((resolve, reject) => {
      let settled = false;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(session.timer);
        clearTimeout(session.silence);
        if (active === recognition) active = null;
        if (activeSession === session) activeSession = null;
        try { recognition.stop?.(); } catch { /* Already finished. */ }
        try { recognition.abort?.(); } catch { /* Already finished. */ }
        onListening(false);
      };
      session.cancel = () => {
        const first = !settled;
        settled = true;
        close();
        if (first) resolve(null);
      };
      const deliver = (transcript) => {
        if (settled) return;
        settled = true;
        close();
        try {
          const value = MEASUREMENT_KINDS[mode] ? spokenMeasurement(transcript, MEASUREMENT_KINDS[mode])
            : mode === "address" ? spokenAddress(transcript, addressLessons)
              : mode === "angle" ? spokenAngle(transcript) : transcript;
          onValue(value, transcript);
          onStatus(`Распознано: «${transcript}». Проверьте значение.`, false);
          resolve({ value, transcript });
        } catch (error) {
          onStatus(error.message, true);
          reject(error);
        }
      };
      // "Остановить" during a phrase keeps what was said: the technician has finished speaking.
      session.finish = () => (session.heard ? deliver(session.heard) : session.cancel());
      recognition.onstart = () => {
        onListening(true);
        // A phrase has its own words on the screen ("Слушаю фразу…"), set by the page in onListening.
        if (!phrase) onStatus("Говорите. После заполнения обязательно проверьте значение.", false);
        session.timer = setTimeout(() => {
          if (session.heard) {
            deliver(session.heard);
            return;
          }
          session.cancelled = true;
          // Closed first, then told: a message given while still "listening" never hid itself.
          session.cancel();
          onStatus("Микрофон выключен: ничего не услышал.", false);
        }, Math.max(1000, Number(timeoutMs) || 8000));
      };
      recognition.onresult = (event) => {
        if (settled) return;
        const results = [...event.results];
        session.heard = results.map((result) => result[0].transcript).join(" ").replace(/\s+/gu, " ").trim();
        if (results.at(-1)?.isFinal && !phrase) {
          deliver(session.heard);
          return;
        }
        // A short pause after the last word ends the dictation.
        clearTimeout(session.silence);
        session.silence = setTimeout(() => deliver(session.heard), Math.max(300, Number(silenceMs) || 1200));
      };
      recognition.onerror = (event) => {
        if (settled) return;
        if (event.error === "aborted" && session.cancelled) {
          session.cancel();
          return;
        }
        settled = true;
        close();
        const error = new Error(recognitionError(event.error));
        onStatus(error.message, true);
        reject(error);
      };
      recognition.onend = () => {
        if (!settled && session.heard) deliver(session.heard);
        else session.cancel();
      };
      try {
        recognition.start();
      } catch (error) {
        settled = true;
        close();
        onStatus("Не удалось включить микрофон. Введите значение вручную.", true);
        reject(error);
      }
    });
  }

  // Ends listening now and hands over what was heard (a phrase), or nothing if nothing was heard.
  function finish() {
    if (!activeSession?.finish) return stop();
    requestVersion += 1;
    activeSession.finish();
    return true;
  }

  return { capability, listen, stop, finish };
}