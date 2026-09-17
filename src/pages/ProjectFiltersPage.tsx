import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { SettingsPage } from '../components/SettingsPage.tsx';
import { FilterConfig, FreelancerProject } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onOpenTester: (project?: FreelancerProject) => void;
}

export const ProjectFiltersPage: React.FC = () => {
  const { config, onUpdateConfig, onOpenTester } = useOutletContext<OutletContextType>();

  return (
    <div id="project-filters-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Project Filters &amp; Criteria
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure mandatory platform skills, negative keyword blacklists, client ratings, and budget boundaries
        </p>
      </div>

      <SettingsPage
        config={config}
        onSave={onUpdateConfig}
        onOpenTester={() => onOpenTester()}
        onClearHistory={() => {}}
      />
    </div>
  );
};
