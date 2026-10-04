const VARIANTS = [
  {
    id: "calm",
    number: "01",
    title: "Спокойный",
    description: "Тёплый зелёный, мягкие карточки и знакомая структура. Ближе всего к текущему PWA.",
  },
  {
    id: "contrast",
    number: "02",
    title: "Контрастный",
    description: "Крупные элементы и максимальный контраст для работы на улице и в перчатках.",
  },
  {
    id: "blueprint",
    number: "03",
    title: "Чертёжный",
    description: "Техническая сетка, строгие линии и визуальный акцент на плане и размерах.",
  },
  {
    id: "minimal",
    number: "04",
    title: "Минимальный",
    description: "Больше воздуха, меньше рамок и один яркий акцент только на следующем действии.",
  },
];

const root = document.documentElement;
const gallery = document.getElementById("designGallery");
const template = document.getElementById("sampleTemplate");
const choiceStatus = document.getElementById("choiceStatus");
const themeColor = document.getElementById("themeColor");

function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Галерея остаётся рабочей, даже если браузер запретил локальное хранилище.
  }
}

function setTheme(theme) {
  root.dataset.theme = theme;
  const dark = theme === "dark";
  themeColor.content = dark ? "#0c1210" : "#edf2ee";
  for (const button of document.querySelectorAll(".theme-toggle, .phone-theme-toggle")) {
    button.setAttribute("aria-label", dark ? "Включить светлую тему" : "Включить тёмную тему");
    button.setAttribute("aria-pressed", String(dark));
  }
  savePreference("abris-preview-theme", theme);
}

function toggleTheme() {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
}

function setChoice(id) {
  const variant = VARIANTS.find((item) => item.id === id);
  if (!variant) return;
  for (const card of document.querySelectorAll(".sample-card")) {
    const selected = card.dataset.variant === id;
    card.classList.toggle("selected", selected);
    const button = card.querySelector(".choose-button");
    button.textContent = selected ? "Выбрано ✓" : "Выбрать";
    button.setAttribute("aria-pressed", String(selected));
  }
  choiceStatus.textContent = `Выбран вариант ${variant.number} — «${variant.title}»`;
  savePreference("abris-preview-choice", id);
}

for (const variant of VARIANTS) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".sample-card");
  card.dataset.variant = variant.id;
  card.querySelector(".sample-number").textContent = variant.number;
  card.querySelector(".sample-title").textContent = variant.title;
  card.querySelector(".sample-description").textContent = variant.description;
  card.querySelector(".choose-button").addEventListener("click", () => setChoice(variant.id));
  card.querySelector(".phone-theme-toggle").addEventListener("click", toggleTheme);
  gallery.append(fragment);
}

document.getElementById("themeToggle").addEventListener("click", toggleTheme);

const storedTheme = readPreference("abris-preview-theme");
const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
setTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : systemDark ? "dark" : "light");

const storedChoice = readPreference("abris-preview-choice");
if (VARIANTS.some((item) => item.id === storedChoice)) setChoice(storedChoice);
