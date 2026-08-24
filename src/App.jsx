import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, Image as ImageIcon, RefreshCw, ShieldCheck, Sliders, Upload } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { heic } from 'icodec';
import heicDecoderWasm from 'icodec/heic-dec.wasm?url';
import { optimizeToTargetSize, buildPdfAtQuality, compressPdfToTargetSize } from './utils/compressor';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_FILE_SIZE_MB = 25;
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf']);
const getExtension = (name) => name.split('.').pop()?.toLowerCase() || '';
const baseName = (name) => name.replace(/\.[^/.]+$/, '') || 'image';
const isHeic = (extension) => extension === 'heic' || extension === 'heif';
const imageFormatFor = (extension) => {
  if (extension === 'jpg' || extension === 'jpeg') return { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' };
  if (extension === 'png') return { mime: 'image/png', extension: 'png', label: 'PNG' };
  if (isHeic(extension)) return { mime: 'image/heic', extension: 'heic', label: 'HEIC' };
  throw new Error('Unsupported image format.');
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The browser could not decode this image.'));
  image.src = src;
});

const canvasFromImage = (image) => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The decoded image has no dimensions.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas context.');
  context.drawImage(image, 0, 0);
  return canvas;
};

const scaledCanvas = (source, scaleFactor) => {
  const width = Math.max(1, Math.round((source.width * scaleFactor) / 100));
  const height = Math.max(1, Math.round((source.height * scaleFactor) / 100));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a canvas context.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return canvas;
};

const canvasToBlob = (canvas, mime, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`Could not encode ${mime}.`)), mime, quality);
});

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

// HEIC encoding cannot be done by Canvas. icodec's HEIC encoder must run in a
// module worker, which is why this lives in a small companion worker file.
const encodeHeic = (canvas, quality) => new Promise((resolve, reject) => {
  const context = canvas.getContext('2d');
  if (!context) { reject(new Error('Could not create a canvas context.')); return; }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const worker = new Worker(new URL('./heicEncoder.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error) reject(new Error(data.error));
    else resolve(new Blob([data.bytes], { type: 'image/heic' }));
  };
  worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'HEIC encoder worker failed.')); };
  worker.postMessage({ width: canvas.width, height: canvas.height, pixels: imageData.data.buffer, quality }, [imageData.data.buffer]);
});

const optimizeHeicToTarget = async (canvas, targetKB, startingQuality) => {
  const targetBytes = targetKB * 1024;
  let low = 1;
  let high = Math.max(1, Math.min(100, Math.round(startingQuality * 100)));
  let best = null;
  let smallest = null;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const blob = await encodeHeic(canvas, quality);
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality };
    if (blob.size <= targetBytes) { best = { blob, quality }; low = quality + 1; }
    else high = quality - 1;
  }
  const result = best || smallest;
  return { blob: result.blob, sizeKB: result.blob.size / 1024, quality: result.quality / 100, targetMet: Boolean(best) };
};

const pdfToPageCanvases = async (file) => {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const canvases = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.75 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not create a canvas context.');
      await page.render({ canvasContext: context, viewport, background: 'white' }).promise;
      page.cleanup();
      canvases.push(canvas);
    }
    return canvases;
  } finally {
    if (typeof pdf.cleanup === 'function') pdf.cleanup();
    if (typeof pdf.destroy === 'function') await pdf.destroy();
  }
};

export default function App() {
  const [items, setItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [outputs, setOutputs] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [config, setConfig] = useState({ targetKB: 50, enforceTargetKB: true, quality: 0.8, scaleFactor: 100 });
  const objectUrlsRef = useRef(new Set());
  const outputUrlRef = useRef({});

  useEffect(() => () => { objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const createObjectUrl = (blob) => { const url = URL.createObjectURL(blob); objectUrlsRef.current.add(url); return url; };
  const replaceOutputUrl = (itemId, url) => {
    const previous = outputUrlRef.current[itemId];
    if (previous) { URL.revokeObjectURL(previous); objectUrlsRef.current.delete(previous); }
    outputUrlRef.current[itemId] = url;
  };

  const fileToAsset = async (file) => {
    const extension = getExtension(file.name);
    if (extension === 'pdf') {
      const pageCanvases = await pdfToPageCanvases(file);
      if (!pageCanvases.length) throw new Error('This PDF has no pages to render.');
      return { isPdf: true, pageCanvases, previewCanvas: pageCanvases[0] };
    }
    if (isHeic(extension)) {
      await heic.loadDecoder(heicDecoderWasm);
      const imageData = heic.decode(new Uint8Array(await file.arrayBuffer()));
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create a canvas context.');
      context.putImageData(imageData, 0, 0);
      return { isPdf: false, canvas, previewCanvas: canvas };
    }
    const url = createObjectUrl(file);
    try { const canvas = canvasFromImage(await loadImage(url)); return { isPdf: false, canvas, previewCanvas: canvas }; }
    finally { URL.revokeObjectURL(url); objectUrlsRef.current.delete(url); }
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setErrorMessage(''); setIsIngesting(true);
    const accepted = []; const errors = [];
    for (const file of files) {
      const extension = getExtension(file.name);
      if (!SUPPORTED_EXTENSIONS.has(extension)) errors.push(`“${file.name}” is not a supported file type.`);
      else if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) errors.push(`“${file.name}” exceeds the ${MAX_FILE_SIZE_MB} MB limit.`);
      else try {
        const asset = await fileToAsset(file);
        accepted.push({ id: crypto.randomUUID(), fileName: file.name, originalKB: file.size / 1024, isPdf: asset.isPdf, format: asset.isPdf ? null : imageFormatFor(extension), canvas: asset.isPdf ? null : asset.canvas, pageCanvases: asset.isPdf ? asset.pageCanvases : null, previewUrl: asset.previewCanvas.toDataURL('image/png') });
      } catch (error) { console.error(error); errors.push(`“${file.name}” could not be decoded. ${error.message || ''}`); }
    }
    if (accepted.length) setItems((previous) => { const next = [...previous, ...accepted]; if (!previous.length) setActiveIdx(0); return next; });
    if (errors.length) setErrorMessage(errors.join(' '));
    setIsIngesting(false);
  };

  const currentItem = items[activeIdx];
  const currentOutput = currentItem ? outputs[currentItem.id] : null;

  useEffect(() => {
    if (!currentItem) return undefined;
    let cancelled = false;
    setIsProcessing(true); setErrorMessage('');
    setOutputs((previous) => { const next = { ...previous }; delete next[currentItem.id]; return next; });
    const run = async () => {
      try {
        if (currentItem.isPdf) {
          // PDF behavior is deliberately unchanged.
          const scaledPages = currentItem.pageCanvases.map((canvas) => scaledCanvas(canvas, config.scaleFactor));
          const result = config.enforceTargetKB ? await compressPdfToTargetSize(scaledPages, config.targetKB, config.quality) : { ...(await buildPdfAtQuality(scaledPages, config.quality)), quality: config.quality, targetMet: true };
          if (cancelled) return;
          const blobUrl = createObjectUrl(new Blob([result.bytes], { type: 'application/pdf' }));
          replaceOutputUrl(currentItem.id, blobUrl);
          setOutputs((previous) => ({ ...previous, [currentItem.id]: { isPdf: true, blobUrl, sizeKB: result.sizeKB, quality: result.quality, targetMet: result.targetMet, reductionRatio: (1 - result.sizeKB / currentItem.originalKB) * 100, pageCount: scaledPages.length } }));
          if (!result.targetMet) setErrorMessage(`The ${config.targetKB} KB target could not be reached at the minimum quality.`);
          return;
        }
        const canvas = scaledCanvas(currentItem.canvas, config.scaleFactor);
        let result;
        if (currentItem.format.mime === 'image/jpeg') {
          const encoded = config.enforceTargetKB ? optimizeToTargetSize(canvas, 'image/jpeg', config.targetKB, config.quality) : { dataUrl: canvas.toDataURL('image/jpeg', config.quality), quality: config.quality, targetMet: true };
          const blob = await dataUrlToBlob(encoded.dataUrl);
          result = { blob, sizeKB: blob.size / 1024, quality: encoded.quality, targetMet: encoded.targetMet };
        } else if (currentItem.format.mime === 'image/png') {
          const blob = await canvasToBlob(canvas, 'image/png');
          result = { blob, sizeKB: blob.size / 1024, quality: null, targetMet: !config.enforceTargetKB || blob.size <= config.targetKB * 1024 };
        } else {
          result = config.enforceTargetKB ? await optimizeHeicToTarget(canvas, config.targetKB, config.quality) : (() => encodeHeic(canvas, Math.round(config.quality * 100)).then((blob) => ({ blob, sizeKB: blob.size / 1024, quality: config.quality, targetMet: true })))();
          result = await result;
        }
        if (cancelled) return;
        const blobUrl = createObjectUrl(result.blob);
        replaceOutputUrl(currentItem.id, blobUrl);
        setOutputs((previous) => ({ ...previous, [currentItem.id]: { isPdf: false, ...result, blobUrl, extension: currentItem.format.extension, label: currentItem.format.label, reductionRatio: (1 - result.sizeKB / currentItem.originalKB) * 100, resWidth: canvas.width, resHeight: canvas.height } }));
        if (!result.targetMet) setErrorMessage(`The ${config.targetKB} KB target could not be reached at the available quality settings.`);
      } catch (error) { console.error(error); if (!cancelled) setErrorMessage(error.message || 'Failed to process this file.'); }
      finally { if (!cancelled) setIsProcessing(false); }
    };
    run(); return () => { cancelled = true; };
  }, [currentItem, config]);

  const qualitySliderVisible = !config.enforceTargetKB && (currentItem?.isPdf || currentItem?.format?.mime !== 'image/png');
  return <div className="min-h-screen bg-slate-900 p-6 text-slate-100 flex flex-col items-center">
    <header className="w-full max-w-5xl flex justify-between items-center pb-6 mb-6 border-b border-slate-800"><div><h1 className="text-xl font-bold">Client-Side Asset Optimizer</h1><p className="text-xs text-slate-400 mt-1">Local, in-memory image and document processing</p></div><div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 text-emerald-400 text-xs px-3 py-1.5 rounded-md"><ShieldCheck className="w-4 h-4" /><span>Local Engine</span></div></header>
    {errorMessage && <div className="w-full max-w-5xl mb-4 bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center space-x-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMessage}</span></div>}
    <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6"><div className="lg:col-span-5 space-y-6"><div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }} className="bg-slate-800/40 border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors rounded-xl p-6 text-center relative"><input type="file" multiple accept="image/jpeg,image/png,.heic,.heif,.pdf" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} className="absolute inset-0 opacity-0 cursor-pointer" />{isIngesting ? <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto mb-2" /> : <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />}<p className="text-xs font-medium text-slate-200">Select files or drop them here</p><p className="text-[10px] text-slate-500 mt-1">JPEG, PNG, HEIC, or PDF (max 25 MB)</p></div>
      {items.length > 0 && <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-4"><div className="flex items-center space-x-2 border-b border-slate-700/80 pb-3"><Sliders className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-xs">Compression Settings</h2></div><div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800"><div className="flex justify-between items-center"><label className="text-xs text-slate-300">Target Size Limit</label><input type="checkbox" checked={config.enforceTargetKB} onChange={(event) => setConfig((previous) => ({ ...previous, enforceTargetKB: event.target.checked }))} /></div>{config.enforceTargetKB && <div className="flex items-center space-x-2 pt-1"><input type="number" min="1" step="1" value={config.targetKB} onChange={(event) => { const value = event.target.value; setConfig((previous) => ({ ...previous, targetKB: value === '' ? previous.targetKB : Math.max(1, Number(value)) })); }} className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs w-24" /><span className="text-xs text-slate-400">KB Max{currentItem?.isPdf ? ' (whole document)' : ''}</span></div>}</div><div className="grid grid-cols-2 gap-3"><div><label className="text-[11px] text-slate-400 block mb-1">Output format</label><div className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300">{currentItem?.isPdf ? 'PDF' : `${currentItem?.format?.label || 'Image'} (same as input)`}</div></div><div><label className="text-[11px] text-slate-400 block mb-1">Scale: {config.scaleFactor}%</label><input type="range" min="10" max="100" value={config.scaleFactor} onChange={(event) => setConfig((previous) => ({ ...previous, scaleFactor: Number(event.target.value) }))} className="w-full" /></div></div>{qualitySliderVisible && <div><label className="text-[11px] text-slate-400 block mb-1">Quality: {Math.round(config.quality * 100)}%</label><input type="range" min="1" max="100" value={Math.round(config.quality * 100)} onChange={(event) => setConfig((previous) => ({ ...previous, quality: Number(event.target.value) / 100 }))} className="w-full" /></div>}</div>}</div>
      <div className="lg:col-span-7">{currentItem ? <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 min-h-[420px]">{items.length > 1 && <div className="flex space-x-2 overflow-x-auto pb-3 border-b border-slate-700/80 mb-3">{items.map((item, index) => <button key={item.id} onClick={() => setActiveIdx(index)} className={`text-xs px-3 py-1 rounded-md ${index === activeIdx ? 'bg-indigo-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>{item.fileName.slice(0, 14)}</button>)}</div>}<div className="relative bg-slate-900 rounded-lg p-3 flex items-center justify-center border border-slate-800 min-h-[220px]"><img src={currentItem.previewUrl} alt="Preview" className="max-h-52 max-w-full object-contain rounded" />{isProcessing && <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center"><RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" /></div>}</div>{currentItem.isPdf && <p className="text-[10px] text-slate-500 mt-1.5 text-center">Preview shows page 1 only, unscaled — download to see the full {currentItem.pageCanvases.length}-page compressed PDF.</p>}{currentOutput && <><div className="mt-4 grid grid-cols-3 gap-3"><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">ORIGINAL</p><p className="text-sm font-semibold mt-0.5">{currentItem.originalKB.toFixed(2)} KB</p></div><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">PROCESSED</p><p className="text-sm font-semibold text-indigo-400 mt-0.5">{currentOutput.sizeKB.toFixed(2)} KB</p></div><div className="bg-slate-900/80 p-2.5 rounded-lg"><p className="text-[10px] text-slate-500">REDUCTION</p><p className="text-sm font-semibold text-emerald-400 mt-0.5">{currentOutput.reductionRatio.toFixed(1)}%</p></div></div><div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-700/60"><span className="text-[11px] text-slate-400">{currentOutput.isPdf ? `${currentOutput.pageCount} pages` : `${currentOutput.resWidth} × ${currentOutput.resHeight}px · ${currentOutput.label}`}{currentOutput.quality === null ? ' · lossless' : ` @ ${(currentOutput.quality * 100).toFixed(0)}% quality`}</span><a href={currentOutput.blobUrl} download={`optimized_${baseName(currentItem.fileName)}.${currentOutput.isPdf ? 'pdf' : currentOutput.extension}`} className="flex items-center space-x-1.5 bg-indigo-600 text-white text-xs font-medium px-3.5 py-2 rounded-lg"><Download className="w-3.5 h-3.5" /><span>Download</span></a></div></>}</div> : <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500 text-center min-h-[420px]"><ImageIcon className="w-10 h-10 mb-2 text-slate-600" /><p className="text-xs font-medium text-slate-400">No file loaded</p></div>}</div></main>
  </div>;
}
