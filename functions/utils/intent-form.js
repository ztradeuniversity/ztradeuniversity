// functions/utils/intent-form.js
// ════════════════════════════════════════════════════════════════════════════
// QUESTION-FORM DETECTION — production upgrade. Audit finding: intent-engine.js
// classifies WHAT topic a question is about (riskmgmt/events/technical/…) but
// not the FORM of the question — "What is Elliott Wave Theory?" (definition),
// "How do I trade Elliott Wave?" (usage/how-to), "Give me an example of Elliott
// Wave" (example) all mapped to the identical answer. This module classifies
// the form ORTHOGONALLY to topic intent — a new leaf module, never touching
// the frozen intent-engine.classifyIntent. Pure (no I/O).
//
// Consumed by composer-llm.js (makeLLMComposer/generateEducationalAnswer) as an
// extra shaping instruction layered on the SAME grounded draft — it never adds
// facts, it only changes which angle of the already-grounded answer to lead with.
// ════════════════════════════════════════════════════════════════════════════

const FORMS = [
  { form: 'example',    re: /\b(give|show|provide)\s+(me\s+)?(an?\s+)?example|example of|for example|case study|real[- ]world example|illustrate/i },
  { form: 'howto',      re: /\bhow (do|does|can|should|to)\b|\bhow.{0,15}(trade|use|apply|set up|setup|implement|spot|identify)\b|steps to|step by step/i },
  { form: 'comparison', re: /\b(vs\.?|versus|difference between|compared? to|better than|which is better)\b/i },
  { form: 'why',        re: /^\s*why\b|\breason(s)? (for|why)\b/i },
  { form: 'definition', re: /^\s*(what is|what's|what are|define|definition of|meaning of)\b/i },
];

// Returns one of 'definition' | 'howto' | 'example' | 'comparison' | 'why' | 'general'.
// 'general' is the safe default — every existing caller that ignores the form keeps
// behaving exactly as before (no change unless a caller opts in to use it).
export function detectQuestionForm(text) {
  const s = String(text || '').trim();
  if (!s) return 'general';
  for (const { form, re } of FORMS) if (re.test(s)) return form;
  return 'general';
}

// A short, additive instruction line for the LLM composer/educational generator —
// shapes HOW to present the already-grounded facts, never what facts to use.
export function formInstruction(form) {
  switch (form) {
    case 'example':
      return 'The user asked for an EXAMPLE — lead with a concrete, illustrative example built ONLY from the facts already in the draft (no invented numbers/prices), then briefly explain it.';
    case 'howto':
      return 'The user asked HOW to do/apply this — lead with the practical, actionable steps from the draft, in order, not just the definition.';
    case 'comparison':
      return 'The user asked for a COMPARISON — structure the answer around the contrast (this vs. that) using only what is in the draft.';
    case 'why':
      return 'The user asked WHY — lead with the underlying reason/cause from the draft before any supporting detail.';
    case 'definition':
      return 'The user asked WHAT something IS — lead with a clear, direct definition before any elaboration.';
    default:
      return '';
  }
}
