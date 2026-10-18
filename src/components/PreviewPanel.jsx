import { Image as ImageIcon, RefreshCw } from 'lucide-react';
import ResultSummary from './ResultSummary';

function EmptyPreview() {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500 text-center min-h-[420px]">
      <ImageIcon className="w-10 h-10 mb-2 text-slate-600" />
      <p className="text-xs font-medium text-slate-400">No file loaded</p>
    </div>
  );
}

// One button per uploaded file, shown only when there is more than one.
function FileTabs({ items, activeIdx, onSelect }) {
  return (
    <div className="flex space-x-2 overflow-x-auto pb-3 border-b border-slate-700/80 mb-3">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => onSelect(index)}
          className={`text-xs px-3 py-1 rounded-md ${index === activeIdx ? 'bg-indigo-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}
        >
          {item.fileName.slice(0, 14)}
        </button>
      ))}
    </div>
  );
}

export default function PreviewPanel({ items, activeIdx, onSelect, currentItem, currentOutput, isProcessing }) {
  if (!currentItem) {
    return <EmptyPreview />;
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 min-h-[420px]">
      {items.length > 1 && <FileTabs items={items} activeIdx={activeIdx} onSelect={onSelect} />}

      <div className="relative bg-slate-900 rounded-lg p-3 flex items-center justify-center border border-slate-800 min-h-[220px]">
        <img src={currentItem.previewUrl} alt="Preview" className="max-h-52 max-w-full object-contain rounded" />

        {isProcessing && (
          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}
      </div>

      {currentItem.isPdf && (
        <p className="text-[10px] text-slate-500 mt-1.5 text-center">
          Preview shows page 1 only, unscaled — download to see the full {currentItem.pageCanvases.length}-page compressed PDF.
        </p>
      )}

      {currentOutput && <ResultSummary item={currentItem} output={currentOutput} />}
    </div>
  );
}
