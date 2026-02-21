// File: AuraEngine/components/social/AccountsConnectPanel.tsx
import React, { useState } from 'react';
import { useOAuthStart } from '../../hooks/useCreatePost';
import { SocialAccount } from '../../hooks/useSocialAccounts';
import {
  FacebookIcon, InstagramIcon, LinkedInIcon, CheckIcon, XIcon, RefreshIcon, PlugIcon,
} from '../Icons';

interface Props {
  accounts: SocialAccount[];
  hasMetaConnected: boolean;
  hasLinkedInConnected: boolean;
  loading: boolean;
  onRefetch: () => void;
  onDisconnect: (id: string) => void;
}

const AccountsConnectPanel: React.FC<Props> = ({
  accounts, hasMetaConnected, hasLinkedInConnected, loading, onRefetch, onDisconnect,
}) => {
  const { startMetaOAuth, startLinkedInOAuth } = useOAuthStart();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async (provider: 'meta' | 'linkedin') => {
    setConnecting(provider);
    setConnectError(null);
    try {
      if (provider === 'meta') await startMetaOAuth();
      else await startLinkedInOAuth();
    } catch (err) {
      setConnecting(null);
      setConnectError(err instanceof Error ? err.message : `Failed to start ${provider === 'meta' ? 'Meta' : 'LinkedIn'} connection.`);
    }
  };

  const metaAccounts = accounts.filter(a => a.provider === 'meta');
  const linkedInAccounts = accounts.filter(a => a.provider === 'linkedin');

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <PlugIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Connected Accounts</h3>
        </div>
        <button onClick={onRefetch} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all">
          <RefreshIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        {connectError && (
          <div className="flex items-center space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
            <XIcon className="w-4 h-4 text-rose-500 shrink-0" />
            <p className="text-xs font-bold text-rose-600">{connectError}</p>
            <button onClick={() => setConnectError(null)} className="ml-auto text-rose-400 hover:text-rose-600 text-sm">&times;</button>
          </div>
        )}
        {/* Meta (Facebook + Instagram) */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FacebookIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Meta (Facebook + Instagram)</p>
              {hasMetaConnected ? (
                <p className="text-[10px] text-emerald-600 font-semibold">
                  {metaAccounts.length} page{metaAccounts.length !== 1 ? 's' : ''} connected
                </p>
              ) : (
                <p className="text-[10px] text-slate-400">Connect your Facebook Pages & Instagram</p>
              )}
            </div>
          </div>
          {hasMetaConnected ? (
            <span className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black">
              <CheckIcon className="w-3 h-3" />
              <span>Connected</span>
            </span>
          ) : (
            <button
              onClick={() => handleConnect('meta')}
              disabled={connecting === 'meta'}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center space-x-1.5"
            >
              {connecting === 'meta' ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <PlugIcon className="w-3.5 h-3.5" />}
              <span>Connect</span>
            </button>
          )}
        </div>

        {/* LinkedIn */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-all">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
              <LinkedInIcon className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">LinkedIn</p>
              {hasLinkedInConnected ? (
                <p className="text-[10px] text-emerald-600 font-semibold">Profile connected</p>
              ) : (
                <p className="text-[10px] text-slate-400">Connect your LinkedIn profile & org page</p>
              )}
            </div>
          </div>
          {hasLinkedInConnected ? (
            <span className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black">
              <CheckIcon className="w-3 h-3" />
              <span>Connected</span>
            </span>
          ) : (
            <button
              onClick={() => handleConnect('linkedin')}
              disabled={connecting === 'linkedin'}
              className="px-4 py-2 bg-sky-700 text-white rounded-xl text-xs font-bold hover:bg-sky-800 transition-all disabled:opacity-40 flex items-center space-x-1.5"
            >
              {connecting === 'linkedin' ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <PlugIcon className="w-3.5 h-3.5" />}
              <span>Connect</span>
            </button>
          )}
        </div>

        {/* Connected account details */}
        {accounts.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Details</p>
            {metaAccounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2">
                  <FacebookIcon className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">{acc.meta_page_name || 'Facebook Page'}</p>
                    {acc.meta_ig_username && (
                      <span className="flex items-center space-x-1 text-[10px] text-pink-500">
                        <InstagramIcon className="w-3 h-3" />
                        <span>@{acc.meta_ig_username}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => onDisconnect(acc.id)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {linkedInAccounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2">
                  <LinkedInIcon className="w-4 h-4 text-sky-700" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">LinkedIn Profile</p>
                    {acc.linkedin_org_name && (
                      <p className="text-[10px] text-slate-500">Org: {acc.linkedin_org_name}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => onDisconnect(acc.id)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountsConnectPanel;
