// File: AuraEngine/pages/portal/SocialScheduler.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { User } from '../../types';
import { useSocialAccounts, PublishTarget } from '../../hooks/useSocialAccounts';
import { usePublishNow, useSchedulePost } from '../../hooks/useCreatePost';
import AccountsConnectPanel from '../../components/social/AccountsConnectPanel';
import Composer from '../../components/social/Composer';
import TargetPicker from '../../components/social/TargetPicker';
import MediaUploader from '../../components/social/MediaUploader';
import SchedulePicker from '../../components/social/SchedulePicker';
import PostPreview from '../../components/social/PostPreview';
import PublishStatusTable from '../../components/social/PublishStatusTable';
import {
  SendIcon, CalendarIcon, CheckIcon, AlertTriangleIcon, RefreshIcon,
  EditIcon, ActivityIcon, PlugIcon, KeyboardIcon, XIcon,
} from '../../components/Icons';

const DRAFT_KEY = 'aurafunnel_social_draft';

const SocialScheduler: React.FC = () => {
  const { user } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();
  const location = useLocation();
  const navigate = useNavigate();

  // ─── Tab navigation ───
  const [activeView, setActiveView] = useState<'compose' | 'history' | 'accounts'>('compose');

  // ─── Keyboard shortcuts modal ───
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ─── Draft saved indicator ───
  const [draftSaved, setDraftSaved] = useState(false);

  // ─── Social accounts ───
  const {
    accounts, availableTargets, hasMetaConnected, hasLinkedInConnected,
    loading: accountsLoading, refetch: refetchAccounts, disconnectAccount,
  } = useSocialAccounts(user.id);

  // ─── Compose state ───
  const [contentText, setContentText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [trackClicks, setTrackClicks] = useState(false);
  const [mediaPaths, setMediaPaths] = useState<string[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<PublishTarget[]>([]);

  // ─── Schedule state ───
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [timezone, setTimezone] = useState('Asia/Karachi');

  // ─── Publish / schedule hooks ───
  const { publishNow, publishing, error: publishError, result: publishResult } = usePublishNow();
  const { schedulePost, scheduling, error: scheduleError, result: scheduleResult } = useSchedulePost();

  // ─── Post history refresh key ───
  const [refreshKey, setRefreshKey] = useState(0);

  // ─── Success / feedback state ───
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ─── Restore draft on mount (router state takes priority) ───
  const draftRestored = useRef(false);
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;

    const routerState = location.state as { content?: string; linkUrl?: string } | null;
    if (routerState?.content) {
      setContentText(routerState.content);
      if (routerState.linkUrl) setLinkUrl(routerState.linkUrl);
      // Clear router state so refresh doesn't re-populate
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.contentText) setContentText(draft.contentText);
        if (draft.linkUrl) setLinkUrl(draft.linkUrl);
        if (draft.trackClicks !== undefined) setTrackClicks(draft.trackClicks);
      }
    } catch { /* ignore */ }
  }, []);

  // ─── Debounced draft saving ───
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!draftRestored.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (contentText || linkUrl) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ contentText, linkUrl, trackClicks }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [contentText, linkUrl, trackClicks]);

  const resetForm = useCallback(() => {
    setContentText('');
    setLinkUrl('');
    setTrackClicks(false);
    setMediaPaths([]);
    setSelectedTargets([]);
    setScheduledDate('');
    setScheduledTime('');
    setMode('now');
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  const canPublish = contentText.trim().length > 0 && selectedTargets.length > 0;

  const handlePublish = async () => {
    if (!canPublish) return;
    setSuccessMsg(null);

    const payload = {
      content_text: contentText,
      link_url: linkUrl || undefined,
      media_paths: mediaPaths.length > 0 ? mediaPaths : undefined,
      targets: selectedTargets.map(t => ({
        channel: t.channel,
        target_id: t.target_id,
        target_label: t.target_label,
      })),
      track_clicks: trackClicks,
    };

    if (mode === 'scheduled') {
      if (!scheduledDate || !scheduledTime) return;
      const scheduled_at = `${scheduledDate}T${scheduledTime}:00`;
      const res = await schedulePost({ ...payload, scheduled_at, timezone });
      if (res) {
        setSuccessMsg('Post scheduled successfully!');
        resetForm();
        setRefreshKey(k => k + 1);
      }
    } else {
      const res = await publishNow(payload);
      if (res) {
        setSuccessMsg('Post published successfully!');
        resetForm();
        setRefreshKey(k => k + 1);
      }
    }
  };

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;

      switch (e.key) {
        case '1': setActiveView('compose'); break;
        case '2': setActiveView('history'); break;
        case '3': setActiveView('accounts'); break;
        case 'n': case 'N':
          setActiveView('compose');
          resetForm();
          break;
        case '?': setShowShortcuts(prev => !prev); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetForm]);

  const error = publishError || scheduleError;
  const isSubmitting = publishing || scheduling;

  const tabs = [
    { id: 'compose' as const, label: 'Compose', icon: <EditIcon className="w-4 h-4" /> },
    { id: 'history' as const, label: 'Post History', icon: <ActivityIcon className="w-4 h-4" /> },
    { id: 'accounts' as const, label: 'Accounts', icon: <PlugIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Social Scheduler</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Compose, schedule, and publish to Facebook, Instagram & LinkedIn
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {draftSaved && (
            <span className="text-[10px] font-bold text-emerald-500 animate-in fade-in duration-300">
              Draft saved
            </span>
          )}
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-2 rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
            title="Keyboard shortcuts (?)"
          >
            <KeyboardIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── Success toast ─── */}
      {successMsg && (
        <div className="flex items-center space-x-2 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-bold text-emerald-700">{successMsg}</p>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            &times;
          </button>
        </div>
      )}

      {/* ─── Error banner ─── */}
      {error && (
        <div className="flex items-center space-x-2 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertTriangleIcon className="w-5 h-5 text-rose-500 shrink-0" />
          <p className="text-sm font-bold text-rose-600">{error}</p>
        </div>
      )}

      {/* ─── Tab Navigation ─── */}
      <div className="flex items-center space-x-1 bg-slate-50 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeView === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── VIEW: Compose ─── */}
      {activeView === 'compose' && (
        <>
          {/* Main compose grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: Compose + Targets + Media */}
            <div className="lg:col-span-2 space-y-6">
              <Composer
                contentText={contentText}
                setContentText={setContentText}
                linkUrl={linkUrl}
                setLinkUrl={setLinkUrl}
                trackClicks={trackClicks}
                setTrackClicks={setTrackClicks}
                userId={user.id}
                businessProfile={user.businessProfile}
              />

              <TargetPicker
                availableTargets={availableTargets}
                selectedTargets={selectedTargets}
                setSelectedTargets={setSelectedTargets}
              />

              <MediaUploader
                userId={user.id}
                mediaPaths={mediaPaths}
                setMediaPaths={setMediaPaths}
              />
            </div>

            {/* Right column: Schedule + Preview */}
            <div className="space-y-6">
              <SchedulePicker
                mode={mode}
                setMode={setMode}
                scheduledDate={scheduledDate}
                setScheduledDate={setScheduledDate}
                scheduledTime={scheduledTime}
                setScheduledTime={setScheduledTime}
                timezone={timezone}
                setTimezone={setTimezone}
              />

              <PostPreview
                contentText={contentText}
                linkUrl={linkUrl}
                mediaPaths={mediaPaths}
                selectedTargets={selectedTargets}
                mode={mode}
                scheduledDate={scheduledDate}
                scheduledTime={scheduledTime}
                timezone={timezone}
              />

              {/* Publish button */}
              <button
                onClick={handlePublish}
                disabled={!canPublish || isSubmitting}
                className={`w-full flex items-center justify-center space-x-2 px-6 py-4 rounded-2xl text-sm font-black transition-all duration-200 ${
                  canPublish && !isSubmitting
                    ? mode === 'scheduled'
                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshIcon className="w-4 h-4 animate-spin" />
                    <span>{mode === 'scheduled' ? 'Scheduling...' : 'Publishing...'}</span>
                  </>
                ) : mode === 'scheduled' ? (
                  <>
                    <CalendarIcon className="w-4 h-4" />
                    <span>Schedule Post</span>
                  </>
                ) : (
                  <>
                    <SendIcon className="w-4 h-4" />
                    <span>Publish Now</span>
                  </>
                )}
              </button>

              {!canPublish && contentText.trim().length === 0 && selectedTargets.length === 0 && (
                <p className="text-[10px] text-slate-400 text-center">
                  Write content and select at least one target to publish
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── VIEW: Post History ─── */}
      {activeView === 'history' && (
        <PublishStatusTable userId={user.id} refreshKey={refreshKey} />
      )}

      {/* ─── VIEW: Accounts ─── */}
      {activeView === 'accounts' && (
        <AccountsConnectPanel
          accounts={accounts}
          hasMetaConnected={hasMetaConnected}
          hasLinkedInConnected={hasLinkedInConnected}
          loading={accountsLoading}
          onRefetch={refetchAccounts}
          onDisconnect={disconnectAccount}
        />
      )}

      {/* ─── Keyboard Shortcuts Modal ─── */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <KeyboardIcon className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Keyboard Shortcuts</h3>
              </div>
              <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-600">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {[
                { keys: '1', desc: 'Compose tab' },
                { keys: '2', desc: 'Post History tab' },
                { keys: '3', desc: 'Accounts tab' },
                { keys: 'N', desc: 'New post (clear form)' },
                { keys: '?', desc: 'Toggle this help' },
              ].map(s => (
                <div key={s.keys} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-600">{s.desc}</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-slate-500 min-w-[28px] text-center">
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialScheduler;
