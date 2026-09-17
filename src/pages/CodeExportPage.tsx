import React from 'react';
import { CodeExportStudio } from '../components/CodeExportStudio.tsx';

export const CodeExportPage: React.FC = () => {
  return (
    <div id="code-export-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Chrome Extension &amp; Code Studio
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Download the production Manifest V3 ZIP bundle or inspect autonomous content scripts and background workers
        </p>
      </div>

      <CodeExportStudio />
    </div>
  );
};
