import React from 'react';
import { Drawer } from '../ui/Drawer';
import { SendIcon, UsersIcon, ArrowLeftIcon } from '../Icons';
import type { CampaignSummary, CampaignRecipient } from '../../lib/emailTracking';

interface CampaignsDrawerProps {
  open: boolean;
  onClose: () => void;
  history: CampaignSummary[];
  historyLoading: boolean;
  recipients: CampaignRecipient[];
  recipientsLoading: boolean;
  selectedCampaignId: string | null;
  onSelectCampaign: (id: string | null) => void;
  onClearRecipients: () => void;
}

export const CampaignsDrawer: React.FC<CampaignsDrawerProps> = ({
  open,
  onClose,
  history,
  historyLoading,
  recipients,
  recipientsLoading,
  selectedCampaignId,
  onSelectCampaign,
  onClearRecipients,
}) => {
  const selectedCampaign = selectedCampaignId
    ? history.find((c) => c.sequence_id === selectedCampaignId) ?? null
    : null;

  const handleBack = () => {
    onSelectCampaign(null);
    onClearRecipients();
  };

  const getStatusBadge = (campaign: CampaignSummary) => {
    if (campaign.failed_count > 0) {
      return (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          {campaign.failed_count} failed
        </span>
      );
    }
    if (campaign.pending_count > 0) {
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          {campaign.pending_count} pending
        </span>
      );
    }
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        All sent
      </span>
    );
  };

  const getBlockStatusDot = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-emerald-500';
      case 'pending':
        return 'bg-amber-400';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  // Summary stats
  const totalRecipients = history.reduce((sum, c) => sum + c.recipient_count, 0);
  const totalSent = history.reduce((sum, c) => sum + c.sent_count, 0);
  const totalBlocks = history.reduce((sum, c) => sum + c.block_count, 0);

  return (
    <Drawer open={open} onClose={onClose}>
      {/* Custom header */}
      <div className="-mx-6 -mt-6 mb-4 border-b border-gray-100 px-6 py-4">
        {selectedCampaignId ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-gray-900">
                {selectedCampaign?.subject || 'Campaign Details'}
              </h2>
              <p className="text-xs text-gray-400">
                {selectedCampaign
                  ? `${selectedCampaign.recipient_count} recipients \u00b7 ${selectedCampaign.block_count} blocks`
                  : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <SendIcon className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Campaigns</h2>
              <p className="text-xs text-gray-400">{history.length} campaigns sent</p>
            </div>
          </div>
        )}
      </div>

      {!selectedCampaignId ? (
        /* ── Campaign List View ── */
        <div className="space-y-5">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">Campaigns</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{history.length}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">Recipients</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{totalRecipients.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-xs font-medium text-gray-500">Emails Sent</p>
              <p className="mt-1 text-lg font-bold text-indigo-600">{totalSent.toLocaleString()}</p>
            </div>
          </div>

          {/* Campaign Cards */}
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center">
              <SendIcon className="mx-auto mb-3 w-8 h-8 text-gray-300" />
              <p className="text-sm text-gray-500">No campaigns yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((campaign) => (
                <button
                  key={campaign.sequence_id}
                  onClick={() => onSelectCampaign(campaign.sequence_id)}
                  className="w-full rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:border-indigo-200 hover:shadow-md transition-all duration-150"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {campaign.subject || '(No subject)'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <UsersIcon className="w-3 h-3" />
                          {campaign.recipient_count}
                        </span>
                        <span>{campaign.block_count} blocks</span>
                        <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {getStatusBadge(campaign)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Campaign Detail View ── */
        <div className="space-y-5">
          {/* Campaign Header Stats */}
          {selectedCampaign && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs font-medium text-gray-500">Sent</p>
                <p className="mt-1 text-lg font-bold text-emerald-600">
                  {selectedCampaign.sent_count}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs font-medium text-gray-500">Pending</p>
                <p className="mt-1 text-lg font-bold text-amber-600">
                  {selectedCampaign.pending_count}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-xs font-medium text-gray-500">Failed</p>
                <p className="mt-1 text-lg font-bold text-red-600">
                  {selectedCampaign.failed_count}
                </p>
              </div>
            </div>
          )}

          {/* Recipients */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Recipients</h3>
            {recipientsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
              </div>
            ) : recipients.length === 0 ? (
              <div className="py-8 text-center">
                <UsersIcon className="mx-auto mb-3 w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-500">No recipients found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recipients.map((r) => (
                  <div
                    key={r.lead_id}
                    className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {r.lead_name || r.lead_email}
                        </p>
                        <p className="truncate text-xs text-gray-400">
                          {r.lead_company || r.lead_email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Score badge */}
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {r.lead_score}
                        </span>
                      </div>
                    </div>
                    {/* Block status dots */}
                    <div className="mt-2 flex items-center gap-1.5">
                      {r.blocks.map((block) => (
                        <div
                          key={block.block_index}
                          className={`h-2.5 w-2.5 rounded-full ${getBlockStatusDot(block.status)}`}
                          title={`Block ${block.block_index + 1}: ${block.status}`}
                        />
                      ))}
                      <span className="ml-1 text-[10px] text-gray-400">
                        {r.blocks.filter((b) => b.status === 'sent').length}/{r.blocks.length} sent
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};
