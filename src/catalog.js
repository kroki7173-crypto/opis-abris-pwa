import { fileNameFor, inferPartitionThickness, planProblems, validatePackage, withExplicitWallThickness } from "./model.js";

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
    // An object with only an address has nothing for the desktop yet; it stays out of the day's ZIP.
    if (!record.package.rooms?.length) return false;
    try {
      return localDateKey(record.package.created_at) === key;
    } catch {
      return false;
    }
  });
}

// A survey the final check does not understand yet. The day's ZIP still carries it (it is also the backup of the
// day), but the technician sees which ones go out with remarks.
export function hasRemarks(record) {
  const pkg = record?.package;
  if (!pkg?.rooms?.length) return false;
  try {
    validatePackage(pkg);
    return planProblems(pkg).length > 0;
  } catch {
    return true;
  }
}

export function archiveEntriesForDay(records, day = new Date()) {
  return surveysForLocalDay(records, day).map((record, index) => {
    validatePackage(record.package);
    // Partitions between rooms not joined by a door go out as thick as the gap the app measured between them.
    const pkg = withExplicitWallThickness(inferPartitionThickness(record.package));
    return {
      name: `${String(index + 1).padStart(3, "0")} - ${fileNameFor(pkg)}`,
      data: JSON.stringify(pkg, null, 2),
    };
  });
}

export function archiveFileName(day = new Date()) {
  return `замеры-${localDateKey(day)}.zip`;
}
