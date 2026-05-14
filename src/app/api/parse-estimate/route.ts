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

      let idCounter = 1;
      for (const row of rows) {
        // Look for common headers in estimate spreadsheets
        const description = row['Description'] || row['Item'] || row['Material Description'] || row['Name'] || row['Item Description'] || '';
        if (!description || typeof description !== 'string' || description.trim().length === 0) continue;

        const quantity = parseFloat(row['Qty'] || row['Quantity'] || row['Count'] || 0) || 0;
        const laborHours = parseFloat(row['Labor'] || row['Labor Hours'] || row['Hours'] || row['Hrs'] || 0) || 0;
        const unitPrice = parseFloat(row['Price'] || row['Unit Price'] || row['Rate'] || row['Cost'] || 0) || 0;
        
        let materialValue = parseFloat(row['Total'] || row['Material Total'] || row['Material Value'] || row['Ext Price'] || 0) || 0;
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

      const lines = pdfText.split('\n');
      let idCounter = 1;

      // Helper to check if a string is a numeric value (allowing negative sign, commas, and decimals)
      const isNumeric = (str: string) => {
        const clean = str.trim().replace(/,/g, '');
        return !isNaN(parseFloat(clean)) && isFinite(Number(clean));
      };

      const parseNum = (str: string) => parseFloat(str.trim().replace(/,/g, '')) || 0;

      // Helper to check if a string is a unit letter C, M, E
      const isUnitLetter = (str: string) => {
        const clean = str.trim().toUpperCase();
        return clean === 'C' || clean === 'M' || clean === 'E';
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

      // 2. Vertical Stream Fallback (If PDF table extracted column-by-column / cell-by-cell vertically)
      if (lineItems.length === 0) {
        const cleanTokens = lines.map(l => l.trim()).filter(l => l.length > 0);
        let lastRowEnd = 0;

        for (let i = 0; i < cleanTokens.length - 6; i++) {
          // Look for Equinix 7-column pattern: [Qty] [Price] [Unit] [TotalMat] [Labor] [Unit] [TotalHrs]
          if (
            isNumeric(cleanTokens[i]) &&
            isNumeric(cleanTokens[i + 1]) &&
            isUnitLetter(cleanTokens[i + 2]) &&
            isNumeric(cleanTokens[i + 3]) &&
            isNumeric(cleanTokens[i + 4]) &&
            isUnitLetter(cleanTokens[i + 5]) &&
            isNumeric(cleanTokens[i + 6])
          ) {
            // Found a valid vertical row!
            // Gather description tokens between lastRowEnd and i
            const descTokens = cleanTokens.slice(lastRowEnd, i).filter(t => !t.toLowerCase().includes('project name') && !t.toLowerCase().includes('page') && !t.toLowerCase().includes('description') && !t.toLowerCase().includes('totals'));
            
            // Remove standalone item number if present at start (e.g. "1", "2")
            if (descTokens.length > 1 && isNumeric(descTokens[0])) {
              descTokens.shift();
            }

            const description = descTokens.join(' ');

            if (description.length > 2 && !description.toLowerCase().includes('totals')) {
              const qty = parseNum(cleanTokens[i]);
              const price = parseNum(cleanTokens[i + 1]);
              const totalMat = parseNum(cleanTokens[i + 3]);
              const labor = parseNum(cleanTokens[i + 6]);

              lineItems.push({
                id: `pdf-v-${idCounter++}`,
                description,
                quantity: qty,
                laborHours: Number(labor.toFixed(2)),
                unitPrice: Math.abs(price),
                materialValue: totalMat,
                category: 'Unmapped'
              });
            }

            // Move pointer past this row
            lastRowEnd = i + 7;
            i += 6;
          }
        }

        // 3. Fallback for standard 4-column numeric vertical streams without unit letters
        if (lineItems.length === 0) {
          lastRowEnd = 0;
          for (let i = 0; i < cleanTokens.length - 3; i++) {
            if (
              isNumeric(cleanTokens[i]) &&
              isNumeric(cleanTokens[i + 1]) &&
              isNumeric(cleanTokens[i + 2]) &&
              isNumeric(cleanTokens[i + 3])
            ) {
              const descTokens = cleanTokens.slice(lastRowEnd, i).filter(t => !t.toLowerCase().includes('project') && !t.toLowerCase().includes('page') && !t.toLowerCase().includes('description') && !t.toLowerCase().includes('totals'));
              if (descTokens.length > 1 && isNumeric(descTokens[0])) {
                descTokens.shift();
              }

              const description = descTokens.join(' ');
              if (description.length > 2 && !description.toLowerCase().includes('totals')) {
                const qty = parseNum(cleanTokens[i]);
                const labor = parseNum(cleanTokens[i + 1]);
                const price = parseNum(cleanTokens[i + 2]);
                const totalMat = parseNum(cleanTokens[i + 3]);

                lineItems.push({
                  id: `pdf-v4-${idCounter++}`,
                  description,
                  quantity: qty,
                  laborHours: Number(labor.toFixed(2)),
                  unitPrice: Math.abs(price),
                  materialValue: totalMat,
                  category: 'Unmapped'
                });
              }

              lastRowEnd = i + 4;
              i += 3;
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
