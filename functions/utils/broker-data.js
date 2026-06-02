// functions/utils/broker-data.js
// ════════════════════════════════════════════════════════════════════════════
// ★★★  BROKER INTELLIGENCE DATASET  ★★★
//
//   👉  THIS IS THE SINGLE PLACE TO ADD / REMOVE / EDIT BROKERS.  👈
//
//   To add a broker: copy one block below, edit the fields, done.
//   To remove a broker: delete its block.
//   To edit: change any field (regulators, links, account types, notes).
//
//   No code anywhere else needs changing — the AI engine reads this list.
//
//   Sources used are OFFICIAL ONLY: the broker's own website / help center,
//   and the official regulator register pages. We never cite review/blog sites.
//   Regulator associations reflect each broker's public disclosures — the AI
//   always tells users to confirm on the official regulator register.
// ════════════════════════════════════════════════════════════════════════════

// Official regulator register lookups (used to tell users where to verify a broker)
export const REGULATORS = {
  FCA:    { name: 'FCA (UK)',                 verify: 'https://register.fca.org.uk/' },
  CySEC:  { name: 'CySEC (Cyprus)',           verify: 'https://www.cysec.gov.cy/en-GB/entities/investment-firms/' },
  ASIC:   { name: 'ASIC (Australia)',         verify: 'https://connectonline.asic.gov.au/' },
  FSCA:   { name: 'FSCA (South Africa)',      verify: 'https://www.fsca.co.za/Fais/Search_FSP.htm' },
  DFSA:   { name: 'DFSA (Dubai)',             verify: 'https://www.dfsa.ae/public-register' },
  FSA_SC: { name: 'FSA (Seychelles)',         verify: 'https://fsaseychelles.sc/' },
  CBI:    { name: 'Central Bank of Ireland',  verify: 'https://registers.centralbank.ie/' },
  FSC_BZ: { name: 'FSC (Belize)',             verify: 'https://www.ifsc.gov.bz/' },
  BaFin:  { name: 'BaFin (Germany)',          verify: 'https://portal.mvp.bafin.de/' },
  CMA:    { name: 'CMA (Kenya)',              verify: 'https://www.cma.or.ke/' },
  SCB:    { name: 'SCB (Bahamas)',            verify: 'https://www.scb.gov.bs/' },
  LFSA:   { name: 'Labuan FSA (Malaysia)',    verify: 'https://www.labuanfsa.gov.my/' },
};

// ── BROKER LIST ─────────────────────────────────────────────────────────────
// Priority brokers requested. Add more by copying a block.
export const BROKERS = [
  {
    key: 'exness',
    name: 'Exness',
    aliases: ['exness'],
    regulators: ['CySEC', 'FCA', 'FSCA', 'FSA_SC'],
    website:    'https://www.exness.com/',
    help:       'https://www.exness.com/help/',
    accountTypes: ['Standard', 'Standard Cent', 'Pro', 'Raw Spread', 'Zero'],
    notes: 'Known for instant withdrawals on many methods and very high leverage on some entities. Standard Cent suits very small/learning accounts.',
  },
  {
    key: 'octa',
    name: 'Octa (OctaFX)',
    aliases: ['octa', 'octafx'],
    regulators: ['CySEC', 'FSCA'],
    website:    'https://www.octafx.com/',
    help:       'https://www.octafx.com/support/',
    accountTypes: ['Standard (MT4)', 'Standard (MT5)', 'OctaTrader'],
    notes: 'Commission-free spread-based accounts. Copy-trading available in the OctaTrader app.',
  },
  {
    key: 'xm',
    name: 'XM',
    aliases: ['xm', 'xm group', 'xmglobal', 'xm.com'],
    regulators: ['CySEC', 'ASIC', 'DFSA', 'FSC_BZ'],
    website:    'https://www.xm.com/',
    help:       'https://www.xm.com/contact',
    accountTypes: ['Micro', 'Standard', 'XM Ultra Low', 'Shares'],
    notes: 'Micro & Ultra Low accounts popular with beginners; no requotes policy advertised.',
  },
  {
    key: 'hfm',
    name: 'HFM (HotForex / HF Markets)',
    aliases: ['hfm', 'hotforex', 'hf markets', 'hfmarkets'],
    regulators: ['FCA', 'CySEC', 'FSCA', 'DFSA', 'FSA_SC'],
    website:    'https://www.hfm.com/',
    help:       'https://www.hfm.com/int/en/support',
    accountTypes: ['Cent', 'Zero', 'Pro', 'Premium'],
    notes: 'Cent account is good for small capital; Zero account offers raw spreads + commission.',
  },
  {
    key: 'icmarkets',
    name: 'IC Markets',
    aliases: ['ic markets', 'icmarkets', 'ic-markets'],
    regulators: ['ASIC', 'CySEC', 'FSA_SC'],
    website:    'https://www.icmarkets.com/',
    help:       'https://www.icmarkets.com/global/en/forex-trading-platform/support',
    accountTypes: ['Standard', 'Raw Spread (cTrader)', 'Raw Spread (MT4/MT5)'],
    notes: 'Popular with scalpers/EAs for tight raw spreads and deep liquidity. cTrader supported.',
  },
  {
    key: 'pepperstone',
    name: 'Pepperstone',
    aliases: ['pepperstone'],
    regulators: ['FCA', 'ASIC', 'CySEC', 'DFSA', 'BaFin', 'CMA', 'SCB'],
    website:    'https://pepperstone.com/',
    help:       'https://pepperstone.com/en/help-and-support/',
    accountTypes: ['Standard', 'Razor'],
    notes: 'Razor account offers raw spreads + commission; broad multi-regulator coverage.',
  },
  {
    key: 'fbs',
    name: 'FBS',
    aliases: ['fbs'],
    regulators: ['CySEC', 'ASIC', 'FSCA', 'FSC_BZ'],
    website:    'https://fbs.com/',
    help:       'https://fbs.com/help-center',
    accountTypes: ['Cent', 'Standard', 'ECN', 'Crypto'],
    notes: 'Cent account good for micro capital; ECN for tighter spreads.',
  },
  {
    key: 'avatrade',
    name: 'AvaTrade',
    aliases: ['avatrade', 'ava trade'],
    regulators: ['CBI', 'ASIC', 'FSCA', 'FSA_SC'],
    website:    'https://www.avatrade.com/',
    help:       'https://www.avatrade.com/about-us/contact-us',
    accountTypes: ['Standard', 'AvaOptions'],
    notes: 'Regulated across multiple major jurisdictions; offers fixed and floating spread options.',
  },
  {
    key: 'tickmill',
    name: 'Tickmill',
    aliases: ['tickmill'],
    regulators: ['FCA', 'CySEC', 'FSCA', 'FSA_SC', 'LFSA'],
    website:    'https://www.tickmill.com/',
    help:       'https://www.tickmill.com/contact',
    accountTypes: ['Classic', 'Pro', 'VIP'],
    notes: 'Pro/VIP accounts offer raw spreads + commission; Classic is commission-free.',
  },
  {
    key: 'fpmarkets',
    name: 'FP Markets',
    aliases: ['fp markets', 'fpmarkets', 'fp-markets'],
    regulators: ['ASIC', 'CySEC'],
    website:    'https://www.fpmarkets.com/',
    help:       'https://www.fpmarkets.com/support/',
    accountTypes: ['Standard', 'Raw'],
    notes: 'Raw account offers institutional-grade spreads + commission; MT4/MT5/cTrader available.',
  },
];

// ── HELPERS (used by the AI engine — no need to edit) ────────────────────────

export function listBrokerNames() {
  return BROKERS.map(b => b.name);
}

export function findBroker(text) {
  const lower = (text || '').toLowerCase();
  return BROKERS.find(b => b.aliases.some(a => lower.includes(a))) || null;
}

export function brokerRegulatorLines(broker) {
  return broker.regulators
    .map(code => {
      const r = REGULATORS[code];
      return r ? `- **${r.name}** — verify on the official register: ${r.verify}` : null;
    })
    .filter(Boolean);
}
