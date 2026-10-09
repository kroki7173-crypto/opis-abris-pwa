export const MAX_VOICE_NOTES = 8;
export const MAX_VOICE_NOTE_BYTES = 500000;
export const MAX_VOICE_NOTES_TOTAL_BYTES = 2000000;
export const MAX_VOICE_NOTE_MS = 60000;
export const VOICE_NOTE_MIMES = ["audio/webm", "audio/mp4", "audio/ogg"];

export function validateVoiceNotes(pkg) {
  const notes = pkg?.voice_notes ?? [];
  if (!Array.isArray(notes) || notes.length > MAX_VOICE_NOTES) {
    throw new Error("В одном объекте допускается не больше 8 голосовых примечаний.");
  }
  const roomIds = new Set((pkg.rooms ?? []).map((room) => room.id));
  const ids = new Set();
  let total = 0;
  for (const note of notes) {
    if (!note || typeof note !== "object" ||
        typeof note.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(note.id) ||
        ids.has(note.id) || !roomIds.has(note.room_id) ||
        !VOICE_NOTE_MIMES.includes(note.mime_type) ||
        !Number.isInteger(note.bytes) || note.bytes < 1 || note.bytes > MAX_VOICE_NOTE_BYTES ||
        !Number.isInteger(note.duration_ms) || note.duration_ms < 1 || note.duration_ms > MAX_VOICE_NOTE_MS ||
        typeof note.created_at !== "string" || !Number.isFinite(Date.parse(note.created_at))) {
      throw new Error("Некорректное голосовое примечание к комнате.");
    }
    ids.add(note.id);
    total += note.bytes;
    if (total > MAX_VOICE_NOTES_TOTAL_BYTES) {
      throw new Error("Голосовые примечания занимают больше 2 МБ. Удалите или перезапишите одну из записей.");
    }
  }
  return notes;
}

export async function packageWithVoiceNotes(pkg, loadAudio) {
  const notes = validateVoiceNotes(pkg);
  const complete = [];
  for (const note of notes) {
    const blob = await loadAudio(pkg.package_id, note.id);
    if (!(blob instanceof Blob) || blob.size !== note.bytes) {
      throw new Error("Аудиозапись примечания не найдена на телефоне. Передача остановлена.");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    complete.push({ ...note, data_base64: btoa(binary) });
  }
  return { ...pkg, voice_notes: complete };
}
