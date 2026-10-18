import { Sliders } from 'lucide-react';

export default function SettingsPanel({ config, setConfig, currentItem }) {
  // PNG is lossless, so the quality slider only makes sense for JPEG, HEIC and PDF,
  // and only when the target-size search is switched off.
  const qualitySliderVisible =
    !config.enforceTargetKB && (currentItem?.isPdf || currentItem?.format?.mime !== 'image/png');

  function handleTargetToggle(event) {
    const enforceTargetKB = event.target.checked;
    setConfig((previous) => ({ ...previous, enforceTargetKB }));
  }

  function handleTargetKBChange(event) {
    const value = event.target.value;

    setConfig((previous) => ({
      ...previous,
      targetKB: value === '' ? previous.targetKB : Math.max(1, Number(value)),
    }));
  }

  function handleScaleChange(event) {
    const scaleFactor = Number(event.target.value);
    setConfig((previous) => ({ ...previous, scaleFactor }));
  }

  function handleQualityChange(event) {
    const quality = Number(event.target.value) / 100;
    setConfig((previous) => ({ ...previous, quality }));
  }

  const outputFormatText = currentItem?.isPdf
    ? 'PDF'
    : `${currentItem?.format?.label || 'Image'} (same as input)`;

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-4">
      <div className="flex items-center space-x-2 border-b border-slate-700/80 pb-3">
        <Sliders className="w-4 h-4 text-slate-400" />
        <h2 className="font-semibold text-xs">Compression Settings</h2>
      </div>

      <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div className="flex justify-between items-center">
          <label className="text-xs text-slate-300">Target Size Limit</label>
          <input type="checkbox" checked={config.enforceTargetKB} onChange={handleTargetToggle} />
        </div>

        {config.enforceTargetKB && (
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="number"
              min="1"
              step="1"
              value={config.targetKB}
              onChange={handleTargetKBChange}
              className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs w-24"
            />
            <span className="text-xs text-slate-400">KB Max{currentItem?.isPdf ? ' (whole document)' : ''}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Output format</label>
          <div className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300">
            {outputFormatText}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Scale: {config.scaleFactor}%</label>
          <input
            type="range"
            min="10"
            max="100"
            value={config.scaleFactor}
            onChange={handleScaleChange}
            className="w-full"
          />
        </div>
      </div>

      {qualitySliderVisible && (
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Quality: {Math.round(config.quality * 100)}%</label>
          <input
            type="range"
            min="1"
            max="100"
            value={Math.round(config.quality * 100)}
            onChange={handleQualityChange}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
