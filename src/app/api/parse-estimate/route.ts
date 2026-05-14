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

      // Regex matching for typical estimate lines: Description ... Qty ... Labor ... Price ... Total
      // Matches descriptions followed by multiple numeric columns
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 5) continue;

        // Matches lines ending with 3 to 5 floating point/integer numbers
        // e.g., "1/2in EMT Conduit 500 0.05 1.50 750.00"
        const numbersMatch = trimmed.match(/([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/);
        
        if (numbersMatch) {
          const fullMatch = numbersMatch[0];
          const description = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
          
          if (description.length > 2 && !description.toLowerCase().includes('total') && !description.toLowerCase().includes('summary')) {
            const qty = parseFloat(numbersMatch[1].replace(/,/g, '')) || 0;
            const labor = parseFloat(numbersMatch[2].replace(/,/g, '')) || 0;
            const price = parseFloat(numbersMatch[3].replace(/,/g, '')) || 0;
            const total = parseFloat(numbersMatch[4].replace(/,/g, '')) || 0;

            lineItems.push({
              id: `pdf-${idCounter++}`,
              description,
              quantity: qty,
              laborHours: labor,
              unitPrice: price,
              materialValue: total,
              category: 'Unmapped'
            });
          }
        } else {
          // Alternative fallback pattern: Description ... Qty ... Total Price
          const altMatch = trimmed.match(/([\d,]+\.?\d*)\s+[\$\€\£]?([\d,]+\.?\d*)$/);
          if (altMatch) {
            const fullMatch = altMatch[0];
            const description = trimmed.substring(0, trimmed.indexOf(fullMatch)).trim();
            if (description.length > 2 && !description.toLowerCase().includes('total') && !description.toLowerCase().includes('summary')) {
              const qty = parseFloat(altMatch[1].replace(/,/g, '')) || 0;
              const total = parseFloat(altMatch[2].replace(/,/g, '')) || 0;

              lineItems.push({
                id: `pdf-${idCounter++}`,
                description,
                quantity: qty,
                laborHours: 0,
                unitPrice: Number((total / (qty || 1)).toFixed(2)),
                materialValue: total,
                category: 'Unmapped'
              });
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
