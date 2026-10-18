import { ShieldCheck } from 'lucide-react';

export default function Header() {
  return (
    <header className="w-full max-w-5xl flex justify-between items-center pb-6 mb-6 border-b border-slate-800">
      <div>
        <h1 className="text-xl font-bold">Client-Side Asset Optimizer</h1>
        <p className="text-xs text-slate-400 mt-1">Local, in-memory image and document processing</p>
      </div>

      <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 text-emerald-400 text-xs px-3 py-1.5 rounded-md">
        <ShieldCheck className="w-4 h-4" />
        <span>Local Engine</span>
      </div>
    </header>
  );
}
