import React, { useState } from 'react';
import { Search, UserCircle, ArrowRight } from 'lucide-react';
import { searchUsers, TargetProfile } from '../../../lib/support';
import { useSupport } from '../../../components/support/SupportProvider';

interface Props {
  onSessionStarted: () => void;
}

const WorkspaceBrowserTab: React.FC<Props> = ({ onSessionStarted }) => {
  const { startSession, activeSession } = useSupport();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TargetProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedUser, setSelectedUser] = useState<TargetProfile | null>(null);
  const [starting, setStarting] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const users = await searchUsers(query.trim());
      setResults(users);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!selectedUser || !reason.trim()) return;
    setStarting(true);
    try {
      await startSession(selectedUser.id, reason.trim());
      onSessionStarted();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">Search Users</h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">{results.length} Users Found</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {results.map((user) => (
              <div
                key={user.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                  selectedUser?.id === user.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''
                }`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <UserCircle size={24} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{user.name || 'Unnamed'}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className={`px-2.5 py-1 rounded-full font-bold ${
                    user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'CLIENT' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {user.role}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full font-bold ${
                    user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.status}
                  </span>
                  <span className="text-slate-400 font-bold">{user.plan}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start session panel */}
      {selectedUser && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4">
            Enter Support Mode for {selectedUser.name || selectedUser.email}
          </h3>
          {activeSession && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
              You have an active session. Starting a new one will end the current session.
            </div>
          )}
          <div className="space-y-3">
            <textarea
              placeholder="Reason for access (required)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
            />
            <button
              onClick={handleStartSession}
              disabled={starting || !reason.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {starting ? 'Starting...' : 'Enter Support Mode'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceBrowserTab;
