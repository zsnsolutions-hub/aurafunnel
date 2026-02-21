// File: AuraEngine/pages/portal/SocialScheduler.tsx
import React, { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
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
} from '../../components/Icons';

const SocialScheduler: React.FC = () => {
  const { user } = useOutletContext<{ user: User; refreshProfile: () => Promise<void> }>();

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

  const resetForm = useCallback(() => {
    setContentText('');
    setLinkUrl('');
    setTrackClicks(false);
    setMediaPaths([]);
    setSelectedTargets([]);
    setScheduledDate('');
    setScheduledTime('');
    setMode('now');
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

  const error = publishError || scheduleError;
  const isSubmitting = publishing || scheduling;

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

      {/* ─── Connected Accounts ─── */}
      <AccountsConnectPanel
        accounts={accounts}
        hasMetaConnected={hasMetaConnected}
        hasLinkedInConnected={hasLinkedInConnected}
        loading={accountsLoading}
        onRefetch={refetchAccounts}
        onDisconnect={disconnectAccount}
      />

      {/* ─── Main compose grid ─── */}
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

      {/* ─── Post History ─── */}
      <PublishStatusTable userId={user.id} refreshKey={refreshKey} />
    </div>
  );
};

export default SocialScheduler;
