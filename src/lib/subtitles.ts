export type WordTimestamp = { text: string; start: number; end: number };

function srtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function wordsToSrt(words: WordTimestamp[]) {
  const cues: Array<{ text: string; start: number; end: number }> = [];
  let current: WordTimestamp[] = [];

  const flush = () => {
    if (!current.length) return;
    cues.push({
      text: current.map((word) => word.text).join(" ").replace(/\s+([,.!?…])/g, "$1").trim(),
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (const word of words) {
    current.push(word);
    const text = current.map((item) => item.text).join(" ");
    const duration = word.end - current[0].start;
    const sentenceEnd = /[.!?。？！…][\"'”’)]?$/.test(word.text);
    if (sentenceEnd || text.length >= 24 || duration >= 4.5) flush();
  }
  flush();

  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}`).join("\n\n");
}

export function srtToScript(srt: string) {
  return srt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index) => {
        if (!line) return false;
        if (index === 0 && /^\d+$/.test(line)) return false;
        return !/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line);
      })
      .join(" ")
      .trim())
    .filter(Boolean)
    .join("\n\n");
}
