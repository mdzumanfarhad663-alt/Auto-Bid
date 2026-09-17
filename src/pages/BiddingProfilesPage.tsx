import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { UserCheck, Plus, X, Globe, Save, CheckCircle2 } from 'lucide-react';
import { FilterConfig } from '../types.ts';

interface OutletContextType {
  config: FilterConfig;
  onUpdateConfig: (updated: Partial<FilterConfig>) => void;
}

export const BiddingProfilesPage: React.FC = () => {
  const { config, onUpdateConfig } = useOutletContext<OutletContextType>();
  const [skills, setSkills] = useState<string[]>(config.freelancerSkills || []);
  const [newSkill, setNewSkill] = useState('');
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>(config.portfolioLinks || []);
  const [newLink, setNewLink] = useState('');
  const [saved, setSaved] = useState(false);

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (s: string) => {
    setSkills(skills.filter((item) => item !== s));
  };

  const handleAddLink = () => {
    if (newLink.trim() && !portfolioLinks.includes(newLink.trim())) {
      setPortfolioLinks([...portfolioLinks, newLink.trim()]);
      setNewLink('');
    }
  };

  const handleRemoveLink = (l: string) => {
    setPortfolioLinks(portfolioLinks.filter((item) => item !== l));
  };

  const handleSave = () => {
    onUpdateConfig({
      freelancerSkills: skills,
      portfolioLinks: portfolioLinks,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div id="bidding-profiles-page" className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bidding Profiles &amp; Expertise
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your personal verified skills, case studies, and live portfolio URLs injected into proposals
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
        >
          {saved ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Saved!' : 'Save Profile'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verified Freelancer Skills */}
        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Core Skills &amp; Specialties ({skills.length})
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            These skills are referenced by the AI to build relevant experience proof.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
              placeholder="Add skill (e.g. Next.js, Node.js)"
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleAddSkill}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2">
            {skills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
              >
                <span>{s}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(s)}
                  className="text-blue-400 hover:text-blue-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Portfolio & Case Study Proof Links */}
        <div className="p-6 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Portfolio &amp; GitHub Proof Links ({portfolioLinks.length})
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Real portfolio URLs inserted into proposals as proof of previous client work.
          </p>

          <div className="flex gap-2">
            <input
              type="url"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
              placeholder="https://github.com/my-profile"
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleAddLink}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 pt-2">
            {portfolioLinks.map((link) => (
              <div
                key={link}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700"
              >
                <div className="flex items-center gap-2 truncate">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate font-mono">{link}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLink(link)}
                  className="text-slate-400 hover:text-rose-600 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
