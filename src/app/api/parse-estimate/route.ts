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

      // Regex matching for typical estimate lines: Description ... Qty ... Price ... Total
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 5) continue;
        if (trimmed.toLowerCase().startsWith('project name') || trimmed.toLowerCase().startsWith('description')) continue;
        if (trimmed.toLowerCase().includes('totals') && trimmed.toLowerCase().startsWith('totals')) continue;

        // Pattern 1: Equinix TR-06 format (with negative numbers, comma, decimals, and Ur letters C/M/E)
        // e.g.: '1 1 1/2" EMT -600 834.68 C -5,008.08 8.70 C -52.20'
        // Groups: 1=Qty, 2=NetPrice, 3=Unit1, 4=TotalMat, 5=LaborRate, 6=Unit2, 7=TotalHrs
        const equinixMatch = trimmed.match(/(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+([A-Za-z]{1,4})\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+([A-Za-z]{1,4})\s+(-?[\d,]+\.?\d*)$/);

        // Pattern 2: Standard 4 numbers (Qty, Labor, Price, Total) without letters
        const std4Match = trimmed.match(/(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)\s+(-?[\d,]+\.?\d*)$/);

        // Pattern 3: Standard 3 numbers (Qty, Price, Total)
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
          // Strip optional leading row number (e.g., "1 ", "25 ")
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseFloat(equinixMatch[1].replace(/,/g, '')) || 0;
            price = parseFloat(equinixMatch[2].replace(/,/g, '')) || 0;
            totalMat = parseFloat(equinixMatch[4].replace(/,/g, '')) || 0;
            labor = parseFloat(equinixMatch[7].replace(/,/g, '')) || 0; // Total labor hours
            description = rawDesc;
            matched = true;
          }
        } else if (std4Match) {
          const fullMatch = std4Match[0];
          let rawDesc = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseFloat(std4Match[1].replace(/,/g, '')) || 0;
            labor = parseFloat(std4Match[2].replace(/,/g, '')) || 0;
            price = parseFloat(std4Match[3].replace(/,/g, '')) || 0;
            totalMat = parseFloat(std4Match[4].replace(/,/g, '')) || 0;
            description = rawDesc;
            matched = true;
          }
        } else if (std3Match) {
          const fullMatch = std3Match[0];
          let rawDesc = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          rawDesc = rawDesc.replace(/^\d+\s+/, '');

          if (rawDesc.length > 2 && !rawDesc.toLowerCase().includes('totals')) {
            qty = parseFloat(std3Match[1].replace(/,/g, '')) || 0;
            price = parseFloat(std3Match[2].replace(/,/g, '')) || 0;
            totalMat = parseFloat(std3Match[3].replace(/,/g, '')) || 0;
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
