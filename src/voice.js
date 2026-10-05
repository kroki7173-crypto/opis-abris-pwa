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

export function spokenMeasurement(transcript) {
  const raw = String(transcript ?? "").trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  if (!raw) throw new Error("Голосовой ввод ничего не распознал.");

  const direct = raw.match(/^\s*(\d+(?:[.,]\d+)?)\s*(м|метр(?:а|ов)?|см|сантиметр(?:а|ов)?)?\s*$/u);
  if (direct) {
    const value = Number(direct[1].replace(",", "."));
    return formatted(CENTIMETER_WORDS.has(direct[2]) ? value / 100 : value);
  }
  const numericPair = raw.match(/^\s*(\d+)\s+(\d{1,2})\s*$/u);
  if (numericPair) {
    const fraction = numericPair[2].padEnd(2, "0");
    return formatted(Number(numericPair[1]) + Number(fraction) / 100);
  }

  const tokens = normalizedTokens(raw);
  const meterIndex = tokens.findIndex((token) => METER_WORDS.has(token));
  const centimeterIndex = tokens.findIndex((token) => CENTIMETER_WORDS.has(token));
  if (meterIndex >= 0) {
    const meters = partNumber(tokens.slice(0, meterIndex)) ?? 0;
    const end = centimeterIndex > meterIndex ? centimeterIndex : tokens.length;
    const rest = tokens.slice(meterIndex + 1, end);
    if (rest.includes("половиной")) return formatted(meters + 0.5);
    const centimeters = partNumber(rest) ?? 0;
    return formatted(meters + centimeters / 100);
  }
  if (centimeterIndex >= 0) {
    const centimeters = partNumber(tokens.slice(0, centimeterIndex));
    if (centimeters === null) throw new Error("Не удалось распознать число сантиметров.");
    return formatted(centimeters / 100);
  }

  const wholeIndex = tokens.findIndex((token) => WHOLE_WORDS.has(token) || token === "запятая");
  if (wholeIndex >= 0) {
    const whole = partNumber(tokens.slice(0, wholeIndex)) ?? 0;
    const fraction = fractionFromTokens(tokens.slice(wholeIndex + 1));
    if (fraction === null) throw new Error("Не удалось распознать дробную часть размера.");
    return formatted(whole + fraction);
  }
  if (tokens.includes("половиной")) {
    const halfIndex = tokens.indexOf("половиной");
    const whole = partNumber(tokens.slice(0, halfIndex).filter((token) => token !== "с"));
    if (whole === null) throw new Error("Не удалось распознать размер с половиной.");
    return formatted(whole + 0.5);
  }
  if (tokens[0] && ONES.has(tokens[0]) && tokens.length > 1) {
    const whole = ONES.get(tokens[0]);
    const fraction = fractionFromTokens(tokens.slice(1));
    if (fraction !== null) return formatted(whole + fraction);
  }
  const value = partNumber(tokens);
  if (value === null) throw new Error(`Не удалось понять размер: «${transcript}».`);
  return formatted(value);
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

  function stop() {
    if (!active) return false;
    if (activeSession) activeSession.cancelled = true;
    try { active.abort(); } catch { /* Распознавание уже завершилось. */ }
    return true;
  }

  async function listen({ mode, onValue, onListening = () => {}, timeoutMs = 8000 }) {
    stop();
    const { local } = await prepare();
    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    if (local) recognition.processLocally = true;
    const session = { cancelled: false, timer: null };
    active = recognition;
    activeSession = session;

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        clearTimeout(session.timer);
        if (active === recognition) active = null;
        if (activeSession === session) activeSession = null;
        onListening(false);
      };
      recognition.onstart = () => {
        onListening(true);
        onStatus("Говорите. После заполнения обязательно проверьте значение.", false);
        session.timer = setTimeout(() => {
          session.cancelled = true;
          onStatus("Микрофон остановлен: время ожидания истекло.", false);
          try { recognition.abort(); } catch { /* Распознавание уже завершилось. */ }
        }, Math.max(1000, Number(timeoutMs) || 8000));
      };
      recognition.onresult = (event) => {
        if (settled) return;
        try {
          const transcript = event.results[event.resultIndex][0].transcript.trim();
          const value = mode === "measurement" ? spokenMeasurement(transcript) : transcript;
          onValue(value, transcript);
          onStatus(`Распознано: «${transcript}». Проверьте значение.`, false);
          settled = true;
          clearTimeout(session.timer);
          resolve({ value, transcript });
        } catch (error) {
          settled = true;
          clearTimeout(session.timer);
          onStatus(error.message, true);
          reject(error);
        }
      };
      recognition.onerror = (event) => {
        if (settled) return;
        if (event.error === "aborted" && session.cancelled) {
          settled = true;
          resolve(null);
          return;
        }
        settled = true;
        const error = new Error(recognitionError(event.error));
        onStatus(error.message, true);
        reject(error);
      };
      recognition.onend = () => {
        finish();
        if (!settled) {
          settled = true;
          resolve(null);
        }
      };
      try {
        recognition.start();
      } catch (error) {
        settled = true;
        finish();
        onStatus("Не удалось включить микрофон. Введите значение вручную.", true);
        reject(error);
      }
    });
  }

  return { capability, listen, stop };
}