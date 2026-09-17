import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { LiveScannerFeed } from '../components/LiveScannerFeed.tsx';
import { FreelancerProject, FilterConfig } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
  onOpenTester: (project?: FreelancerProject) => void;
  onPollNow: () => void;
}

export const ScannedProjectsPage: React.FC = () => {
  const { config, onOpenTester } = useOutletContext<OutletContextType>();
  const [projects, setProjects] = useState<FreelancerProject[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch scanned projects:', e);
    }
  };

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshLiveFeed = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/refresh-live-feed', { method: 'POST' });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (e) {
      console.error('Failed to refresh feed:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm('Clear all scanned projects and evaluation history?')) {
      try {
        await fetch('/api/clear-history', { method: 'POST' });
        await fetchProjects();
      } catch (e) {
        console.error('Failed to clear history:', e);
      }
    }
  };

  return (
    <div id="scanned-projects-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Scanned Projects
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time feed of projects evaluated by your qualification filters and safety rules
          </p>
        </div>
      </div>

      <LiveScannerFeed
        projects={projects}
        config={config}
        onTestProject={(project) => onOpenTester(project)}
        onClearHistory={handleClearHistory}
        onRefreshLiveFeed={handleRefreshLiveFeed}
        onProjectUpdate={(updated) => {
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          fetchProjects();
        }}
      />
    </div>
  );
};
