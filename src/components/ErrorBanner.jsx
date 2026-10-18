import { AlertCircle } from 'lucide-react';

export default function ErrorBanner({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="w-full max-w-5xl mb-4 bg-red-950/50 border border-red-800 text-red-300 text-xs p-3 rounded-lg flex items-center space-x-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
