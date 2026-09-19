import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { AiPromptEditor } from '../components/AiPromptEditor.tsx';
import { RelevanceGateEditor } from '../components/RelevanceGateEditor.tsx';
import { FilterConfig, FreelancerProject } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onOpenTester: (project?: FreelancerProject) => void;
}

export const AiPromptsPage: React.FC = () => {
  const { config, onUpdateConfig, onOpenTester } = useOutletContext<OutletContextType>();

  return (
    <div id="ai-prompts-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          AI Prompt &amp; Proposal Engine
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Tune the OpenAI system prompt, proposal structure, dynamic placeholders, and model parameters
        </p>
      </div>

      <RelevanceGateEditor config={config} onSave={onUpdateConfig} />

      <AiPromptEditor
        config={config}
        onSave={onUpdateConfig}
        onOpenTester={() => onOpenTester()}
      />
    </div>
  );
};
