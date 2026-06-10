// functions/knowledge/psychology/basics-concepts.js
// PHASE 21 — BEGINNER KNOWLEDGE FOUNDATION (category: psychology)
// The emotions every beginner meets — named, normalised, and turned into rules.

const F = (o) => ({
  level: 'beginner', responseObjective: 'mentor', journeyStages: ['journey-foundation'],
  status: 'published', origin: 'authored', confidence: 'HIGH', lang: 'en', ...o,
});

export const PSYCHOLOGY_BASICS_CONCEPTS = [
  F({
    id: 'trading-emotions', category: 'psychology', topic: 'Trading Emotions', title: 'Managing Trading Emotions',
    concepts: ['emotions', 'psychology', 'basics'],
    questionPatterns: ['how do emotions affect trading', 'how do i control my emotions trading', 'why do i trade emotionally', 'how to trade without emotion', 'managing emotions in trading'],
    canonical: {
      short: 'Emotions are normal — the goal is not to delete them but to stop them making decisions. The cure is rules made in advance (entry, stop, target, risk) so that in the heat of a trade you follow the plan instead of the feeling.',
      deep: 'Fear, greed, hope, and frustration push traders to break their own rules — closing winners early, holding losers, or oversizing to "make it back". You cannot remove the emotions, but you can remove their authority by deciding everything before the trade: the setup, the stop, the target, and the position size. Small risk also quiets emotion, because nothing feels life-or-death when only 1% is on the line. Journaling the feeling behind each trade reveals your personal triggers.',
    },
    desiredOutcome: 'pre-commit to rules so emotions inform but never decide',
    relevanceTags: ['emotions', 'psychology', 'beginner'],
    commonMistakes: ['oversizing so much that every tick feels like an emergency'],
    misconceptions: ['that good traders feel no fear or greed'],
    prerequisites: [], nextSteps: ['fear-and-greed', 'accepting-losses'], related: ['emotional-control', 'trading-psychology'],
    followups: ['fear-and-greed'],
    riskNote: 'Small per-trade risk is the simplest emotion-control tool there is.',
  }),
  F({
    id: 'fear-and-greed', category: 'psychology', topic: 'Fear and Greed', title: 'Fear and Greed',
    concepts: ['fear', 'greed', 'psychology', 'basics'],
    questionPatterns: ['what is fear and greed in trading', 'how do fear and greed affect traders', 'why am i greedy in trading', 'how to control fear and greed', 'fear and greed explained'],
    canonical: {
      short: 'Fear makes you close winners too early and hesitate on good setups; greed makes you oversize, chase, and hold too long. Both come from the outcome mattering too much — which usually means the position is too big. Rules plus small size keep them in check.',
      deep: 'Fear and greed are two sides of the same problem: caring too much about a single trade. Fear cuts winners short and freezes you at good entries; greed pushes oversizing, chasing extended moves, and refusing to take profit. The antidote is structural — fixed small risk so no trade is do-or-die, predefined entries/exits so decisions are already made, and a journal to catch the pattern. When risk is small and rules are set, both emotions lose their grip.',
    },
    desiredOutcome: 'recognise fear/greed as signs of oversizing and fix with rules + small size',
    relevanceTags: ['fear', 'greed', 'beginner'],
    commonMistakes: ['chasing a move out of greed or revenge-sizing after a loss'],
    misconceptions: ['that you must "toughen up" rather than reduce position size'],
    prerequisites: ['trading-emotions'], nextSteps: ['accepting-losses'], related: ['greed', 'fear-of-loss'],
    followups: ['accepting-losses'],
    riskNote: 'When a trade feels do-or-die, your size is the problem — cut it.',
  }),
  F({
    id: 'accepting-losses', category: 'psychology', topic: 'Accepting Losses', title: 'Accepting Losses',
    concepts: ['losses', 'psychology', 'basics'],
    questionPatterns: ['how do i accept losses', 'why cant i accept a losing trade', 'how to deal with losing trades', 'are losses normal in trading', 'how to stop revenge trading after a loss'],
    canonical: {
      short: 'Losses are a normal cost of doing business — even great traders lose often. The skill is taking the small planned loss without flinching, instead of widening the stop or revenge trading. One accepted loss protects the account; one refused loss can end it.',
      deep: 'Trading is a game of probabilities, so losses are not mistakes — they are the price of participating. The danger is not the loss itself but the reaction: moving the stop, adding to the loser, or revenge trading to "win it back". Accepting a loss means it was pre-defined, small (1–2%), and taken without drama, then logged and reviewed. Traders who internalise this stay calm and consistent; those who fight every loss eventually hand back the account in a single tilt.',
    },
    desiredOutcome: 'take small planned losses calmly and avoid revenge trading',
    relevanceTags: ['losses', 'psychology', 'beginner'],
    commonMistakes: ['revenge trading immediately after a loss to win it back'],
    misconceptions: ['that a loss means you traded badly'],
    prerequisites: ['trading-emotions'], nextSteps: ['trading-discipline'], related: ['revenge-trading', 'fear-of-loss'],
    followups: ['trading-discipline'],
    riskNote: 'After a loss, the highest-risk moment is the urge to immediately trade again.',
  }),
  F({
    id: 'beginner-mindset', category: 'psychology', topic: 'Beginner Mindset', title: 'The Right Beginner Mindset',
    concepts: ['mindset', 'psychology', 'basics'],
    questionPatterns: ['what mindset do i need to trade', 'how should a beginner think about trading', 'what is the right trading mindset', 'how long does it take to learn trading', 'realistic expectations in trading'],
    canonical: {
      short: 'The healthiest beginner mindset is "survive and learn", not "get rich". Treat the first months as paid education: protect capital, master one setup, and measure progress by discipline followed — not by money made. Skill compounds; rushing blows accounts.',
      deep: 'Most accounts fail not from bad strategy but from unrealistic expectations that drive over-risking and impatience. The mindset that lasts treats early trading as an apprenticeship: the goal is process, not profit. Concretely — protect capital first, learn one setup deeply, risk 1–2%, journal everything, and judge yourself on whether you followed your rules, not on the P/L of any single trade. Profit becomes the by-product once the process is consistent.',
    },
    desiredOutcome: 'adopt a survive-and-learn, process-over-profit mindset',
    relevanceTags: ['mindset', 'psychology', 'beginner'],
    commonMistakes: ['expecting fast riches and over-risking to chase them'],
    misconceptions: ['that consistent profit comes quickly with the right strategy'],
    prerequisites: [], nextSteps: ['trading-emotions', 'becoming-profitable'], related: ['trader-mindset', 'process-focus'],
    followups: ['becoming-profitable'],
    riskNote: 'Unrealistic expectations cause over-risking — measure progress by discipline, not money.',
  }),
];
