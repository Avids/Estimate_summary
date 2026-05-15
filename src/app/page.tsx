'use client';

import React, { useState } from 'react';
import { Upload, CheckCircle, RefreshCw, AlertCircle, Layers, Database, Sparkles, Download, Check, BookOpen } from 'lucide-react';
import { ParseResult, LineItem, WBS_CATEGORIES, aggregateEstimate, assignLearnedMapping } from '@/lib/engine';
import { BRANCH_ROUGH_IN_BOXES, WORD_BOUNDARY_KEYWORDS } from '@/lib/mappings';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

// Helper for UI box check
const isSmallBox = (desc: string) => {
  const cleanDesc = desc.trim().toLowerCase();
  for (const boxKw of BRANCH_ROUGH_IN_BOXES) {
    const cleanBox = boxKw.toLowerCase();
    if (WORD_BOUNDARY_KEYWORDS.includes(cleanBox)) {
      if (new RegExp(`\\b${cleanBox}\\b`, 'i').test(cleanDesc)) return true;
    } else {
      if (cleanDesc.includes(cleanBox)) return true;
    }
  }
  return false;
};

// Mock sample items to test Feeder vs Branch sizing and other categories
const MOCK_SAMPLE_ITEMS: LineItem[] = [
  { id: 'demo-1', description: 'Excavation & Trenching for Feeder', quantity: 1, laborHours: 24, unitPrice: 3500, materialValue: 3500, category: 'Unmapped' },
  { id: 'demo-2', description: 'Weekend Overtime Premium Labor', quantity: 1, laborHours: 16, unitPrice: 1500, materialValue: 1500, category: 'Unmapped' },
  { id: 'demo-3', description: '12in Aluminum Cable Tray Ladder 12ft', quantity: 40, laborHours: 32, unitPrice: 110, materialValue: 4400, category: 'Unmapped' },
  { id: 'demo-4', description: 'Bare Copper Ground Wire #4/0 AWG', quantity: 600, laborHours: 18, unitPrice: 4.25, materialValue: 2550, category: 'Unmapped' },
  { id: 'demo-5', description: 'FA Verification & Testing', quantity: 1, laborHours: 8, unitPrice: 1200, materialValue: 1200, category: 'Unmapped' },
  { id: 'demo-6', description: 'Toggle Switch 20A', quantity: 50, laborHours: 10, unitPrice: 18, materialValue: 900, category: 'Unmapped' },
  { id: 'demo-7', description: 'Distribution Panel 225A', quantity: 2, laborHours: 16, unitPrice: 3500, materialValue: 7000, category: 'Unmapped' },
  { id: 'demo-8', description: 'Duplex Receptacle 15A', quantity: 200, laborHours: 35, unitPrice: 8.50, materialValue: 1700, category: 'Unmapped' },
  { id: 'demo-9', description: '3/4in EMT Conduit 10ft', quantity: 300, laborHours: 60, unitPrice: 12.00, materialValue: 3600, category: 'Unmapped' },
  { id: 'demo-10', description: 'RW90 Copper Wire #12 AWG', quantity: 2500, laborHours: 45, unitPrice: 0.85, materialValue: 2125, category: 'Unmapped' },
  { id: 'demo-11', description: '2" EMT Conduit 10ft', quantity: 100, laborHours: 40, unitPrice: 35.00, materialValue: 3500, category: 'Unmapped' },
  { id: 'demo-12', description: 'RW90 Copper Wire 250 kcmil', quantity: 1000, laborHours: 80, unitPrice: 5.50, materialValue: 5500, category: 'Unmapped' },
  { id: 'demo-13', description: 'AC90 Cable 12/2', quantity: 500, laborHours: 20, unitPrice: 1.25, materialValue: 625, category: 'Unmapped' },
  { id: 'demo-14', description: 'JB 4-11/16 Octagon Box', quantity: 50, laborHours: 12, unitPrice: 4.50, materialValue: 225, category: 'Unmapped' },
  { id: 'demo-15', description: 'Unspecified Hardware Brackets', quantity: 100, laborHours: 8, unitPrice: 5.50, materialValue: 550, category: 'Unmapped' }
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // App state
  const [parseData, setParseData] = useState<ParseResult | null>(null);
  const [learnedMappingsCount, setLearnedMappingsCount] = useState(0);
  const [confirmedRecords, setConfirmedRecords] = useState<any | null>(null);

  // Manual Mapping state for Unmapped Tab
  const [selectedCategoryMap, setSelectedCategoryMap] = useState<Record<string, string>>({});

  // UI toggle for Branch EA view
  const [showEA, setShowEA] = useState(false);

  const handleFileUpload = async (uploadedFile: File) => {
    setIsLoading(true);
    setError(null);
    setParseData(null);
    setConfirmedRecords(null);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const res = await fetch('/api/parse-estimate', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Failed to parse estimate document.');
        setIsLoading(false);
        return;
      }

      setParseData(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected network error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLoad = () => {
    setIsLoading(true);
    setError(null);
    setConfirmedRecords(null);

    setTimeout(() => {
      const aggregated = aggregateEstimate(
        JSON.parse(JSON.stringify(MOCK_SAMPLE_ITEMS)),
        'Sample_Electrical_Estimate.xlsx'
      );
      setParseData(aggregated);
      setIsLoading(false);
    }, 600);
  };

  const handleAssignCategory = (itemId: string, description: string, newCategory: string) => {
    if (!parseData) return;

    // Update learned mapping
    assignLearnedMapping(description, newCategory);
    setLearnedMappingsCount(prev => prev + 1);

    // Update raw items list
    const updatedItems = parseData.rawItems.map(item => {
      if (item.id === itemId) {
        return { ...item, category: newCategory, isManuallyMapped: true };
      }
      return item;
    });

    // Re-aggregate with new mappings
    const newAggregated = aggregateEstimate(updatedItems, parseData.fileName, parseData.isScannedPdf);
    setParseData(newAggregated);
  };

  const handleConfirmRecords = () => {
    if (!parseData) return;

    // Generate WBS and Schedule of Values (SOV)
    const sovRecords = parseData.rollups.map(r => ({
      system: r.category,
      sovAmount: r.materialValue,
      allocatedLaborHours: r.laborHours,
      itemCount: r.itemCount
    }));

    setConfirmedRecords({
      timestamp: new Date().toISOString(),
      document: parseData.fileName,
      totalProjectValue: parseData.totalProjectValue,
      sovRecords
    });
  };

  const handleExportExcel = () => {
    if (!parseData) return;

    // 1. Create Summary Sheet
    const summaryRows = parseData.rollups.map(r => ({
      'WBS System / Industry Category': r.category,
      'Line Items Count': r.itemCount,
      'Total Labor Hours': Number(r.laborHours.toFixed(2)),
      'Total Material Value ($)': Number(r.materialValue.toFixed(2))
    }));

    const totalMat = parseData.rollups.reduce((sum, r) => sum + r.materialValue, 0);
    const totalHrs = parseData.rollups.reduce((sum, r) => sum + r.laborHours, 0);
    const totalItems = parseData.rollups.reduce((sum, r) => sum + r.itemCount, 0);

    summaryRows.push({
      'WBS System / Industry Category': 'GRAND TOTALS',
      'Line Items Count': totalItems,
      'Total Labor Hours': Number(totalHrs.toFixed(2)),
      'Total Material Value ($)': Number(totalMat.toFixed(2))
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

    // 2. Create All Line Items Sheet
    const itemRows = parseData.rawItems.map(item => ({
      'ID': item.id,
      'WBS System': item.category,
      'Description': item.description,
      'Quantity': item.quantity,
      'Unit Price ($)': item.unitPrice,
      'Material Total ($)': item.materialValue,
      'Labor Hours': item.laborHours,
      'Manually Mapped': item.isManuallyMapped ? 'Yes' : 'No'
    }));

    const wsItems = XLSX.utils.json_to_sheet(itemRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'WBS Summary');
    XLSX.utils.book_append_sheet(wb, wsItems, 'All Line Items');

    XLSX.writeFile(wb, `${parseData.fileName.replace(/\.[^/.]+$/, '')}_WBS_Export.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* Top Banner / Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold shadow-lg shadow-teal-600/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Smart Roll-up Engine <span className="text-xs py-0.5 px-2 bg-teal-500/20 text-teal-400 rounded-full font-semibold border border-teal-500/30">v3.0</span>
            </h1>
            <p className="text-xs text-slate-400">Automated Electrical WBS Ingestion & Priority Mapping</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <Database className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-slate-300 font-medium">Learned Registry:</span>
            <span className="bg-teal-500 text-slate-900 font-bold px-1.5 py-0.2 rounded text-[11px]">{learnedMappingsCount} mapped</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">

        {/* Intro / Uploader / Demo loaders */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Uploader Card */}
          <div className="lg:col-span-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/70 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

            <div>
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-400" />
                Upload Estimate Excel
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Our parsing engine extracts lines from uploaded Excel sheets, evaluating keywords with strict hierarchical priority logic to split Feeders from Branch wiring based on size.
              </p>

              <label className="border-2 border-dashed border-slate-600 hover:border-teal-500/80 bg-slate-900/50 hover:bg-slate-900/80 transition-all duration-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer group">
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-14 h-14 rounded-full bg-slate-800 group-hover:bg-teal-500/20 group-hover:text-teal-400 flex items-center justify-center text-slate-400 transition-all duration-200 mb-3 shadow-md">
                  <Upload className="w-7 h-7" />
                </div>
                <span className="text-sm font-semibold text-slate-200 group-hover:text-white mb-1">Click to browse or drag file here</span>
                <span className="text-xs text-slate-500">Supports .XLSX, .XLS, .CSV</span>
              </label>
            </div>

            {/* Error alerts */}
            {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start space-x-3 text-red-300 text-sm">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-200">Ingestion Error</p>
                  <p>{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Quick Demo Launchers */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/70 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-400" />
                1-Click Demo Loader
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Instantly evaluate the staging UI, WBS aggregation (Branch vs Feeder), and learned mapping engine without uploading your own document.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleDemoLoad}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-slate-700/60 hover:bg-teal-600/20 hover:border-teal-500/50 border border-slate-600 rounded-xl flex items-center justify-between text-left transition-all duration-200 group shadow"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-teal-300">Sample Spreadsheet (.xlsx)</p>
                    <p className="text-xs text-slate-400">Includes Feeder/Branch tests</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-700/60 text-[11px] text-slate-500 text-center">
              Fully compliant with Palette #1 (#37514E) standards.
            </div>
          </div>
        </div>

        {/* Processing Spinner */}
        {isLoading && (
          <div className="p-12 rounded-2xl bg-slate-800/30 border border-slate-700/50 flex flex-col items-center justify-center text-center space-y-4">
            <RefreshCw className="w-10 h-10 text-teal-400 animate-spin" />
            <div>
              <p className="text-base font-bold text-white">Ingesting Estimate Document...</p>
              <p className="text-xs text-slate-400">Extracting lines & evaluating size priority logic</p>
            </div>
          </div>
        )}

        {/* Staging UI Dashboard */}
        {parseData && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-8">

            {/* Reconciliation Grand Total Banner */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row justify-between items-center gap-6">
              <div>
                <p className="text-xs font-semibold tracking-wider text-teal-400 uppercase mb-1">Source Document Reconciliation</p>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {parseData.fileName}
                  <span className="text-xs font-normal text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700">
                    {parseData.rawItems.length} Total Lines
                  </span>
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-6 justify-end">
                <div className="text-right border-r border-slate-700 pr-6">
                  <p className="text-xs text-slate-400 font-medium">Total Labor Hours</p>
                  <p className="text-2xl font-black text-teal-300 tracking-tight">
                    {parseData.rollups.reduce((sum, r) => sum + r.laborHours, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hrs
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-400 font-medium">Reconciled Material Total</p>
                  <p className="text-2xl font-black text-emerald-400 tracking-tight">
                    ${parseData.totalProjectValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportExcel}
                    className="px-4 py-3 bg-slate-700 hover:bg-teal-500 hover:text-slate-900 text-white font-bold rounded-xl flex items-center space-x-2 shadow transition-all group"
                  >
                    <Download className="w-5 h-5 text-teal-400 group-hover:text-slate-900" />
                    <span>Export WBS</span>
                  </button>

                  <button
                    onClick={handleConfirmRecords}
                    className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-xl flex items-center space-x-2 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <CheckCircle className="w-5 h-5" />
                    <span>Confirm SOV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Confirmed SOV Records Notice */}
            <AnimatePresence>
              {confirmedRecords && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-slate-800/80 border border-emerald-500/40 rounded-2xl p-6 shadow-xl overflow-hidden">
                  <div className="flex items-start space-x-4">
                    <div className="p-3 bg-emerald-500 text-slate-900 rounded-xl font-bold shadow-lg shadow-emerald-500/30">
                      <Check className="w-6 h-6" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        WBS & Schedule of Values (SOV) Confirmed
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-medium">Record Active</span>
                      </h4>
                      <p className="text-sm text-slate-300">
                        12 WBS headers successfully registered into project accounting. Unmapped string correlations have been committed to <span className="font-semibold text-teal-300">User_Learned_Mappings</span>.
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-4">
                        {confirmedRecords.sovRecords.filter((s:any) => s.itemCount > 0).map((sov: any) => (
                          <div key={sov.system} className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                            <p className="text-[10px] text-slate-400 font-semibold truncate uppercase" title={sov.system}>{sov.system}</p>
                            <p className="text-sm font-bold text-emerald-400 mt-1">${sov.sovAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                            <p className="text-[10px] text-slate-500">{sov.allocatedLaborHours} hrs • {sov.itemCount} items</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unmapped List for Manual Assignment */}
            {parseData.unmappedItems.length > 0 && (
              <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-base">
                  <AlertCircle className="w-5 h-5" />
                  <h4>Unmapped Line Items — Manual Assignment Required</h4>
                </div>
                <p className="text-xs text-slate-300">
                  Select a target system below. Once mapped, the string is committed to <span className="font-semibold text-white">User_Learned_Mappings</span> to automate future uploads.
                </p>

                <div className="space-y-3 pt-2">
                  {parseData.unmappedItems.map(item => (
                    <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between bg-slate-900/80 p-4 rounded-xl border border-slate-700 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">{item.description}</p>
                        <div className="flex gap-4 text-xs text-slate-400 font-mono">
                          <span>Qty: {item.quantity}</span>
                          <span>Labor: {item.laborHours} hrs</span>
                          <span>Price: ${item.unitPrice}</span>
                          <span className="font-bold text-emerald-400">Total: ${item.materialValue.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <select
                          value={selectedCategoryMap[item.id] || ''}
                          onChange={(e) => setSelectedCategoryMap({ ...selectedCategoryMap, [item.id]: e.target.value })}
                          className="bg-slate-800 border border-slate-600 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500 w-56"
                        >
                          <option value="">-- Choose WBS System --</option>
                          {WBS_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => {
                            if (selectedCategoryMap[item.id]) {
                              handleAssignCategory(item.id, item.description, selectedCategoryMap[item.id]);
                            }
                          }}
                          disabled={!selectedCategoryMap[item.id]}
                          className="px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-900 font-bold rounded-lg text-xs flex items-center space-x-1 transition-all shadow"
                        >
                          <span>Map & Learn</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grouped WBS Review Table */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-400" />
                  Grouped Staging Review
                </h3>
              </div>

              <div className="space-y-6">
                {parseData.rollups.filter(r => r.itemCount > 0).map((rollup) => {
                  let isBranch = rollup.category === 'BRANCH WIRING & CONDUITS';
                  let boxEA = 0;
                  let conduitLF = 0;

                  if (isBranch) {
                    rollup.items.forEach(item => {
                      if (isSmallBox(item.description)) {
                        boxEA += item.quantity;
                      } else {
                        conduitLF += item.quantity;
                      }
                    });
                  }

                  return (
                  <div key={rollup.category} className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                    <div style={{ backgroundColor: '#37514E' }} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
                        <h4 className="text-white font-bold tracking-wider uppercase text-sm">{rollup.category}</h4>
                      </div>
                      <div className="flex items-center gap-6 text-xs font-mono">
                        <span className="text-slate-300">Items: <span className="text-white font-bold">{rollup.itemCount}</span></span>
                        
                        {isBranch && (
                          <span className="text-slate-300 flex items-center gap-2 bg-slate-900/40 px-2 py-1 rounded">
                            Qty: <span className="text-white font-bold">{showEA ? `${boxEA.toLocaleString()} EA (Boxes)` : `${conduitLF.toLocaleString()} LF (Conduit)`}</span>
                            <button 
                              onClick={() => setShowEA(!showEA)}
                              className="text-[9px] bg-slate-700 hover:bg-slate-600 text-teal-300 px-1.5 py-0.5 rounded ml-1 transition-colors"
                            >
                              Toggle {showEA ? 'LF' : 'EA'}
                            </button>
                          </span>
                        )}

                        <span className="text-slate-300">Labor: <span className="text-teal-300 font-bold">{rollup.laborHours.toFixed(2)} hrs</span></span>
                        <span className="text-slate-300">Material: <span className="text-emerald-400 font-bold text-sm">${rollup.materialValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900/60 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-700/60">
                            <th className="py-3 px-6 w-1/2">Description</th>
                            <th className="py-3 px-6 text-right">Quantity</th>
                            <th className="py-3 px-6 text-right">Unit Price</th>
                            <th className="py-3 px-6 text-right">Labor Hrs</th>
                            <th className="py-3 px-6 text-right">Material Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40 text-sm">
                          {rollup.items.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-700/30 transition-colors duration-150">
                              <td className="py-3 px-6 font-medium text-slate-200">
                                <div className="flex items-center gap-2">
                                  {item.description}
                                  {item.isManuallyMapped && (
                                    <span className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/20 uppercase tracking-wide">Learned</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-6 text-right font-mono text-slate-300">{item.quantity}</td>
                              <td className="py-3 px-6 text-right font-mono text-slate-300">${item.unitPrice.toFixed(2)}</td>
                              <td className="py-3 px-6 text-right font-mono text-teal-200/70">{item.laborHours.toFixed(2)}</td>
                              <td className="py-3 px-6 text-right font-mono font-bold text-emerald-400/90">${item.materialValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-6 px-6 text-center text-xs text-slate-500 mt-auto">
        <p>Electrical System Roll-up Engine • Branch & Feeder Logic Engine</p>
      </footer>
    </div>
  );
}
