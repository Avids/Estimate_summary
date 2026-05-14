import { NextRequest, NextResponse } from 'next/server';
import { aggregateEstimate, LineItem } from '@/lib/engine';
import * as XLSX from 'xlsx';

// Use dynamic runtime
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    let lineItems: LineItem[] = [];
    let isScannedPdf = false;

    // Excel Parsing
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      const cleanNum = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        const str = String(val).trim().replace(/[\$,]/g, '').replace(/[()]/g, '');
        const n = parseFloat(str);
        return isNaN(n) ? 0 : n;
      };

      let idCounter = 1;
      for (const row of rows) {
        // Look for common headers in estimate spreadsheets
        const description = row['Description'] || row['Item'] || row['Material Description'] || row['Name'] || row['Item Description'] || row['Description '] || '';
        if (!description || typeof description !== 'string' || description.trim().length === 0) continue;
        if (description.toLowerCase().includes('totals')) continue;

        const quantity = cleanNum(row['Qty'] || row['Quantity'] || row['Count'] || row['Quantity ']);
        const laborHours = cleanNum(row['Total Hours'] || row['Labor'] || row['Labor Hours'] || row['Hours'] || row['Hrs'] || row['Total Hours ']);
        const unitPrice = cleanNum(row['Net Price'] || row['Price'] || row['Unit Price'] || row['Rate'] || row['Cost'] || row['Net Price ']);
        
        let materialValue = cleanNum(row['Total Materia'] || row['Total Material'] || row['Material Total'] || row['Total'] || row['Ext Price'] || row['Material Value'] || row['Total Materia ']);
        if (materialValue === 0 && quantity > 0 && unitPrice > 0) {
          materialValue = Number((quantity * unitPrice).toFixed(2));
        }

        lineItems.push({
          id: `excel-${idCounter++}`,
          description: description.trim(),
          quantity,
          laborHours,
          unitPrice,
          materialValue,
          category: 'Unmapped'
        });
      }
    } 
    // PDF Parsing
    else if (lowerName.endsWith('.pdf')) {
      let pdfText = '';
      try {
        // Use dynamic import for pdf-parse to avoid server build bundling issues if any
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(buffer);
        pdfText = data.text;
      } catch (e: any) {
        console.error('PDF Parse Error:', e);
        return NextResponse.json({ error: 'Failed to parse PDF file. Ensure it is a valid PDF.' }, { status: 500 });
      }

      if (!pdfText || pdfText.trim().length < 50) {
        isScannedPdf = true;
        return NextResponse.json({
          error: 'Scanned PDF image detected without selectable text. Please upload the Excel version or use OCR.',
          isScannedPdf: true
        }, { status: 400 });
      }

      // Normalize all unicode dashes, en-dashes, and minus signs to standard hyphen
      let cleanPdfText = pdfText.replace(/[–—−]/g, '-');
      // Detach attached unit letters (e.g. "834.68C" -> "834.68 C", "8.70C" -> "8.70 C")
      cleanPdfText = cleanPdfText.replace(/(\d*\.?\d+)([CMEcme])\b/g, '$1 $2');
      const lines = cleanPdfText.split('\n');
      let idCounter = 1;

      const isNumeric = (str: string) => {
        if (!str) return false;
        const clean = str.trim().replace(/[\$,]/g, '').replace(/[()]/g, '');
        if (clean === '-' || clean === '') return false;
        return !isNaN(parseFloat(clean)) && isFinite(Number(clean));
      };

      const parseNum = (str: string) => {
        if (!str) return 0;
        const clean = str.trim().replace(/[\$,]/g, '').replace(/[()]/g, '');
        return parseFloat(clean) || 0;
      };

      const isUnitLetter = (str: string) => {
        if (!str) return false;
        const clean = str.trim().toUpperCase();
        return ['C', 'M', 'E', 'EA', 'FT', 'LF', 'HR', 'LOT', 'SET', 'PR', 'BAG', 'BOX', 'RL', 'MFT'].includes(clean);
      };

      // 1. Horizontal Scan
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 5) continue;
        if (trimmed.toLowerCase().startsWith('project name') || trimmed.toLowerCase().startsWith('description')) continue;
        if (trimmed.toLowerCase().includes('totals') && trimmed.toLowerCase().startsWith('totals')) continue;

        const equinixMatch = trimmed.match(/(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+([A-Za-z]{1,4})\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+([A-Za-z]{1,4})\s+(-?[\d,]+\.?\d*)$/);
        const std4Match = trimmed.match(/(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)$/);
        const std3Match = trimmed.match(/(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)$/);

        let description = '';
        let qty = 0;
        let labor = 0;
        let price = 0;
        let totalMat = 0;
        let matched = false;

        if (equinixMatch) {
          const fullMatch = equinixMatch[0];
          let rawDesc = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseNum(equinixMatch[1]);
            price = parseNum(equinixMatch[2]);
            totalMat = parseNum(equinixMatch[4]);
            labor = parseNum(equinixMatch[7]);
            description = rawDesc;
            matched = true;
          }
        } else if (std4Match) {
          const fullMatch = std4Match[0];
          let rawDesc = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseNum(std4Match[1]);
            labor = parseNum(std4Match[2]);
            price = parseNum(std4Match[3]);
            totalMat = parseNum(std4Match[4]);
            description = rawDesc;
            matched = true;
          }
        } else if (std3Match) {
          const fullMatch = std3Match[0];
          let rawDesc = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseNum(std3Match[1]);
            price = parseNum(std3Match[2]);
            totalMat = parseNum(std3Match[3]);
            description = rawDesc;
            matched = true;
          }
        }

        if (matched && description) {
          lineItems.push({
            id: `pdf-${idCounter++}`,
            description,
            quantity: qty,
            laborHours: Number(labor.toFixed(2)),
            unitPrice: Math.abs(price),
            materialValue: totalMat,
            category: 'Unmapped'
          });
        }
      }

      // 2. Absolute Ultimate Universal Sequence Scanner (Scan cleanTokens for any row ending with 3 to 5 numbers)
      if (lineItems.length === 0) {
        const cleanTokens = cleanPdfText.split(/\s+/).filter(Boolean);
        let lastRowEnd = 0;

        for (let i = 0; i < cleanTokens.length - 2; i++) {
          if (isNumeric(cleanTokens[i])) {
            // Check how many numbers follow in the next 12 tokens
            const window = cleanTokens.slice(i, i + 12);
            const numIndices: number[] = [];
            for (let j = 0; j < window.length; j++) {
              if (isNumeric(window[j])) {
                numIndices.push(i + j);
              } else if (!isUnitLetter(window[j]) && window[j].replace(/[()]/g, '').length > 2) {
                // Encountered a non-unit word. End of numeric cluster!
                break;
              }
            }

            if (numIndices.length >= 3) {
              const lastNumIndex = numIndices[numIndices.length - 1];
              // Gather description from lastRowEnd to i
              const descTokens = cleanTokens.slice(lastRowEnd, i).filter(t => 
                !t.toLowerCase().includes('project') && 
                !t.toLowerCase().includes('name') && 
                !t.toLowerCase().includes('page') && 
                !t.toLowerCase().includes('description') && 
                !t.toLowerCase().includes('totals') && 
                !t.toLowerCase().includes('quantity') && 
                !t.toLowerCase().includes('materia') && 
                !t.toLowerCase().includes('labor') && 
                !t.toLowerCase().includes('hours') && 
                !t.toLowerCase().includes('net') && 
                !t.toLowerCase().includes('price') && 
                !t.toLowerCase().includes('c02660')
              );

              if (descTokens.length > 0 && /^\d+$/.test(descTokens[0])) {
                descTokens.shift();
              }

              const description = descTokens.join(' ').trim();
              if (description.length > 1) {
                const nums = numIndices.map(idx => parseNum(cleanTokens[idx]));
                // nums array has Qty, Price, TotalMat, Labor, TotalHrs (or similar)
                let qty = nums[0];
                let price = nums[1];
                let totalMat = nums[nums.length - 3] || nums[nums.length - 2] || 0;
                let labor = nums[nums.length - 1] || 0;

                if (nums.length === 4) {
                  // Qty, Labor, Price, TotalMat
                  qty = nums[0];
                  labor = nums[1];
                  price = nums[2];
                  totalMat = nums[3];
                }

                lineItems.push({
                  id: `pdf-uni-${idCounter++}`,
                  description,
                  quantity: qty,
                  laborHours: Number(labor.toFixed(2)),
                  unitPrice: Math.abs(price),
                  materialValue: totalMat,
                  category: 'Unmapped'
                });
              }

              lastRowEnd = lastNumIndex + 1;
              i = lastNumIndex;
            }
          }
        }
      }
    } else {
      return NextResponse.json({ error: 'Unsupported file format. Please upload PDF or Excel.' }, { status: 400 });
    }

    const parseResult = aggregateEstimate(lineItems, fileName, isScannedPdf);
    return NextResponse.json(parseResult);
  } catch (error: any) {
    console.error('API Parse Route Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred during parsing' }, { status: 500 });
  }
}
