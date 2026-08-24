import React, { useState } from 'react';

export default function App() {
  const [imageFile, setImageFile] = useState(null);
  const [targetKB, setTargetKB] = useState(100);
  const [resizedImage, setResizedImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
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
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: 'auto' }}>
      <h2>Target File Size Image Resizer</h2>

      <input type="file" accept="image/*" onChange={handleImageUpload} />

      {imageFile && (
        <div style={{ marginTop: '1.5rem' }}>
          <label>
            <strong>Target Size (KB):</strong>
            <input
              type="number"
              value={targetKB}
              onChange={(e) => setTargetKB(Number(e.target.value))}
              style={{ marginLeft: '10px', padding: '5px', width: '100px' }}
            />
          </label>

          <button
            onClick={compressToTargetSize}
            disabled={processing}
            style={{ marginLeft: '10px', padding: '6px 12px', cursor: 'pointer' }}
          >
            {processing ? 'Compressing...' : 'Resize Image'}
          </button>
        </div>
      )}

      {stats && (
        <div style={{ marginTop: '1.5rem' }}>
          <p><strong>Original Size:</strong> {stats.originalSize} KB</p>
          <p><strong>Resulting Size:</strong> {stats.finalSize} KB</p>
          <img src={resizedImage} alt="Resized" style={{ maxWidth: '100%', marginTop: '10px' }} />
          <br />
          <a href={resizedImage} download={`resized_${targetKB}KB.jpg`}>
            <button style={{ marginTop: '10px', padding: '8px 16px' }}>Download Image</button>
          </a>
        </div>
      )}
    </div>
  );
}