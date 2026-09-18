import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { UtilityHeader } from './UtilityHeader.tsx';
import { PromoBanner } from './PromoBanner.tsx';
import { ProposalTesterModal } from '../ProposalTesterModal.tsx';
import { FilterConfig, FreelancerProject } from '../../types.ts';

interface AppLayoutProps {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
  onPollNow: () => void;
  isPolling: boolean;
  pollSecondsRemaining: number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  config,
  onUpdateConfig,
  onPollNow,
  isPolling,
  pollSecondsRemaining,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isTesterModalOpen, setIsTesterModalOpen] = useState(false);
  const [testProject, setTestProject] = useState<FreelancerProject | null>(null);
  const [extensionVersion, setExtensionVersion] = useState('');

  useEffect(() => {
    fetch('/api/extension-version')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.version) setExtensionVersion(data.version);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-500/20 antialiased flex flex-col">
      {/* Permanent Left Sidebar (Mobile overlay + Desktop fixed) */}
      <Sidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        extensionStatus={config.autoBidEnabled ? 'running' : 'idle'}
        extensionVersion={extensionVersion}
      />

      {/* Main Right Layout Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0 transition-all duration-200">
        {/* Top Utility Header */}
        <UtilityHeader
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          config={config}
          onUpdateConfig={onUpdateConfig}
          onPollNow={onPollNow}
          isPolling={isPolling}
          onOpenTester={() => {
            setTestProject(null);
            setIsTesterModalOpen(true);
          }}
          userName="Md zuman Farhad"
          extensionVersion={extensionVersion}
        />

        {/* Promotional Audit Banner */}
        <PromoBanner />

        {/* Page Content View */}
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
          <Outlet
            context={{
              config,
              onUpdateConfig,
              onPollNow,
              isPolling,
              pollSecondsRemaining,
              onOpenTester: (proj?: FreelancerProject) => {
                setTestProject(proj || null);
                setIsTesterModalOpen(true);
              },
            }}
          />
        </main>

        {/* Compact Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Freelancer AutoBid</span>
              <span>• Chrome Manifest V3 Automation Hub</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Extension {extensionVersion}</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">gpt-4o-mini Proposal Engine</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Global AI Proposal Tester Modal */}
      <ProposalTesterModal
        isOpen={isTesterModalOpen}
        onClose={() => setIsTesterModalOpen(false)}
        initialProject={testProject}
      />
    </div>
  );
};
