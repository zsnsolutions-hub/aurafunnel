import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../lib/supabase';
import { RefreshIcon, ArrowLeftIcon, CalendarIcon, ClockIcon, TagIcon } from '../../components/Icons';

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(name), profiles(name, email)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (data) setPost(data);
      setLoading(false);
    };
    if (slug) fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="bg-white py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <RefreshIcon className="w-10 h-10 text-indigo-100 animate-spin mx-auto mb-4" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading Post...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="bg-white py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Post Not Found</h2>
          <p className="text-slate-500 mb-8">The post you're looking for doesn't exist or hasn't been published yet.</p>
          <Link to="/blog" className="inline-flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to Blog</span>
          </Link>
        </div>
      </div>
    );
  }

  const wordCount = post.content?.trim().split(/\s+/).length || 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const seo = post.seo_settings || {};

  return (
    <>
      {/* SEO meta via document.title */}
      {(() => { document.title = seo.title || post.title; return null; })()}

      <article className="bg-white py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          {/* Back link */}
          <Link to="/blog" className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 mb-10 transition-colors">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to Blog</span>
          </Link>

          {/* Category badge */}
          {post.blog_categories?.name && (
            <div className="mb-6">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                <TagIcon className="w-3 h-3" />
                <span>{post.blog_categories.name}</span>
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 font-heading tracking-tight leading-tight mb-6">
            {post.title}
          </h1>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-lg text-slate-500 leading-relaxed italic mb-8">
              {post.excerpt}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 pb-8 mb-8 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold border border-indigo-100">
                {post.profiles?.name?.charAt(0) || 'A'}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{post.profiles?.name || 'Aura Contributor'}</p>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Author</p>
              </div>
            </div>
            {post.published_at && (
              <div className="flex items-center space-x-1.5 text-xs text-slate-500">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>{new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            <div className="flex items-center space-x-1.5 text-xs text-slate-500">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>{readingTime} min read</span>
            </div>
          </div>

          {/* Featured image */}
          {post.featured_image && (
            <div className="mb-10 rounded-2xl overflow-hidden shadow-lg">
              <img
                src={post.featured_image}
                alt={post.title}
                className="w-full h-auto object-cover max-h-[480px]"
              />
            </div>
          )}

          {/* Content */}
          <div className="prose prose-slate prose-lg max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-slate-900 prose-pre:text-slate-100">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content}
            </ReactMarkdown>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
            <Link to="/blog" className="inline-flex items-center space-x-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
              <ArrowLeftIcon className="w-4 h-4" />
              <span>All Posts</span>
            </Link>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {wordCount} words
            </p>
          </div>
        </div>
      </article>
    </>
  );
};

export default BlogPostPage;
