import { Download } from 'lucide-react';
import { baseName } from '../utils/fileTypes';

// Shows the before/after numbers and the download button for one processed file.
export default function ResultSummary({ item, output }) {
  const detailsText = output.isPdf
    ? `${output.pageCount} pages`
    : `${output.resWidth} × ${output.resHeight}px · ${output.label}`;

  const qualityText =
    output.quality === null ? ' · lossless' : ` @ ${(output.quality * 100).toFixed(0)}% quality`;

  const downloadExtension = output.isPdf ? 'pdf' : output.extension;
  const downloadName = `optimized_${baseName(item.fileName)}.${downloadExtension}`;

  return (
    <>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="bg-slate-900/80 p-2.5 rounded-lg">
          <p className="text-[10px] text-slate-500">ORIGINAL</p>
          <p className="text-sm font-semibold mt-0.5">{item.originalKB.toFixed(2)} KB</p>
        </div>

        <div className="bg-slate-900/80 p-2.5 rounded-lg">
          <p className="text-[10px] text-slate-500">PROCESSED</p>
          <p className="text-sm font-semibold text-indigo-400 mt-0.5">{output.sizeKB.toFixed(2)} KB</p>
        </div>

        <div className="bg-slate-900/80 p-2.5 rounded-lg">
          <p className="text-[10px] text-slate-500">REDUCTION</p>
          <p className="text-sm font-semibold text-emerald-400 mt-0.5">{output.reductionRatio.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-700/60">
        <span className="text-[11px] text-slate-400">
          {detailsText}
          {qualityText}
        </span>

        <a
          href={output.blobUrl}
          download={downloadName}
          className="flex items-center space-x-1.5 bg-indigo-600 text-white text-xs font-medium px-3.5 py-2 rounded-lg"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download</span>
        </a>
      </div>
    </>
  );
}
