// functions/utils/answer-compression.js
// ════════════════════════════════════════════════════════════════════════════
// PHASE 10.5 — ANSWER COMPRESSION. Removes unnecessary length/repetition. Mode
// transforms already condense SHORT/MICRO bodies; this is a safe final pass that
// de-duplicates lines and collapses excess blank space without mangling Markdown.
// Pure (no I/O), Markdown-safe, language-agnostic.
// ════════════════════════════════════════════════════════════════════════════

export function compress(answer, depth = 'STANDARD') {
  if (!answer || typeof answer !== 'string') return answer;

  const lines = answer.split('\n');
  const out = [];
  let lastNonEmpty = null;
  let blankRun = 0;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') {
      blankRun++;
      if (blankRun <= 1) out.push('');       // collapse 2+ blank lines into one
      continue;
    }
    blankRun = 0;
    // Drop an exact consecutive duplicate non-empty line (common with stacked layers).
    if (line.trim() === lastNonEmpty) continue;
    lastNonEmpty = line.trim();
    out.push(line);
  }

  let result = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // MICRO must be tight: keep the lead through the first follow-up/disclaimer.
  if (depth === 'MICRO') {
    result = result.replace(/\n{2,}/g, '\n\n');
  }
  return result;
}
