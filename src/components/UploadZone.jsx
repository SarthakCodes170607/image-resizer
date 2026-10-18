import { RefreshCw, Upload } from 'lucide-react';
import { MAX_FILE_SIZE_MB } from '../utils/fileTypes';

export default function UploadZone({ isIngesting, onFiles }) {
  function handleDrop(event) {
    event.preventDefault();
    onFiles(event.dataTransfer.files);
  }

  function handleInputChange(event) {
    onFiles(event.target.files);
    // Clear the input so choosing the same file again still triggers a change.
    event.target.value = '';
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="bg-slate-800/40 border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors rounded-xl p-6 text-center relative"
    >
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,.heic,.heif,.pdf"
        onChange={handleInputChange}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />

      {isIngesting ? (
        <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mx-auto mb-2" />
      ) : (
        <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
      )}

      <p className="text-xs font-medium text-slate-200">Select files or drop them here</p>
      <p className="text-[10px] text-slate-500 mt-1">JPEG, PNG, HEIC, or PDF (max {MAX_FILE_SIZE_MB} MB)</p>
    </div>
  );
}
