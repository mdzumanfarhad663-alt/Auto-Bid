import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart2,
  Search,
  FileText,
  Activity,
  Layers,
  Filter,
  RotateCcw,
  Sparkles,
  UserCheck,
  FileSignature,
  Download,
  BookOpen,
  X,
  CheckCircle2,
  Bot,
  ShieldCheck,
  UserCog
} from 'lucide-react';
import { PublicUser } from '../../types.ts';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  extensionStatus?: 'idle' | 'running' | 'polling';
  extensionVersion?: string;
  currentUser?: PublicUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  extensionStatus = 'idle',
  extensionVersion = '',
  currentUser,
}) => {
  const navGroups = [
    {
      label: 'MAIN',
      items: [
        {
          name: 'Dashboard',
          to: '/dashboard',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: 'BIDS',
      items: [
        {
          name: 'Analytics',
          to: '/analytics',
          icon: BarChart2,
        },
        {
          name: 'Scanned Projects',
          to: '/scanned-projects',
          icon: Search,
        },
        {
          name: 'Bid History',
          to: '/bid-history',
          icon: FileText,
        },
        {
          name: 'Activity Log',
          to: '/activity-log',
          icon: Activity,
        },
      ],
    },
    {
      label: 'CONFIGURE',
      items: [
        {
          name: 'Overview',
          to: '/overview',
          icon: Layers,
        },
        {
          name: 'Project Filters',
          to: '/project-filters',
          icon: Filter,
        },
        {
          name: 'Bidding Behaviour',
          to: '/bidding-behaviour',
          icon: RotateCcw,
        },
        {
          name: 'AI Prompts',
          to: '/ai-prompts',
          icon: Sparkles,
        },
        {
          name: 'Bidding Profiles',
          to: '/bidding-profiles',
          icon: UserCheck,
        },
        {
          name: 'NDA/IP Signing',
          to: '/nda-ip-signing',
          icon: FileSignature,
        },
      ],
    },
    {
      label: 'TOOLS & DOCS',
      items: [
        {
          name: 'Extension & Code',
          to: '/code',
          icon: Download,
        },
        {
          name: 'Setup Guide',
          to: '/guide',
          icon: BookOpen,
        },
        {
          name: 'Account',
          to: '/account',
          icon: UserCog,
        },
        ...(currentUser?.role === 'admin'
          ? [{ name: 'Admin', to: '/admin', icon: ShieldCheck }]
          : []),
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              FA
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 tracking-tight leading-none">
                Freelancer AutoBid
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      extensionStatus === 'running'
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-rose-500'
                    }`}
                  />
                  Extension {extensionStatus === 'running' ? 'running' : 'stopped'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {extensionVersion}
                </span>
              </div>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            id="btn-close-sidebar"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links Scroll Area */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                {group.label}
              </div>
              <div className="space-y-0.5 pt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      id={`nav-link-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                      onClick={() => {
                        if (onClose) onClose();
                      }}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-blue-50 text-blue-600 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-blue-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{item.name}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/60">
          <div className="px-3 py-2 rounded-lg bg-white border border-slate-200/80 shadow-2xs text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-medium text-slate-700">Autonomous AI Mode</span>
            </div>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                extensionStatus === 'running'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {extensionStatus === 'running' ? 'Active' : 'Stopped'}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
