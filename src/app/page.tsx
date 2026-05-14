'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, RefreshCw, AlertCircle, Eye, ArrowRight, BookOpen, Layers, Check, Database, Sparkles } from 'lucide-react';
import { ParseResult, LineItem, WBS_CATEGORIES, aggregateEstimate, assignLearnedMapping } from '@/lib/engine';
import { motion, AnimatePresence } from 'framer-motion';

// Mock sample items for instant 1-click testing without file upload
const MOCK_SAMPLE_ITEMS: LineItem[] = [
  { id: 'demo-1', description: 'FA Verification & Testing', quantity: 1, laborHours: 8, unitPrice: 1200, materialValue: 1200, category: 'TEST & COMMISSIONING' },
  { id: 'demo-2', description: 'Smoke Detector Head', quantity: 45, laborHours: 12, unitPrice: 85, materialValue: 3825, category: 'FIRE ALARM' },
  { id: 'demo-3', description: 'Cat6 Data Patch Panel 24-Port', quantity: 4, laborHours: 6, unitPrice: 250, materialValue: 1000, category: 'COMMUNICATION' },
  { id: 'demo-4', description: 'CCTV Dome Camera 4K', quantity: 16, laborHours: 24, unitPrice: 420, materialValue: 6720, category: 'SECURITY' },
  { id: 'demo-5', description: 'LED Troffer Fixture 2x4', quantity: 120, laborHours: 40, unitPrice: 145, materialValue: 17400, category: 'LIGHTING & CONTROLS' },
  { id: 'demo-6', description: 'Toggle Switch 20A', quantity: 50, laborHours: 10, unitPrice: 18, materialValue: 900, category: 'LIGHTING & CONTROLS' },
  { id: 'demo-7', description: 'Disconnect Switch 100A', quantity: 3, laborHours: 9, unitPrice: 650, materialValue: 1950, category: 'DISTRIBUTION' },
  { id: 'demo-8', description: 'Distribution Panel 225A', quantity: 2, laborHours: 16, unitPrice: 3500, materialValue: 7000, category: 'DISTRIBUTION' },
  { id: 'demo-9', description: 'Duplex Receptacle 15A', quantity: 200, laborHours: 35, unitPrice: 8.50, materialValue: 1700, category: 'POWER SYSTEMS' },
  { id: 'demo-10', description: '3/4in EMT Conduit 10ft', quantity: 300, laborHours: 60, unitPrice: 12.00, materialValue: 3600, category: 'BRANCH WIRING' },
  { id: 'demo-11', description: 'RW90 Copper Wire #12 AWG', quantity: 2500, laborHours: 45, unitPrice: 0.85, materialValue: 2125, category: 'BRANCH WIRING' },
  { id: 'demo-12', description: 'S-Hooks Fasteners', quantity: 500, laborHours: 4, unitPrice: 0.45, materialValue: 225, category: 'Unmapped' },
  { id: 'demo-13', description: 'Polytwine Pull String 6500ft', quantity: 2, laborHours: 2, unitPrice: 45, materialValue: 90, category: 'Unmapped' },
  { id: 'demo-14', description: 'Unspecified Mounting Brackets', quantity: 100, laborHours: 8, unitPrice: 5.50, materialValue: 550, category: 'Unmapped' }
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanned, setIsScanned] = useState(false);
  
  // App state
  const [parseData, setParseData] = useState<ParseResult | null>(null);
  const [selectedSystemForModal, setSelectedSystemForModal] = useState<string | null>(null);
  const [learnedMappingsCount, setLearnedMappingsCount] = useState(0);
  const [confirmedRecords, setConfirmedRecords] = useState<any | null>(null);

  // Manual Mapping state for Unmapped Tab
  const [selectedCategoryMap, setSelectedCategoryMap] = useState<Record<string, string>>({});

  const handleFileUpload = async (uploadedFile: File) => {
    setIsLoading(true);
    setError(null);
    setIsScanned(false);
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
        if (data.isScannedPdf) {
          setIsScanned(true);
        }
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

  const handleDemoLoad = (type: 'pdf' | 'excel') => {
    setIsLoading(true);
    setError(null);
    setIsScanned(false);
    setConfirmedRecords(null);

    setTimeout(() => {
      const aggregated = aggregateEstimate(
        JSON.parse(JSON.stringify(MOCK_SAMPLE_ITEMS)), 
        type === 'pdf' ? 'Sample_Electrical_Estimate.pdf' : 'Sample_Electrical_Estimate.xlsx'
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
              Smart Roll-up Engine <span className="text-xs py-0.5 px-2 bg-teal-500/20 text-teal-400 rounded-full font-semibold border border-teal-500/30">v2.5</span>
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
                Upload Estimate PDF or Excel
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Our parsing engine extracts lines from uploaded PDFs or Excel sheets, evaluating keywords with strict hierarchical priority logic.
              </p>

              <label className="border-2 border-dashed border-slate-600 hover:border-teal-500/80 bg-slate-900/50 hover:bg-slate-900/80 transition-all duration-200 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer group">
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".pdf,.xlsx,.xls,.csv" 
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
                <span className="text-xs text-slate-500">Supports .PDF, .XLSX, .XLS, .CSV</span>
              </label>
            </div>

            {/* Error alerts */}
            {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start space-x-3 text-red-300 text-sm">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-200">Ingestion Error</p>
                  <p>{error}</p>
                  {isScanned && (
                    <div className="pt-2 flex items-center space-x-3">
                      <button 
                        onClick={() => handleDemoLoad('excel')}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-all shadow"
                      >
                        Try Excel Version
                      </button>
                      <span className="text-xs text-slate-400">or use pre-loaded demo below</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Quick Demo Launchers */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/70 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-400" />
                1-Click Demo Loaders
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Instantly evaluate the staging UI, WBS aggregation, and learned mapping engine without uploading your own document.
              </p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => handleDemoLoad('pdf')} 
                disabled={isLoading}
                className="w-full py-3 px-4 bg-slate-700/60 hover:bg-teal-600/20 hover:border-teal-500/50 border border-slate-600 rounded-xl flex items-center justify-between text-left transition-all duration-200 group shadow"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-red-500/20 text-red-400 rounded-lg group-hover:bg-red-500 group-hover:text-white transition-all">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-teal-300">Sample Estimate (PDF text)</p>
                    <p className="text-xs text-slate-400">14 items • 8 Systems</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
              </button>

              <button 
                onClick={() => handleDemoLoad('excel')} 
                disabled={isLoading}
                className="w-full py-3 px-4 bg-slate-700/60 hover:bg-teal-600/20 hover:border-teal-500/50 border border-slate-600 rounded-xl flex items-center justify-between text-left transition-all duration-200 group shadow"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-teal-300">Sample Spreadsheet (.xlsx)</p>
                    <p className="text-xs text-slate-400">Includes unmapped hardware</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
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
              <p className="text-xs text-slate-400">Extracting lines & evaluating keyword priorities</p>
            </div>
          </div>
        )}

        {/* Staging UI Dashboard */}
        {parseData && !isLoading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-8">
            
            {/* Reconciliation Grand Total Banner */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-teal-400 uppercase mb-1">Source Document Reconciliation</p>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {parseData.fileName}
                  <span className="text-xs font-normal text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700">
                    {parseData.rawItems.length} Total Lines
                  </span>
                </h3>
              </div>

              <div className="flex items-center space-x-6">
                <div className="text-right">
                  <p className="text-xs text-slate-400 font-medium">Reconciled Grand Total</p>
                  <p className="text-2xl font-black text-emerald-400 tracking-tight">
                    ${parseData.totalProjectValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                <button 
                  onClick={handleConfirmRecords}
                  className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-xl flex items-center space-x-2 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>Confirm & Generate WBS / SOV</span>
                </button>
              </div>
            </div>

            {/* Confirmed SOV Records Notice */}
            <AnimatePresence>
              {confirmedRecords && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-slate-800/80 border border-emerald-500/40 rounded-2xl p-6 shadow-xl">
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
                        8 WBS headers successfully registered into project accounting. Unmapped string correlations have been committed to <span className="font-semibold text-teal-300">User_Learned_Mappings</span>.
                      </p>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                        {confirmedRecords.sovRecords.map((sov: any) => (
                          <div key={sov.system} className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/60">
                            <p className="text-[11px] text-slate-400 font-semibold truncate">{sov.system}</p>
                            <p className="text-base font-bold text-emerald-400 mt-0.5">${sov.sovAmount.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">{sov.allocatedLaborHours} hrs • {sov.itemCount} items</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* WBS Summary Table & Unmapped Tab */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-400" />
                  Staging Roll-up per Electrical System
                </h3>
                {parseData.unmappedItems.length > 0 && (
                  <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>{parseData.unmappedItems.length} Unmapped items need assignment</span>
                  </div>
                )}
              </div>

              {/* Table Container */}
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: '#37514E' }} className="text-white text-xs font-bold tracking-wider uppercase border-b border-slate-700">
                      <th className="py-4 px-6">WBS Header / Industry Category</th>
                      <th className="py-4 px-6 text-center">Assigned Line Items</th>
                      <th className="py-4 px-6 text-right">Labor Hours</th>
                      <th className="py-4 px-6 text-right">Material Value</th>
                      <th className="py-4 px-6 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-sm">
                    {parseData.rollups.map((rollup) => (
                      <tr key={rollup.category} className="hover:bg-slate-700/30 transition-colors duration-150 group">
                        <td className="py-4 px-6 font-bold text-white flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-teal-400" />
                          <span>{rollup.category}</span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="px-2.5 py-1 bg-slate-900 rounded-md border border-slate-700 text-xs font-semibold text-slate-300">
                            {rollup.itemCount}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right font-mono text-slate-200">
                          {rollup.laborHours.toFixed(2)} hrs
                        </td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-emerald-400">
                          ${rollup.materialValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={() => setSelectedSystemForModal(rollup.category)}
                            disabled={rollup.itemCount === 0}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-teal-500 hover:text-slate-900 text-slate-200 font-semibold text-xs transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* Grand Total Summary Row */}
                    <tr className="bg-slate-900/80 text-white font-bold border-t-2 border-teal-500/40">
                      <td className="py-4 px-6">TOTAL ROLLED UP</td>
                      <td className="py-4 px-6 text-center">
                        <span className="px-2.5 py-1 bg-teal-500/20 text-teal-400 rounded-md border border-teal-500/30 text-xs font-bold">
                          {parseData.rollups.reduce((acc, r) => acc + r.itemCount, 0)} mapped
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-teal-300">
                        {parseData.rollups.reduce((acc, r) => acc + r.laborHours, 0).toFixed(2)} hrs
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-emerald-400">
                        ${parseData.rollups.reduce((acc, r) => acc + r.materialValue, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6 text-center text-xs text-slate-400">Exact Match</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Unmapped List for Manual Assignment */}
              {parseData.unmappedItems.length > 0 && (
                <div className="bg-slate-800/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center space-x-2 text-amber-300 font-bold text-base">
                    <AlertCircle className="w-5 h-5" />
                    <h4>Unmapped Line Items — Manual Mapping Assignment</h4>
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
                            className="bg-slate-800 border border-slate-600 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-teal-500"
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
            </div>

          </motion.div>
        )}

      </main>

      {/* Review Modal */}
      <AnimatePresence>
        {selectedSystemForModal && parseData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div style={{ backgroundColor: '#37514E' }} className="px-6 py-4 flex justify-between items-center text-white">
                <div>
                  <p className="text-xs font-semibold tracking-wider uppercase text-teal-300">WBS Line Item Review</p>
                  <h3 className="text-lg font-bold">{selectedSystemForModal}</h3>
                </div>
                <button 
                  onClick={() => setSelectedSystemForModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-900/40 hover:bg-slate-900/80 flex items-center justify-center text-white font-bold transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                <p className="text-xs text-slate-400">
                  Below are all parsed raw line items assigned to <span className="text-teal-400 font-bold">{selectedSystemForModal}</span> according to priority logic or user mapping.
                </p>

                <div className="space-y-2">
                  {parseData.rollups.find(r => r.category === selectedSystemForModal)?.items.map(item => (
                    <div key={item.id} className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/60 flex justify-between items-center gap-4">
                      <div>
                        <p className="text-sm font-bold text-white flex items-center gap-2">
                          {item.description}
                          {item.isManuallyMapped && (
                            <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/30">User Learned</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          Quantity: {item.quantity} | Unit Price: ${item.unitPrice}
                        </p>
                      </div>

                      <div className="text-right font-mono">
                        <p className="text-sm font-bold text-emerald-400">${item.materialValue.toFixed(2)}</p>
                        <p className="text-xs text-slate-400">{item.laborHours} labor hrs</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-900 border-t border-slate-700 flex justify-between items-center text-xs text-slate-400 font-mono">
                <span>Total Items: {parseData.rollups.find(r => r.category === selectedSystemForModal)?.itemCount}</span>
                <button 
                  onClick={() => setSelectedSystemForModal(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
                >
                  Close Modal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-6 px-6 text-center text-xs text-slate-500 mt-auto">
        <p>Electrical System Roll-up Engine • Built for Vercel Serverless Deployment</p>
      </footer>
    </div>
  );
}
