// functions/knowledge/islamic/concepts.js
// CATEGORY: islamic — swap-free / halal overview (clarify, no over-claiming).

export const ISLAMIC_CONCEPTS = [
  {
    id: 'islamic-overview', category: 'islamic', topic: 'Islamic Trading Overview', level: 'beginner',
    title: 'Islamic Trading Overview', intent: 'islamic',
    concepts: ['islamic', 'halal', 'swap free', 'riba'],
    questionPatterns: ['is forex halal', 'what is islamic trading', 'swap free account explained', 'is gold trading halal', 'islamic trading rules'],
    canonical: {
      short: 'Islamic (swap-free) trading aims to avoid riba by removing overnight interest, usually through a swap-free account. It does not automatically make every trade halal — excessive speculation and leverage still matter — so pair a swap-free account with disciplined, intention-driven trading.',
      deep: 'A swap-free account removes the overnight interest that is the clearest riba concern, which is why brokers offer it for Islamic clients. But scholars differ on leverage and short-term speculation, so the account type is a tool, not a ruling. Seek qualified guidance for your situation and keep risk and intention clean.',
    },
    responseObjective: 'clarify', desiredOutcome: 'understand swap-free accounts without overclaiming halal',
    relevanceTags: ['islamic', 'halal'],
    islamic: { swapFree: true, note: 'Swap-free removes overnight interest; intention and risk still matter.' },
    recommendedTools: ['library'],
    related: ['broker-selection'], followups: ['broker-selection'],
    status: 'published', origin: 'authored', confidence: 'MEDIUM', lang: 'en',
  },
];
