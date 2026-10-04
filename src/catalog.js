import { fileNameFor, validatePackage } from "./model.js";

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Некорректная дата замера.");
  return date;
}

export function localDateKey(value) {
  const date = dateValue(value);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sortSurveyRecords(records) {
  return [...records]
    .filter((record) => record?.storage_kind === "survey" && record.package?.package_id)
    .sort((left, right) => String(right.saved_at ?? "").localeCompare(String(left.saved_at ?? "")));
}

export function surveysForLocalDay(records, day = new Date()) {
  const key = localDateKey(day);
  return sortSurveyRecords(records).filter((record) => {
    try {
      return localDateKey(record.package.created_at) === key;
    } catch {
      return false;
    }
  });
}

export function archiveEntriesForDay(records, day = new Date()) {
  return surveysForLocalDay(records, day).map((record, index) => {
    validatePackage(record.package);
    return {
      name: `${String(index + 1).padStart(3, "0")} - ${fileNameFor(record.package)}`,
      data: JSON.stringify(record.package, null, 2),
    };
  });
}

export function archiveFileName(day = new Date()) {
  return `замеры-${localDateKey(day)}.zip`;
}
