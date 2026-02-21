// File: AuraEngine/components/social/PublishStatusTable.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  FacebookIcon, InstagramIcon, LinkedInIcon, CheckIcon, XIcon,
  ClockIcon, RefreshIcon, ActivityIcon, AlertTriangleIcon, CursorClickIcon,
} from '../Icons';

interface PostWithTargets {
  id: string;
  content_text: string;
  link_url: string | null;
  status: string;
  scheduled_at: string | null;
  timezone: string;
  created_at: string;
  clickCount: number;
  targets: {
    id: string;
    channel: string;
    target_label: string | null;
    status: string;
    remote_post_id: string | null;
    error_message: string | null;
    published_at: string | null;
  }[];
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  facebook_page: <FacebookIcon className="w-3.5 h-3.5 text-blue-600" />,
  instagram: <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />,
  linkedin_member: <LinkedInIcon className="w-3.5 h-3.5 text-sky-700" />,
  linkedin_org: <LinkedInIcon className="w-3.5 h-3.5 text-sky-700" />,
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'bg-slate-100 text-slate-600', icon: <ClockIcon className="w-3 h-3" />, label: 'Pending' },
  scheduled: { color: 'bg-amber-100 text-amber-700', icon: <ClockIcon className="w-3 h-3" />, label: 'Scheduled' },
  processing: { color: 'bg-blue-100 text-blue-700', icon: <RefreshIcon className="w-3 h-3 animate-spin" />, label: 'Processing' },
  published: { color: 'bg-emerald-100 text-emerald-700', icon: <CheckIcon className="w-3 h-3" />, label: 'Published' },
  completed: { color: 'bg-emerald-100 text-emerald-700', icon: <CheckIcon className="w-3 h-3" />, label: 'Completed' },
  failed: { color: 'bg-rose-100 text-rose-600', icon: <XIcon className="w-3 h-3" />, label: 'Failed' },
  draft: { color: 'bg-slate-100 text-slate-500', icon: <ClockIcon className="w-3 h-3" />, label: 'Draft' },
};

interface Props {
  userId: string;
  refreshKey: number;
}

const PublishStatusTable: React.FC<Props> = ({ userId, refreshKey }) => {
  const [posts, setPosts] = useState<PostWithTargets[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const { data: postsData } = await supabase
          .from('social_posts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!postsData || postsData.length === 0) {
          setPosts([]);
          return;
        }

        const postIds = postsData.map(p => p.id);
        const { data: targetsData } = await supabase
          .from('social_post_targets')
          .select('*')
          .in('post_id', postIds)
          .order('created_at', { ascending: true });

        // Fetch click analytics: tracking_links → tracking_events
        let clickCounts: Record<string, number> = {};
        const { data: linksData } = await supabase
          .from('tracking_links')
          .select('id, post_id')
          .in('post_id', postIds);

        if (linksData && linksData.length > 0) {
          const linkIds = linksData.map(l => l.id);
          const linkToPost: Record<string, string> = {};
          linksData.forEach(l => { if (l.post_id) linkToPost[l.id] = l.post_id; });

          const { data: eventsData } = await supabase
            .from('tracking_events')
            .select('link_id')
            .in('link_id', linkIds);

          if (eventsData) {
            eventsData.forEach(ev => {
              const postId = linkToPost[ev.link_id];
              if (postId) {
                clickCounts[postId] = (clickCounts[postId] || 0) + 1;
              }
            });
          }
        }

        const merged = postsData.map(p => ({
          ...p,
          targets: (targetsData || []).filter(t => t.post_id === p.id),
          clickCount: clickCounts[p.id] || 0,
        }));

        setPosts(merged);
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [userId, refreshKey]);

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ActivityIcon className="w-4 h-4 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Post History</h3>
        </div>
        <span className="text-[10px] text-slate-400 font-bold">{posts.length} post{posts.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="p-12 text-center">
          <ActivityIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">No posts yet</p>
          <p className="text-xs text-slate-400 mt-1">Compose and publish your first social post above</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {posts.map(post => (
            <div key={post.id}>
              <button
                onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {post.content_text.substring(0, 80)}{post.content_text.length > 80 ? '...' : ''}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-[10px] text-slate-400">
                      {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {post.scheduled_at && (
                      <span className="text-[10px] text-amber-500 font-semibold">
                        Scheduled: {new Date(post.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <div className="flex -space-x-1">
                    {post.targets.slice(0, 4).map(t => (
                      <span key={t.id} className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                        {CHANNEL_ICONS[t.channel]}
                      </span>
                    ))}
                  </div>
                  {post.clickCount > 0 && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-100 text-violet-700">
                      <CursorClickIcon className="w-3 h-3" />
                      <span>{post.clickCount} click{post.clickCount !== 1 ? 's' : ''}</span>
                    </span>
                  )}
                  {getStatusBadge(post.status)}
                </div>
              </button>

              {expandedId === post.id && (
                <div className="px-6 pb-4 space-y-2">
                  {post.targets.map(target => (
                    <div key={target.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center space-x-2">
                        {CHANNEL_ICONS[target.channel]}
                        <div>
                          <p className="text-xs font-bold text-slate-700">{target.target_label || target.channel}</p>
                          {target.published_at && (
                            <p className="text-[9px] text-slate-400">
                              Published {new Date(target.published_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {target.error_message && (
                          <span className="flex items-center space-x-1 text-[10px] text-rose-500" title={target.error_message}>
                            <AlertTriangleIcon className="w-3 h-3" />
                            <span className="max-w-[150px] truncate">{target.error_message}</span>
                          </span>
                        )}
                        {getStatusBadge(target.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PublishStatusTable;
