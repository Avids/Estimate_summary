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
  'TEST & COMMISSIONING',
  'FIRE ALARM',
  'COMMUNICATION',
  'SECURITY',
  'LIGHTING & CONTROLS',
  'DISTRIBUTION',
  'POWER SYSTEMS',
  'BRANCH WIRING'
];

export const SYSTEM_MAPPINGS: { category: string; keywords: string[] }[] = [
  {
    category: 'TEST & COMMISSIONING',
    keywords: ['Test', 'Megger', 'Verification', 'Commissioning', 'Certify', 'Hi-Pot', 'Label']
  },
  {
    category: 'FIRE ALARM',
    keywords: ['FA', 'Smoke', 'Heat', 'Strobe', 'Pull Station', 'FACP', '105']
  },
  {
    category: 'COMMUNICATION',
    keywords: ['Data', 'Cat6', 'Fiber', 'Rack', 'Patch', 'Telecom', 'WiFi']
  },
  {
    category: 'SECURITY',
    keywords: ['CCTV', 'Camera', 'Access', 'Card Reader', 'Motion', 'DPS', 'Mag']
  },
  {
    category: 'LIGHTING & CONTROLS',
    keywords: ['Fixture', 'LED', 'Dimmer', 'Occupancy', 'Sensor', 'Switch', 'Relay', 'Driver']
  },
  {
    category: 'DISTRIBUTION',
    keywords: ['Panel', 'Breaker', 'Transformer', 'Switchgear', 'Bus', 'Disconnect', 'Lugs']
  },
  {
    category: 'POWER SYSTEMS',
    keywords: ['Receptacle', 'Outlet', 'Plug', 'Motor', 'Splitter']
  },
  {
    category: 'BRANCH WIRING',
    keywords: ['EMT', 'BX', 'RW90', 'AC90', 'Conduit', 'Wire', 'CONN', 'POLYTWINE']
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

  // 2. Specific hardware overrides
  if (cleanDesc.includes('disconnect switch')) {
    return 'DISTRIBUTION';
  }
  if (cleanDesc.includes('dimmer') || cleanDesc.includes('toggle switch')) {
    return 'LIGHTING & CONTROLS';
  }

  // 3. Hierarchy priority scan
  // Words in descriptions might be separated by spaces or hyphens
  for (const mapping of SYSTEM_MAPPINGS) {
    for (const kw of mapping.keywords) {
      const cleanKw = kw.toLowerCase();
      // Match keyword as a word boundary or exact inclusion
      // e.g. "FA" should match word boundary so it doesn't match "FACP" or "FACP" matches first.
      if (cleanKw === 'fa' || cleanKw === '105' || cleanKw === 'led' || cleanKw === 'bx') {
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
