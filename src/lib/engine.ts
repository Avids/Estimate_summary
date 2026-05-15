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

import { 
  WBS_CATEGORIES, 
  SYSTEM_MAPPINGS, 
  FEEDER_CONDUIT_SIZES, 
  FEEDER_WIRE_SIZES, 
  FEEDER_MCM_SIZES, 
  BRANCH_CONDUIT_SIZES, 
  BRANCH_WIRE_SIZES, 
  WORD_BOUNDARY_KEYWORDS 
} from './mappings';

export { WBS_CATEGORIES };


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

  const isWireConduitOrFitting = /conduit|wire|teck|emt|grc|pvc|ent|hdpe|lt|t90|rw90|rwu90|conn|coupling|cplg|elbow|bushing|clamp|cd1b/i.test(cleanDesc);
  if (isWireConduitOrFitting) {
    const normDesc = cleanDesc.replace(/in\./gi, '"').replace(/in\b/gi, '"').replace(/\s+"/g, '"').replace(/awg/gi, '');
    
    const matchConduitSize = (sizes: string[], text: string) => {
      return sizes.some(size => {
        const escaped = size.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Preceding char must not be digit, dot, or slash (to prevent 4" matching 3/4")
        const regex = new RegExp(`(^|[^\\d/.])` + escaped, 'i');
        return regex.test(text);
      });
    };

    const matchWireSize = (sizes: string[], text: string) => {
      return sizes.some(size => {
        const escaped = size.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Wire sizes end in digit, use \b to ensure it's a word boundary
        // Preceding char must not be digit (to prevent #1 matching #10)
        const regex = new RegExp(`(^|[^\\d])` + escaped + `\\b`, 'i');
        return regex.test(text);
      });
    };

    const hasFeederConduit = matchConduitSize(FEEDER_CONDUIT_SIZES, normDesc);
    const hasFeederWire = matchWireSize(FEEDER_WIRE_SIZES, normDesc) || 
                          FEEDER_MCM_SIZES.some(s => new RegExp(`\\b${s}\\b`).test(normDesc));
    
    if (hasFeederConduit || hasFeederWire) {
      return 'FEEDERS & MAJOR RACEWAY';
    }

    const hasBranchConduit = matchConduitSize(BRANCH_CONDUIT_SIZES, normDesc);
    const hasBranchWire = matchWireSize(BRANCH_WIRE_SIZES, normDesc);

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
      if (WORD_BOUNDARY_KEYWORDS.includes(cleanKw)) {
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
