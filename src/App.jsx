import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Download, Image as ImageIcon, Sliders, 
  ShieldCheck, RefreshCw, AlertCircle
} from 'lucide-react';
import { getBase64SizeKB, optimizeToTargetSize } from './utils/compressor';

const MAX_FILE_SIZE_MB = 15;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function App() {
  const [items, setItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [config, setConfig] = useState({
    targetKB: 50,
    enforceTargetKB: true,
    quality: 0.8,
    scaleFactor: 100,
    exportFormat: 'image/jpeg',
  });

  const [outputs, setOutputs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef(null);

  const handleFileDrop = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (!rawFiles.length) return;

    setErrorMessage('');
    const validBatch = [];

    for (const file of rawFiles) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setErrorMessage('Unsupported format. Please upload JPG, PNG, or WebP files.');
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setErrorMessage(`File "${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB safety limit.`);
        return;
      }

      validBatch.push({
        raw: file,
        fileName: file.name,
        originalKB: (file.size / 1024).toFixed(2),
        srcUrl: URL.createObjectURL(file),
      });
    }

    setItems((prev) => [...prev, ...validBatch]);
  };

  const processActiveImage = () => {
    if (!items.length || !items[activeIdx]) return;
    setIsProcessing(true);

    const currentItem = items[activeIdx];
    const img = new Image();
    img.src = currentItem.srcUrl;

    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      const width = Math.round((img.width * config.scaleFactor) / 100);
      const height = Math.round((img.height * config.scaleFactor) / 100);

      canvas.width = width;
      canvas.height = height;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let resultUrl = '';
      let usedQuality = config.quality;

      if (config.enforceTargetKB && config.exportFormat !== 'image/png') {
        const res = optimizeToTargetSize(canvas, config.exportFormat, config.targetKB);
        resultUrl = res.dataUrl;
        usedQuality = res.quality;
      } else {
        resultUrl = canvas.toDataURL(config.exportFormat, config.quality);
      }

      const processedKB = getBase64SizeKB(resultUrl, config.exportFormat);
      const reduction = (((currentItem.originalKB - processedKB) / currentItem.originalKB) * 100).toFixed(1);

      setOutputs((prev) => {
        const updated = [...prev];
        updated[activeIdx] = {
          dataUrl: resultUrl,
          sizeKB: processedKB,
          reductionRatio: reduction,
          resWidth: width,
          resHeight: height,
          effectiveQuality: (usedQuality * 100).toFixed(0)
        };
        return updated;
      });

      setIsProcessing(false);
    };

    img.onerror = () => {
      setErrorMessage('Failed to parse image buffer.');
      setIsProcessing(false);
    };
  };

  useEffect(() => {
    if (items.length > 0) {
      processActiveImage();
    }
  }, [items, activeIdx, config]);

  const currentItem = items[activeIdx];
  const currentOutput = outputs[activeIdx];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex flex-col items-center">
      <canvas ref={canvasRef} className="hidden" />

      <header className="w-full max-w-5xl flex justify-between items-center pb-6 mb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Client-Side Image Resizer & Optimizer
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero network transfer • In-memory execution
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 text-emerald-400 text-xs px-3 py-1.5 rounded-md">
          <ShieldCheck className="w-4 h-4" />
          <span>Local Engine</span>
        </div>
      </header>

      {errorMessage && (
        <div className="w-full max-w-5xl mb-4 bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-800/40 border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors rounded-xl p-6 text-center relative">
            <input 
              type="file" 
              multiple 
              accept="image/jpeg,image/png,image/webp" 
              onChange={handleFileDrop} 
              className="absolute inset-0 opacity-0 cursor-pointer" 
            />
            <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-200">Select images or drop here</p>
            <p className="text-[10px] text-slate-500 mt-1">Supports JPEG, PNG, WebP (Max 15MB)</p>
          </div>

          {items.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 border-b border-slate-700/80 pb-3">
                <Sliders className="w-4 h-4 text-slate-400" />
                <h2 className="font-semibold text-xs text-slate-200">Compression Settings</h2>
              </div>

              <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-slate-300">Target Size Limit</label>
                  <input 
                    type="checkbox" 
                    checked={config.enforceTargetKB} 
                    onChange={e => setConfig(prev => ({ ...prev, enforceTargetKB: e.target.checked }))}
                    className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-0" 
                  />
                </div>
                {config.enforceTargetKB && (
                  <div className="flex items-center space-x-2 pt-1">
                    <input 
                      type="number" 
                      value={config.targetKB} 
                      onChange={e => setConfig(prev => ({ ...prev, targetKB: Number(e.target.value) }))}
                      className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs w-24 text-slate-100 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">KB Max</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Format</label>
                  <select 
                    value={config.exportFormat}
                    onChange={e => setConfig(prev => ({ ...prev, exportFormat: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/webp">WebP</option>
                    <option value="image/png">PNG</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Scale: {config.scaleFactor}%</label>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    value={config.scaleFactor} 
                    onChange={e => setConfig(prev => ({ ...prev, scaleFactor: Number(e.target.value) }))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 space-y-6">
          {currentItem ? (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col justify-between min-h-[420px]">
              {items.length > 1 && (
                <div className="flex space-x-2 overflow-x-auto pb-3 border-b border-slate-700/80 mb-3">
                  {items.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIdx(idx)}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${
                        idx === activeIdx ? 'bg-indigo-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {item.fileName.slice(0, 14)}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative bg-slate-900 rounded-lg p-3 flex items-center justify-center border border-slate-800 min-h-[220px]">
                <img 
                  src={currentOutput?.dataUrl || currentItem.srcUrl} 
                  alt="Preview" 
                  className="max-h-52 max-w-full object-contain rounded"
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center backdrop-blur-sm rounded-lg">
                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                )}
              </div>

              {currentOutput && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] text-slate-500 font-medium">ORIGINAL</p>
                    <p className="text-sm font-semibold text-slate-300 mt-0.5">{currentItem.originalKB} KB</p>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] text-slate-500 font-medium">PROCESSED</p>
                    <p className="text-sm font-semibold text-indigo-400 mt-0.5">{currentOutput.sizeKB} KB</p>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <p className="text-[10px] text-slate-500 font-medium">REDUCTION</p>
                    <p className="text-sm font-semibold text-emerald-400 mt-0.5">{currentOutput.reductionRatio}%</p>
                  </div>
                </div>
              )}

              {currentOutput && (
                <div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-700/60">
                  <span className="text-[11px] text-slate-400">
                    {currentOutput.resWidth} × {currentOutput.resHeight}px @ {currentOutput.effectiveQuality}% quality
                  </span>
                  <a
                    href={currentOutput.dataUrl}
                    download={`optimized_${currentItem.fileName}`}
                    className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500 text-center min-h-[420px]">
              <ImageIcon className="w-10 h-10 mb-2 text-slate-600" />
              <p className="text-xs font-medium text-slate-400">No image loaded</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}