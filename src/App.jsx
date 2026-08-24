import React, { useState } from 'react';

export default function App() {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [targetKB, setTargetKB] = useState(100);
  const [resizedImage, setResizedImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setResizedImage(null);
      setStats(null);
    }
  };

  const compressToTargetSize = async () => {
    if (!imageFile || targetKB <= 0) return;
    setProcessing(true);

    const targetBytes = targetKB * 1024;
    const img = new Image();
    const initialUrl = URL.createObjectURL(imageFile);
    img.src = initialUrl;

    img.onload = async () => {
      URL.revokeObjectURL(initialUrl);

      let scale = 1.0;
      let bestBlob = null;
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');

      while (scale > 0.05) {
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let min = 0.01;
        let max = 1.0;
        let iterations = 0;

        while (min <= max && iterations < 7) {
          const mid = (min + max) / 2;
          const blob = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', mid)
          );

          if (blob) {
            bestBlob = blob;
            if (blob.size > targetBytes) {
              max = mid - 0.05;
            } else {
              min = mid + 0.05;
            }
          }
          iterations++;
        }

        if (bestBlob && bestBlob.size <= targetBytes) break;
        scale -= 0.2;
      }

      if (bestBlob) {
        if (resizedImage) URL.revokeObjectURL(resizedImage);
        const url = URL.createObjectURL(bestBlob);
        setResizedImage(url);
        setStats({
          originalSize: (imageFile.size / 1024).toFixed(1),
          finalSize: (bestBlob.size / 1024).toFixed(1),
        });
      }
      setProcessing(false);
    };
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-700">
        <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
          Image Resizer & Compressor
        </h1>
        <p className="text-slate-400 text-center mb-6 text-sm">
          Target exact KB sizes with 100% client-side privacy.
        </p>

        {/* Upload Box */}
        <div className="mb-6">
          <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl cursor-pointer bg-slate-900/50 transition">
            <span className="text-sm text-slate-400">
              {imageFile ? imageFile.name : 'Click or drag an image here'}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>

        {imageFile && (
          <div className="space-y-6">
            {/* Controls */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/50">
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Target File Size (KB):
              </label>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={targetKB}
                  onChange={(e) => setTargetKB(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 w-full text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 100"
                />
                <button
                  onClick={compressToTargetSize}
                  disabled={processing}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold px-6 py-2 rounded-lg transition shrink-0"
                >
                  {processing ? 'Processing...' : 'Compress'}
                </button>
              </div>
            </div>

            {/* Results / Stats */}
            {stats && (
              <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/50 space-y-4">
                <div className="flex justify-between text-sm text-slate-300 border-b border-slate-800 pb-3">
                  <span>Original: <strong className="text-white">{stats.originalSize} KB</strong></span>
                  <span>Target Result: <strong className="text-emerald-400">{stats.finalSize} KB</strong></span>
                </div>

                <div className="overflow-hidden rounded-lg bg-slate-950 max-h-64 flex items-center justify-center">
                  <img src={resizedImage} alt="Resized output" className="object-contain h-full w-full" />
                </div>

                <a
                  href={resizedImage}
                  download={`resized_${targetKB}KB.jpg`}
                  className="block text-center w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg transition"
                >
                  Download Compressed Image
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}