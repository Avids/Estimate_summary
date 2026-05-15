// WBS Category Headers - Order matters for display
export const WBS_CATEGORIES = [
  'FEEDERS & MAJOR RACEWAY',
  'BRANCH WIRING & CONDUITS',
  'JUNCTION BOXES & ENCLOSURES',
  'RACEWAYS (TRAYS & LADDER)',
  'SUPPORTS & FASTENERS',
  'GROUNDING & BONDING',
  'DISTRIBUTION',
  'LIGHTING & CONTROLS',
  'POWER SYSTEMS & DEVICES',
  'TEST & COMMISSIONING',
  'CIVIL & SITE WORKS',
  'GENERAL'
];

// System Keyword Mappings - Order dictates priority during ingestion
export const SYSTEM_MAPPINGS: { category: string; keywords: string[] }[] = [
  {
    category: 'JUNCTION BOXES & ENCLOSURES',
    keywords: ['NEMA', 'Pull Box', 'Trough', 'Splitter', 'Enclosure']
  },
  {
    category: 'RACEWAYS (TRAYS & LADDER)',
    keywords: ['Tray', 'Ladder', 'Wireway', 'Basket', 'J-Hook']
  },
  {
    category: 'SUPPORTS & FASTENERS',
    keywords: ['Threaded Rod', 'Anchor', 'Spring Nut', 'Washer', 'Bolt', 'T-Rod']
  },
  {
    category: 'GROUNDING & BONDING',
    keywords: ['Ground', 'Bond', 'Copper', 'Bare', 'Lug', 'Cadweld', 'Rod']
  },
  {
    category: 'DISTRIBUTION',
    keywords: ['Panel', 'Breaker', 'Transformer', 'Switchgear', 'Disconnect']
  },
  {
    category: 'LIGHTING & CONTROLS',
    keywords: ['Fixture', 'LED', 'Dimmer', 'Sensor', 'Switch', 'Driver']
  },
  {
    category: 'POWER SYSTEMS & DEVICES',
    keywords: ['Receptacle', 'Outlet', 'Plug', 'Motor', 'Plaster Ring', 'Cover Plate', 'Plate', 'Decora']
  },
  {
    category: 'TEST & COMMISSIONING',
    keywords: ['Test', 'Megger', 'Verification', 'Label', 'Identification']
  },
  {
    category: 'CIVIL & SITE WORKS',
    keywords: ['Civil', 'Trench', 'Coring', 'Grout', 'Scanning', 'Excavation']
  },
  {
    category: 'GENERAL',
    keywords: ['Premium', 'OT', 'Shift', 'Mobilization', 'Cleanup', 'Consumable']
  }
];

// Feeder vs Branch Sizing Lists
export const FEEDER_CONDUIT_SIZES = ['1 1/2"', '1-1/2"', '1.5"', '2"', '2 1/2"', '2-1/2"', '2.5"', '3"', '3 1/2"', '3-1/2"', '3.5"', '4"', '5"', '6"'];
export const FEEDER_WIRE_SIZES = ['#4', '#3', '#2', '#1', '1/0', '2/0', '3/0', '4/0'];
export const FEEDER_MCM_SIZES = ['250', '300', '350', '400', '500', '600', '700', '750', '800', '900', '1000'];

export const BRANCH_CONDUIT_SIZES = ['1/2"', '0.5"', '3/4"', '0.75"', '1"', '1 1/4"', '1-1/4"', '1.25"'];
export const BRANCH_WIRE_SIZES = ['#14', '#12', '#10', '#8', '#6'];

export const BRANCH_ROUGH_IN_BOXES = ['4in.sq', '4x4', 'octagon', 'oct', '1104', 'handy box', 'device box', '1110'];

// Specific keyword words that MUST be matched as exact word boundaries to prevent false positives (e.g. 'plate' vs 'plated')
export const WORD_BOUNDARY_KEYWORDS = ['fa', '105', 'led', 'ot', 'lug', 'rod', 'bond', 'bus', 'jb', 'plate', 'oct'];
