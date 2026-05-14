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
    } else {
      return NextResponse.json({ error: 'Unsupported file format. Please upload Excel (.xlsx, .xls, .csv).' }, { status: 400 });
    }

    const parseResult = aggregateEstimate(lineItems, fileName, isScannedPdf);
    return NextResponse.json(parseResult);
  } catch (error: any) {
    console.error('API Parse Route Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred during parsing' }, { status: 500 });
  }
}
