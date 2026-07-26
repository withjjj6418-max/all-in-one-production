export type BilingualTimelineRow = {
  japanese: string;
  korean: string;
  startSeconds: number | null;
};

type SrtCue = { startSeconds: number; text: string };

export function parseBilingualReview(value: string) {
  const pairs: Array<{ japanese: string; korean: string }> = [];
  let japanese = "";
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    const japaneseMatch = line.match(/^(?:JP|일본어)\s*[｜|:：]\s*(.+)$/i);
    const koreanMatch = line.match(/^(?:KO|KR|한국어)\s*[｜|:：]\s*(.+)$/i);
    if (japaneseMatch) japanese = japaneseMatch[1].trim();
    else if (koreanMatch && japanese) {
      pairs.push({ japanese, korean: koreanMatch[1].trim() });
      japanese = "";
    }
  }
  return pairs;
}

function parseSrt(value: string): SrtCue[] {
  return value.trim().split(/\r?\n\r?\n+/).flatMap((block) => {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return [];
    const match = lines[timingIndex].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->/);
    if (!match) return [];
    const startSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const text = lines.slice(timingIndex + 1).join("").trim();
    return text ? [{ startSeconds, text }] : [];
  });
}

function normalizeJapanese(value: string) {
  return value.normalize("NFKC").replace(/[\s。、，．！？!?,「」『』（）()[\]【】…・：:；;"'—―ー-]/g, "");
}

export function buildBilingualTimeline(reviewText: string, srt: string): BilingualTimelineRow[] {
  const pairs = parseBilingualReview(reviewText);
  const cues = parseSrt(srt);
  if (!cues.length) return pairs.map((pair) => ({ ...pair, startSeconds: null }));
  const normalizedCues = cues.map((cue) => normalizeJapanese(cue.text));
  const cueOffsets: number[] = [];
  let joined = "";
  for (const text of normalizedCues) {
    cueOffsets.push(joined.length);
    joined += text;
  }
  let searchOffset = 0;
  return pairs.map((pair) => {
    const target = normalizeJapanese(pair.japanese);
    let foundAt = target ? joined.indexOf(target, searchOffset) : -1;
    if (foundAt < 0 && target.length >= 8) foundAt = joined.indexOf(target.slice(0, Math.min(16, target.length)), searchOffset);
    if (foundAt < 0) return { ...pair, startSeconds: null };
    const cueIndex = Math.max(0, cueOffsets.findLastIndex((offset) => offset <= foundAt));
    searchOffset = foundAt + Math.max(1, target.length);
    return { ...pair, startSeconds: cues[cueIndex].startSeconds };
  });
}

export function formatEditorTimecode(totalSeconds: number) {
  const value = Math.max(0, Number(totalSeconds) || 0);
  const wholeSeconds = Math.floor(value);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const hundredths = Math.floor((value - wholeSeconds) * 100);
  return [hours, minutes, seconds, hundredths].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatYoutubeTimestamp(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
