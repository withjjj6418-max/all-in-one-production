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
    const alignedCharacters = segment.alignment.characters || [];
    const timingCount = Math.min(starts.length, ends.length);
    const duration = Math.max(0.1, Number(segment.audio_duration || ends.at(-1) || 0));
    const characterLengths = lines.map((line) => line.replace(/\s/g, "").length);
    const totalCharacters = characterLengths.reduce((sum, length) => sum + length, 0);
    const boundaryCharacterCounts = [0];
    let consumedCharacters = 0;
    for (const length of characterLengths) {
      consumedCharacters += length;
      boundaryCharacterCounts.push(consumedCharacters);
    }

    const timedCharacterIndexes: number[] = [];
    for (let index = 0; index < timingCount; index += 1) {
      if (!/\s/u.test(alignedCharacters[index] || "")) timedCharacterIndexes.push(index);
    }
    const compactAlignedText = alignedCharacters.join("").replace(/\s/g, "");
    const compactSourceText = segment.text.replace(/\s/g, "");
    const hasExactSourceAlignment = compactAlignedText === compactSourceText;

    const resolveBoundaryIndex = (characterCount: number) => {
      if (!timingCount) return 0;
      if (hasExactSourceAlignment && timedCharacterIndexes.length === totalCharacters && totalCharacters > 0) {
        if (characterCount >= totalCharacters) return timingCount;
        return timedCharacterIndexes[Math.max(0, characterCount)] ?? timingCount;
      }
      return Math.min(timingCount, Math.round((characterCount / Math.max(1, totalCharacters)) * timingCount));
    };

    const timedLines = lines.map((line, index) => {
      const startCharacterCount = boundaryCharacterCounts[index];
      const endCharacterCount = boundaryCharacterCounts[index + 1];
      const startRatio = startCharacterCount / Math.max(1, totalCharacters);
      const endRatio = endCharacterCount / Math.max(1, totalCharacters);
      const startIndex = timingCount ? Math.min(timingCount - 1, resolveBoundaryIndex(startCharacterCount)) : 0;
      const nextBoundaryIndex = timingCount ? resolveBoundaryIndex(endCharacterCount) : 0;
      const endIndex = timingCount ? Math.min(timingCount - 1, Math.max(startIndex, nextBoundaryIndex - 1)) : 0;
      const cueStart = timingCount ? Number(starts[startIndex] ?? duration * startRatio) : duration * startRatio;
      const cueEnd = timingCount ? Number(ends[endIndex] ?? duration * endRatio) : duration * endRatio;
      const nextStart = index < lines.length - 1
        ? timingCount ? Number(starts[Math.min(timingCount - 1, nextBoundaryIndex)] ?? duration * endRatio) : duration * endRatio
        : duration;
      return { line, cueStart, cueEnd: Math.min(duration, Math.max(cueStart + 0.05, cueEnd)), pauseAfter: Math.max(0, nextStart - cueEnd) };
    });

    const groups: Array<typeof timedLines> = [];
    let lineIndex = 0;
    while (lineIndex < timedLines.length) {
      const remaining = timedLines.length - lineIndex;
      if (remaining <= 4) {
        groups.push(timedLines.slice(lineIndex));
        break;
      }
      const candidates = [3, 4].filter((size) => remaining - size === 0 || remaining - size >= 3);
      const groupSize = (candidates.length ? candidates : [3]).reduce((best, size) => {
        const bestPause = timedLines[lineIndex + best - 1]?.pauseAfter ?? -1;
        const candidatePause = timedLines[lineIndex + size - 1]?.pauseAfter ?? -1;
        return candidatePause > bestPause ? size : best;
      });
      groups.push(timedLines.slice(lineIndex, lineIndex + groupSize));
      lineIndex += groupSize;
    }

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      const cueStart = group[0].cueStart;
      const naturalEnd = group.at(-1)?.cueEnd ?? cueStart + 0.05;
      const nextStart = groups[groupIndex + 1]?.[0].cueStart;
      const cueEnd = nextStart === undefined ? naturalEnd : Math.min(naturalEnd, Math.max(cueStart + 0.001, nextStart - 0.001));
      blocks.push(`${cueNumber}\n${formatSrtTime(offset + cueStart)} --> ${formatSrtTime(offset + cueEnd)}\n${group.map((item) => item.line).join("\n")}`);
      cueNumber += 1;
    }
    offset += duration;
  }
  return blocks.join("\n\n");
}
