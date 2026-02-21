import React, { useState } from 'react';
import { Send } from 'lucide-react';
import type { Comment } from '../teamHubApi';

interface CommentsProps {
  comments: Comment[];
  onAdd: (body: string) => void;
  userName: string;
}

const Comments: React.FC<CommentsProps> = ({ comments, onAdd, userName }) => {
  const [body, setBody] = useState('');

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setBody('');
  };

  return (
    <div>
      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
        Comments ({comments.length})
      </h4>

      {/* Comment input */}
      <div className="flex items-start gap-2 mb-4">
        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600 shrink-0 mt-0.5">
          {userName?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Write a comment..."
            rows={2}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all placeholder-slate-400"
          />
          <div className="flex justify-end mt-1">
            <button
              onClick={handleSubmit}
              disabled={!body.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={12} />
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Comment list */}
      <div className="space-y-3">
        {comments.map(comment => (
          <div key={comment.id} className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 shrink-0 mt-0.5">
              {(comment.user_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-slate-700">
                  {comment.user_name || 'User'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(comment.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                {comment.body}
              </p>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-3">No comments yet</p>
        )}
      </div>
    </div>
  );
};

export default Comments;
