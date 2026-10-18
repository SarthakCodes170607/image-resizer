import { useEffect, useState } from 'react';
import ErrorBanner from './components/ErrorBanner';
import Header from './components/Header';
import PreviewPanel from './components/PreviewPanel';
import SettingsPanel from './components/SettingsPanel';
import UploadZone from './components/UploadZone';
import { useObjectUrls } from './hooks/useObjectUrls';
import { getFileProblem } from './utils/fileTypes';
import { createItemFromFile } from './utils/loadAsset';
import { processItem } from './utils/processItem';

const DEFAULT_CONFIG = {
  targetKB: 50,
  enforceTargetKB: true,
  quality: 0.8,
  scaleFactor: 100,
};

export default function App() {
  const [items, setItems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [outputs, setOutputs] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const { createObjectUrl, replaceOutputUrl } = useObjectUrls();

  const currentItem = items[activeIdx];
  const currentOutput = currentItem ? outputs[currentItem.id] : null;

  // Validates and decodes the chosen files, then adds the good ones to the list.
  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    setErrorMessage('');
    setIsIngesting(true);

    const acceptedItems = [];
    const errors = [];

    for (const file of files) {
      const problem = getFileProblem(file);

      if (problem) {
        errors.push(problem);
        continue;
      }

      try {
        const item = await createItemFromFile(file);
        acceptedItems.push(item);
      } catch (error) {
        console.error(error);
        errors.push(`“${file.name}” could not be decoded. ${error.message || ''}`);
      }
    }

    if (acceptedItems.length > 0) {
      setItems((previous) => {
        const next = [...previous, ...acceptedItems];
        if (previous.length === 0) {
          setActiveIdx(0);
        }
        return next;
      });
    }

    if (errors.length > 0) {
      setErrorMessage(errors.join(' '));
    }

    setIsIngesting(false);
  }

  // Whenever the selected file or the settings change, compress the file again.
  useEffect(() => {
    if (!currentItem) {
      return undefined;
    }

    let cancelled = false;

    setIsProcessing(true);
    setErrorMessage('');

    // Hide the old result while the new one is being made.
    setOutputs((previous) => {
      const next = { ...previous };
      delete next[currentItem.id];
      return next;
    });

    async function run() {
      try {
        const { output, warning } = await processItem(currentItem, config);

        // The user changed something while we were working, so drop this result.
        if (cancelled) {
          return;
        }

        const blobUrl = createObjectUrl(output.blob);
        replaceOutputUrl(currentItem.id, blobUrl);

        setOutputs((previous) => ({
          ...previous,
          [currentItem.id]: { ...output, blobUrl },
        }));

        if (warning) {
          setErrorMessage(warning);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setErrorMessage(error.message || 'Failed to process this file.');
        }
      } finally {
        if (!cancelled) {
          setIsProcessing(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [currentItem, config, createObjectUrl, replaceOutputUrl]);

  return (
    <div className="min-h-screen bg-slate-900 p-6 text-slate-100 flex flex-col items-center">
      <Header />
      <ErrorBanner message={errorMessage} />

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <UploadZone isIngesting={isIngesting} onFiles={addFiles} />

          {items.length > 0 && (
            <SettingsPanel config={config} setConfig={setConfig} currentItem={currentItem} />
          )}
        </div>

        <div className="lg:col-span-7">
          <PreviewPanel
            items={items}
            activeIdx={activeIdx}
            onSelect={setActiveIdx}
            currentItem={currentItem}
            currentOutput={currentOutput}
            isProcessing={isProcessing}
          />
        </div>
      </main>
    </div>
  );
}
