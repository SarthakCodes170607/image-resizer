import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Upload,
} from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getBase64SizeKB, optimizeToTargetSize } from './utils/compressor';

const MAX_FILE_SIZE_MB = 25;
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif', 'pdf']);

const getExtension = (fileName) => fileName.split('.').pop()?.toLowerCase() || '';
const baseName = (fileName) => fileName.replace(/\.[^/.]+$/, '') || 'image';
const extensionForMime = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime] || 'png');

export default function App() {
  const [items, setItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [outputs, setOutputs] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const objectUrlsRef = useRef(new Set());
  const [config, setConfig] = useState({
    targetKB: 50,
    enforceTargetKB: true,
    quality: 0.8,
    scaleFactor: 100,
    exportFormat: 'image/jpeg',
  });

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const createObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.add(url);
    return url;
  };

  const convertFileToCanvasSource = async (file) => {
    const ext = getExtension(file.name);

    if (ext === 'heic' || ext === 'heif') {
      const heic2anyModule = await import('heic2any');
      const heic2any = heic2anyModule.default || heic2anyModule;
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
      return createObjectUrl(Array.isArray(converted) ? converted[0] : converted);
    }

    if (ext === 'pdf') {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

      try {
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a canvas context.');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.92);
      } finally {
        await pdf.destroy();
      }
    }

    return createObjectUrl(file);
  };

  const addFiles = async (fileList) => {
    const rawFiles = Array.from(fileList || []);
    if (!rawFiles.length) return;

    setErrorMessage('');
    setIsIngesting(true);
    const accepted = [];
    const errors = [];

    for (const file of rawFiles) {
      const ext = getExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        errors.push(`“${file.name}” is not a supported file type.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        errors.push(`“${file.name}” exceeds the ${MAX_FILE_SIZE_MB} MB limit.`);
        continue;
      }

      try {
        accepted.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          originalKB: file.size / 1024,
          srcUrl: await convertFileToCanvasSource(file),
        });
      } catch (error) {
        console.error(error);
        errors.push(`“${file.name}” could not be loaded.`);
      }
    }

    if (accepted.length) setItems((previous) => [...previous, ...accepted]);
    if (errors.length) setErrorMessage(errors.join(' '));
    setIsIngesting(false);
  };

  const currentItem = items[activeIdx];
  const currentOutput = currentItem ? outputs[currentItem.id] : null;

  useEffect(() => {
    if (!currentItem) return undefined;

    let cancelled = false;
    setIsProcessing(true);
    setOutputs((previous) => {
      const next = { ...previous };
      delete next[currentItem.id];
      return next;
    });

    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a canvas context.');

        const width = Math.max(1, Math.round((image.naturalWidth * config.scaleFactor) / 100));
        const height = Math.max(1, Math.round((image.naturalHeight * config.scaleFactor) / 100));
        canvas.width = width;
        canvas.height = height;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);

        let result;
        if (config.enforceTargetKB && config.exportFormat !== 'image/png') {
          result = optimizeToTargetSize(canvas, config.exportFormat, config.targetKB, config.quality);
        } else {
          const dataUrl = canvas.toDataURL(config.exportFormat, config.quality);
          result = {
            dataUrl,
            sizeKB: getBase64SizeKB(dataUrl),
            quality: config.exportFormat === 'image/png' ? null : config.quality,
            targetMet: true,
          };
        }

        if (cancelled) return;
        const outputMime = result.dataUrl.slice(5, result.dataUrl.indexOf(';'));
        setOutputs((previous) => ({
          ...previous,
          [currentItem.id]: {
            ...result,
            reductionRatio: ((1 - result.sizeKB / currentItem.originalKB) * 100),
            resWidth: width,
            resHeight: height,
            extension: extensionForMime(outputMime),
          },
        }));
        if (!result.targetMet) {
          setErrorMessage(`The ${config.targetKB} KB target could not be reached at the minimum quality.`);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setErrorMessage(error.message || 'Failed to process this file.');
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setErrorMessage('Failed to render this file.');
        setIsProcessing(false);
      }
    };
    image.src = currentItem.srcUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [currentItem, config]);

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100 flex flex-col items-center">
      <header className="w-full max-w-5xl flex justify-between items-center pb-6 mb-6 border-b border-slate-800">
        <div><h1 className="text-xl font-bold">Client-Side Asset Optimizer</h1><p className="text-xs text-slate-400 mt-1">Local, in-memory image and document processing</p></div>
        <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 text-emerald-400 text-xs px-3 py-1.5 rounded-md"><ShieldCheck className="w-4 h-4" /><span>Local Engine</span></div>
      </header>
      {errorMessage && <div className="w-full max-w-5xl mb-4 bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center space-x-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMessage}</span></div>}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} className="bg-slate-800/40 border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors rounded-xl p-6 text-center relative">
            <input type="file" multiple accept="image/*,.heic,.heif,.pdf" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} className="absolute inset-0 opacity-0 cursor-pointer" />
            {isIngesting ? <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto mb-2" /> : <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />}
            <p className="text-xs font-medium text-slate-200">Select files or drop them here</p><p className="text-[10px] text-slate-500 mt-1">JPG, PNG, WebP, HEIC, or PDF (max 25 MB)</p>
          </div>
          {items.length > 0 && <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-4"><div className="flex items-center space-x-2 border-b border-slate-700/80 pb-3"><Sliders className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-xs">Compression Settings</h2></div><div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800"><div className="flex justify-between items-center"><label className="text-xs text-slate-300">Target Size Limit</label><input type="checkbox" checked={config.enforceTargetKB} onChange={(event) => setConfig((previous) => ({ ...previous, enforceTargetKB: event.target.checked }))} /></div>{config.enforceTargetKB && <div className="flex items-center space-x-2 pt-1"><input type="number" min="1" step="1" value={config.targetKB} onChange={(event) => setConfig((previous) => ({ ...previous, targetKB: event.target.value === '' ? '' : Number(event.target.value) }))} className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs w-24" /><span className="text-xs text-slate-400">KB Max</span></div>}</div><div className="grid grid-cols-2 gap-3"><div><label className="text-[11px] text-slate-400 block mb-1">Format</label><select value={config.exportFormat} onChange={(event) => setConfig((previous) => ({ ...previous, exportFormat: event.target.value }))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs"><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option><option value="image/png">PNG</option></select></div><div><label className="text-[11px] text-slate-400 block mb-1">Scale: {config.scaleFactor}%</label><input type="range" min="10" max="100" value={config.scaleFactor} onChange={(event) => setConfig((previous) => ({ ...previous, scaleFactor: Number(event.target.value) }))} className="w-full" /></div></div></div>}
        </div>
        <div className="lg:col-span-7">{currentItem ? <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 min-h-[420px]">{items.length > 1 && <div className="flex space-x-2 overflow-x-auto pb-3 border-b border-slate-700/80 mb-3">{items.map((item, index) => <button key={item.id} onClick={() => setActiveIdx(index)} className={`text-xs px-3 py-1 rounded-md ${index === activeIdx ? 'bg-indigo-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>{item.fileName.slice(0, 14)}</button>)}</div>}<div className="relative bg-slate-900 rounded-lg p-3 flex items-center justify-center border border-slate-800 min-h-[220px]"><img src={currentOutput?.dataUrl || currentItem.srcUrl} alt="Preview" className="max-h-52 max-w-full object-contain rounded" />{isProcessing && <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center"><RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" /></div>}</div>{currentOutput && <><div className="mt-4 grid grid-cols-3 gap-3"><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">ORIGINAL</p><p className="text-sm font-semibold mt-0.5">{currentItem.originalKB.toFixed(2)} KB</p></div><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">PROCESSED</p><p className="text-sm font-semibold text-indigo-400 mt-0.5">{currentOutput.sizeKB.toFixed(2)} KB</p></div><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">REDUCTION</p><p className="text-sm font-semibold text-emerald-400 mt-0.5">{currentOutput.reductionRatio.toFixed(1)}%</p></div></div><div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-700/60"><span className="text-[11px] text-slate-400">{currentOutput.resWidth} × {currentOutput.resHeight}px{currentOutput.quality === null ? ' · lossless' : ` @ ${(currentOutput.quality * 100).toFixed(0)}% quality`}</span><a href={currentOutput.dataUrl} download={`optimized_${baseName(currentItem.fileName)}.${currentOutput.extension}`} className="flex items-center space-x-1.5 bg-indigo-600 text-white text-xs font-medium px-3.5 py-2 rounded-lg"><Download className="w-3.5 h-3.5" /><span>Download</span></a></div></>}</div> : <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500 text-center min-h-[420px]"><ImageIcon className="w-10 h-10 mb-2 text-slate-600" /><p className="text-xs font-medium text-slate-400">No file loaded</p></div>}</div>
      </main>
    </div>
  );
}
