export type SpeechAlignment = {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
};

type SubtitleSegment = {
  text: string;
  audio_duration: number | null;
  alignment: SpeechAlignment;
};

function formatSrtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((milliseconds % 60000) / 1000);
  const rest = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

function splitJapaneseCues(text: string) {
  const cues: Array<{ text: string; startIndex: number; endIndex: number }> = [];
  let cueText = "";
  let cueStartIndex = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    cueText += character;
    if (/[。！？!?…\n]/u.test(character) || cueText.trim().length >= 28) {
      if (cueText.trim()) cues.push({ text: cueText.trim(), startIndex: cueStartIndex, endIndex: index + 1 });
      cueText = "";
      cueStartIndex = index + 1;
    }
  }
  if (cueText.trim()) cues.push({ text: cueText.trim(), startIndex: cueStartIndex, endIndex: text.length });
  return cues;
}

export function buildJapaneseSegmentSrt(text: string, alignment: SpeechAlignment, durationValue?: number, firstCueNumber = 1, offset = 0) {
  const sourceText = text.trim();
  if (!sourceText) return { blocks: [] as string[], nextCueNumber: firstCueNumber };
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const timingCount = Math.min(starts.length, ends.length);
  const duration = Math.max(0.1, Number(durationValue || ends.at(-1) || 0));
  let cueNumber = firstCueNumber;
  const blocks = splitJapaneseCues(sourceText).map((cue) => {
    const startRatio = cue.startIndex / sourceText.length;
    const endRatio = cue.endIndex / sourceText.length;
    const startIndex = timingCount ? Math.min(timingCount - 1, Math.floor(startRatio * timingCount)) : 0;
    const endIndex = timingCount ? Math.min(timingCount - 1, Math.max(startIndex, Math.ceil(endRatio * timingCount) - 1)) : 0;
    const cueStart = timingCount ? Number(starts[startIndex] ?? duration * startRatio) : duration * startRatio;
    const estimatedEnd = timingCount ? Number(ends[endIndex] ?? duration * endRatio) : duration * endRatio;
    const cueEnd = Math.min(duration, Math.max(cueStart + 0.05, estimatedEnd));
    const block = `${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${cue.text}`;
    cueNumber += 1;
    return block;
  });
  return { blocks, nextCueNumber: cueNumber };
}

export function buildJapaneseCombinedSrt(segments: SubtitleSegment[]) {
  let offset = 0;
  let cueNumber = 1;
  const blocks: string[] = [];
  for (const segment of segments) {
    const duration = Number(segment.audio_duration || segment.alignment.character_end_times_seconds?.at(-1) || 0);
    const result = buildJapaneseSegmentSrt(segment.text, segment.alignment, duration, cueNumber, offset);
    blocks.push(...result.blocks);
    cueNumber = result.nextCueNumber;
    offset += duration;
  }
  return blocks.join("\n\n");
}

export function buildJapaneseCombinedSrtFromLines(segments: SubtitleSegment[], linesBySegment: string[][]) {
  let offset = 0;
  let cueNumber = 1;
  const blocks: string[] = [];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const lines = linesBySegment[segmentIndex].map((line) => line.trim()).filter(Boolean);
    const starts = segment.alignment.character_start_times_seconds || [];
    const ends = segment.alignment.character_end_times_seconds || [];
    const timingCount = Math.min(starts.length, ends.length);
    const duration = Math.max(0.1, Number(segment.audio_duration || ends.at(-1) || 0));
    const totalCharacters = lines.reduce((sum, line) => sum + line.replace(/\s/g, "").length, 0);
    let consumedCharacters = 0;
    for (const line of lines) {
      const lineLength = line.replace(/\s/g, "").length;
      const startRatio = consumedCharacters / totalCharacters;
      consumedCharacters += lineLength;
      const endRatio = consumedCharacters / totalCharacters;
      const startIndex = timingCount ? Math.min(timingCount - 1, Math.floor(startRatio * timingCount)) : 0;
      const endIndex = timingCount ? Math.min(timingCount - 1, Math.max(startIndex, Math.ceil(endRatio * timingCount) - 1)) : 0;
      const cueStart = timingCount ? Number(starts[startIndex] ?? duration * startRatio) : duration * startRatio;
      const estimatedEnd = timingCount ? Number(ends[endIndex] ?? duration * endRatio) : duration * endRatio;
      const cueEnd = Math.min(duration, Math.max(cueStart + 0.05, estimatedEnd));
      blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${line}`);
      cueNumber += 1;
    }
    offset += duration;
  }
  return blocks.join("\n\n");
}
