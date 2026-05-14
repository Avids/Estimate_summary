export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  laborHours: number;
  unitPrice: number;
  materialValue: number;
  category: string;
  isManuallyMapped?: boolean;
}

export interface SystemRollup {
  category: string;
  materialValue: number;
  laborHours: number;
  itemCount: number;
  items: LineItem[];
}

export interface ParseResult {
  fileName: string;
  totalProjectValue: number;
  rollups: SystemRollup[];
  unmappedItems: LineItem[];
  rawItems: LineItem[];
  isScannedPdf?: boolean;
}

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

export const SYSTEM_MAPPINGS: { category: string; keywords: string[] }[] = [
  {
    category: 'JUNCTION BOXES & ENCLOSURES',
    keywords: ['JB', 'NEMA', 'Pull Box', 'Oct Box', '4in.SQ', 'Enclosure', 'Splitter']
  },
  {
    category: 'RACEWAYS (TRAYS & LADDER)',
    keywords: ['Tray', 'Ladder', 'Wireway', 'Basket', 'J-Hook']
  },
  {
    category: 'SUPPORTS & FASTENERS',
    keywords: ['Strut', 'Hanger', 'Clamp', 'Rod', 'T-Rod', 'Anchor', 'Nut', 'Bolt', 'Jack Chain', 'S-Hook']
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
    keywords: ['Receptacle', 'Outlet', 'Plug', 'Motor', 'Device Box', 'Plaster Ring', 'Cover Plate']
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

// In-memory learned mapping registry (in a production Vercel app, this can be backed by Vercel KV/Postgres)
let userLearnedMappings: Record<string, string> = {};

export function assignLearnedMapping(description: string, category: string) {
  userLearnedMappings[description.trim().toLowerCase()] = category;
}

export function getLearnedMappings() {
  return userLearnedMappings;
}

export function classifyLineItem(description: string): string {
  const cleanDesc = description.trim().toLowerCase();

  // 1. Check User Learned Mappings first
  if (userLearnedMappings[cleanDesc]) {
    return userLearnedMappings[cleanDesc];
  }

  // 2. Branch vs Feeder priority logic
  const isBX = /\bbx\b/i.test(cleanDesc) || /\bac90\b/i.test(cleanDesc);
  if (isBX) return 'BRANCH WIRING & CONDUITS';

  const isWireOrConduit = /conduit|wire|teck|emt|grc|pvc|ent|hdpe|lt|t90|rw90|rwu90|conn|coupling|elbow|bushing/i.test(cleanDesc);
  if (isWireOrConduit) {
    const normDesc = cleanDesc.replace(/in\b/gi, '"').replace(/\s+"/g, '"').replace(/awg/gi, '');
    
    const feederConduitSizes = ['1 1/2"', '1-1/2"', '1.5"', '2"', '2 1/2"', '2-1/2"', '2.5"', '3"', '3 1/2"', '3-1/2"', '3.5"', '4"', '5"', '6"'];
    const feederWireSizes = ['#4', '#3', '#2', '#1', '1/0', '2/0', '3/0', '4/0'];
    const feederMCM = ['250', '300', '350', '400', '500', '600', '700', '750', '800', '900', '1000'];

    const hasFeederConduit = feederConduitSizes.some(s => normDesc.includes(s.toLowerCase()));
    const hasFeederWire = feederWireSizes.some(s => normDesc.includes(s.toLowerCase())) || 
                          feederMCM.some(s => new RegExp(`\\b${s}\\b`).test(normDesc));
    
    if (hasFeederConduit || hasFeederWire) {
      return 'FEEDERS & MAJOR RACEWAY';
    }

    const branchConduitSizes = ['1/2"', '0.5"', '3/4"', '0.75"', '1"', '1 1/4"', '1-1/4"', '1.25"'];
    const branchWireSizes = ['#14', '#12', '#10', '#8', '#6'];

    const hasBranchConduit = branchConduitSizes.some(s => normDesc.includes(s.toLowerCase()));
    const hasBranchWire = branchWireSizes.some(s => normDesc.includes(s.toLowerCase()));

    if (hasBranchConduit || hasBranchWire) {
      return 'BRANCH WIRING & CONDUITS';
    }

    // Default to branch if it contains wire/conduit keywords but no explicit size matched
    return 'BRANCH WIRING & CONDUITS';
  }

  // 3. Hierarchy priority scan
  for (const mapping of SYSTEM_MAPPINGS) {
    for (const kw of mapping.keywords) {
      const cleanKw = kw.toLowerCase();
      // Match short keywords as word boundaries so they don't trigger false positives inside other words
      if (['fa', '105', 'led', 'ot', 'lug', 'rod', 'bond', 'bus', 'jb'].includes(cleanKw)) {
        const regex = new RegExp(`\\b${cleanKw}\\b`, 'i');
        if (regex.test(cleanDesc)) {
          return mapping.category;
        }
      } else {
        if (cleanDesc.includes(cleanKw)) {
          return mapping.category;
        }
      }
    }
  }

  // 4. Default to Unmapped
  return 'Unmapped';
}

export function aggregateEstimate(items: LineItem[], fileName: string, isScannedPdf = false): ParseResult {
  const rollupsMap: Record<string, SystemRollup> = {};

  // Initialize all 8 WBS headers
  for (const cat of WBS_CATEGORIES) {
    rollupsMap[cat] = {
      category: cat,
      materialValue: 0,
      laborHours: 0,
      itemCount: 0,
      items: []
    };
  }

  const unmappedItems: LineItem[] = [];
  let totalProjectValue = 0;

  for (const item of items) {
    // Re-classify just in case learned mappings were updated
    const category = item.isManuallyMapped ? item.category : classifyLineItem(item.description);
    item.category = category;

    // Ensure material value calculation is exact
    const itemTotal = Number(item.materialValue.toFixed(2));
    totalProjectValue += itemTotal;

    if (category === 'Unmapped') {
      unmappedItems.push(item);
    } else {
      if (!rollupsMap[category]) {
        rollupsMap[category] = {
          category: category,
          materialValue: 0,
          laborHours: 0,
          itemCount: 0,
          items: []
        };
      }
      rollupsMap[category].items.push(item);
      rollupsMap[category].materialValue += itemTotal;
      rollupsMap[category].laborHours += item.laborHours;
      rollupsMap[category].itemCount += 1;
    }
  }

  // Round rolled up values to avoid floating point drift
  totalProjectValue = Number(totalProjectValue.toFixed(2));
  const rollups: SystemRollup[] = Object.values(rollupsMap).map(r => ({
    ...r,
    materialValue: Number(r.materialValue.toFixed(2)),
    laborHours: Number(r.laborHours.toFixed(2))
  }));

  return {
    fileName,
    totalProjectValue,
    rollups,
    unmappedItems,
    rawItems: items,
    isScannedPdf
  };
}
