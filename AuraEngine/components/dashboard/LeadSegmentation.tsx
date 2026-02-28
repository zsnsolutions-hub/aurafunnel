import React, { useState, useEffect } from 'react';
import { Lead, ManualList } from '../../types';
import { FlameIcon, ClockIcon, BoltIcon, UsersIcon, TagIcon, PlusIcon, XIcon, FolderIcon, TargetIcon, CheckIcon } from '../Icons';

interface LeadSegmentationProps {
  leads: Lead[];
  activeSegmentId: string | null;
  onSegmentSelect: (segmentId: string | null, filteredLeads: Lead[]) => void;
  manualLists: ManualList[];
  onManualListsChange: (lists: ManualList[]) => void;
}

interface SmartSegment {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  filter: (lead: Lead) => boolean;
}

const STORAGE_KEY = 'scaliyo_manual_lists';

const LeadSegmentation: React.FC<LeadSegmentationProps> = ({
  leads,
  activeSegmentId,
  onSegmentSelect,
  manualLists,
  onManualListsChange
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');

  const smartSegments: SmartSegment[] = [
    {
      id: 'hot-leads',
      name: 'Hot Leads',
      icon: <FlameIcon className="w-4 h-4" />,
      color: 'bg-orange-50 text-orange-600',
      filter: (l) => l.score > 75
    },
    {
      id: 'recently-engaged',
      name: 'Recently Engaged',
      icon: <ClockIcon className="w-4 h-4" />,
      color: 'bg-blue-50 text-blue-600',
      filter: (l) => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return (new Date().getTime() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
      }
    },
    {
      id: 'stagnant',
      name: 'Stagnant Leads',
      icon: <BoltIcon className="w-4 h-4" />,
      color: 'bg-red-50 text-red-600',
      filter: (l) => {
        if (!l.created_at) return false;
        const d = new Date(l.created_at);
        return (new Date().getTime() - d.getTime()) > 30 * 24 * 60 * 60 * 1000 && l.status !== 'Qualified';
      }
    },
    {
      id: 'high-value-companies',
      name: 'High-Value Companies',
      icon: <UsersIcon className="w-4 h-4" />,
      color: 'bg-purple-50 text-purple-600',
      filter: (l) => {
        const companyCount = l.company ? leads.filter(other => other.company && other.company.toLowerCase() === l.company.toLowerCase()).length : 0;
        return companyCount > 1;
      }
    },
    {
      id: 'new-status',
      name: 'New Leads',
      icon: <TargetIcon className="w-4 h-4" />,
      color: 'bg-emerald-50 text-emerald-600',
      filter: (l) => l.status === 'New'
    },
    {
      id: 'qualified-status',
      name: 'Qualified',
      icon: <CheckIcon className="w-4 h-4" />,
      color: 'bg-indigo-50 text-indigo-600',
      filter: (l) => l.status === 'Qualified'
    }
  ];

  const handleSegmentClick = (segmentId: string, filterFn: (lead: Lead) => boolean) => {
    if (activeSegmentId === segmentId) {
      onSegmentSelect(null, leads);
    } else {
      onSegmentSelect(segmentId, leads.filter(filterFn));
    }
  };

  const handleManualListClick = (list: ManualList) => {
    const listSegmentId = `manual-${list.id}`;
    if (activeSegmentId === listSegmentId) {
      onSegmentSelect(null, leads);
    } else {
      const filtered = leads.filter(l => list.leadIds.includes(l.id));
      onSegmentSelect(listSegmentId, filtered);
    }
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const newList: ManualList = {
      id: Date.now().toString(),
      name: newListName.trim(),
      leadIds: [],
      createdAt: new Date().toISOString()
    };
    const updated = [...manualLists, newList];
    onManualListsChange(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
    setNewListName('');
    setIsCreating(false);
  };

  const handleDeleteList = (listId: string) => {
    const updated = manualLists.filter(l => l.id !== listId);
    onManualListsChange(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
    if (activeSegmentId === `manual-${listId}`) {
      onSegmentSelect(null, leads);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <TagIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 font-heading text-sm">Segments</h3>
            <p className="text-[10px] text-slate-400">Filter leads by criteria</p>
          </div>
        </div>
        {activeSegmentId && (
          <button
            onClick={() => onSegmentSelect(null, leads)}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
          >
            Clear
          </button>
        )}
      </div>

      <div className="p-4 space-y-1">
        {/* Smart Lists */}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-2">Smart Lists</p>
        {smartSegments.map(seg => {
          const count = leads.filter(seg.filter).length;
          const isActive = activeSegmentId === seg.id;
          return (
            <button
              key={seg.id}
              onClick={() => handleSegmentClick(seg.id, seg.filter)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left ${
                isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${seg.color}`}>
                  {seg.icon}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>{seg.name}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>{count}</span>
            </button>
          );
        })}

        {/* Divider */}
        <div className="border-t border-slate-100 my-3"></div>

        {/* Manual Lists */}
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manual Lists</p>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>

        {isCreating && (
          <div className="flex items-center space-x-2 px-2 animate-in fade-in duration-200">
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
              placeholder="List name..."
              className="flex-grow p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-300"
              autoFocus
            />
            <button onClick={handleCreateList} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
              <CheckIcon className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setIsCreating(false); setNewListName(''); }} className="p-2 text-slate-400 hover:text-slate-600">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {manualLists.length > 0 ? (
          manualLists.map(list => {
            const listSegmentId = `manual-${list.id}`;
            const isActive = activeSegmentId === listSegmentId;
            return (
              <div
                key={list.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group ${
                  isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <button
                  onClick={() => handleManualListClick(list)}
                  className="flex items-center space-x-3 flex-grow text-left"
                >
                  <div className="w-7 h-7 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                    <FolderIcon className="w-4 h-4" />
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>{list.name}</span>
                </button>
                <div className="flex items-center space-x-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>{list.leadIds.length}</span>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        ) : !isCreating ? (
          <p className="px-3 py-3 text-xs text-slate-300 italic">No custom lists yet</p>
        ) : null}
      </div>
    </div>
  );
};

export default React.memo(LeadSegmentation);
