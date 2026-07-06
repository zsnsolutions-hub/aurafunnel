import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../lib/supabase';
import { generateSocialCaption, SocialPlatform } from '../../lib/gemini';
import {
  RefreshIcon, ArrowLeftIcon, CalendarIcon, ClockIcon, TagIcon,
  LinkedInIcon, TwitterIcon, FacebookIcon, LinkIcon, CopyIcon, SparklesIcon, XIcon, CheckIcon
} from '../../components/Icons';

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // AI Caption state
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [captionPlatform, setCaptionPlatform] = useState<SocialPlatform>('linkedin');
  const [captionText, setCaptionText] = useState('');
  const [captionGenerating, setCaptionGenerating] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(name), profiles(name, avatar_url)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (data) setPost(data);
      setLoading(false);
    };
    if (slug) fetchPost();
  }, [slug]);

  const getPostUrl = () => `${window.location.origin}/#/blog/${post?.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(getPostUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareToLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getPostUrl())}`, '_blank', 'width=600,height=600');
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(getPostUrl())}`, '_blank', 'width=600,height=400');
  };

  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getPostUrl())}`, '_blank', 'width=600,height=600');
  };

  const handleGenerateCaption = async () => {
    setCaptionGenerating(true);
    setCaptionText('');
    setCaptionCopied(false);
    const result = await generateSocialCaption({
      platform: captionPlatform,
      postTitle: post.title,
      postExcerpt: post.excerpt || post.content.substring(0, 200),
      postUrl: getPostUrl(),
    });
    setCaptionText(result.text);
    setCaptionGenerating(false);
  };

  const copyCaptionText = () => {
    navigator.clipboard.writeText(captionText);
    setCaptionCopied(true);
    setTimeout(() => setCaptionCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="bg-[#FBFAF7] py-24 pt-40">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <RefreshIcon className="w-9 h-9 text-teal-600/40 animate-spin mx-auto mb-4" />
          <p className="text-xs font-semibold text-[#A79E90] uppercase tracking-widest">Loading post…</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="bg-[#FBFAF7] py-24 pt-40">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="font-display text-2xl font-medium text-[#1C1A17] mb-4">Post not found</h2>
          <p className="text-[#6F6860] mb-8">The post you’re looking for doesn’t exist or hasn’t been published yet.</p>
          <Link to="/blog" className="inline-flex items-center space-x-2 px-6 py-3 bg-[#1C1A17] text-white rounded-full font-semibold hover:bg-black transition-all">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to blog</span>
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
      {(() => { document.title = seo.title || post.title; return null; })()}

      <article className="bg-[#FBFAF7] text-[#1C1A17] pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          {/* Back link */}
          <Link to="/blog" className="inline-flex items-center space-x-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 mb-10 transition-colors">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to blog</span>
          </Link>

          {/* Category badge */}
          {post.blog_categories?.name && (
            <div className="mb-6">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#EAF2EF] text-teal-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                <TagIcon className="w-3 h-3" />
                <span>{post.blog_categories.name}</span>
              </span>
            </div>
          )}

          {/* Title */}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-[3.25rem] font-medium text-[#1C1A17] tracking-[-0.02em] leading-[1.08] mb-6">
            {post.title}
          </h1>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-lg text-[#6F6860] leading-relaxed mb-8">
              {post.excerpt}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-4 pb-8 mb-8 border-b border-[#EAE3D6]">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-[#EAF2EF] flex items-center justify-center text-teal-700 font-semibold border border-teal-600/10">
                {post.profiles?.name?.charAt(0) || 'S'}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1C1A17]">{post.profiles?.name || 'The Scaliyo team'}</p>
                <p className="text-[10px] text-[#A79E90] font-semibold uppercase tracking-widest">Author</p>
              </div>
            </div>
            {post.published_at && (
              <div className="flex items-center space-x-1.5 text-xs text-[#8A8178]">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>{new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            <div className="flex items-center space-x-1.5 text-xs text-[#8A8178]">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>{readingTime} min read</span>
            </div>

            {/* Share buttons in meta row */}
            <div className="flex items-center space-x-1 ml-auto">
              <button onClick={shareToLinkedIn} title="Share on LinkedIn" className="p-2 text-[#A79E90] hover:text-[#0A66C2] hover:bg-blue-50 rounded-lg transition-all">
                <LinkedInIcon className="w-4 h-4" />
              </button>
              <button onClick={shareToTwitter} title="Share on X / Twitter" className="p-2 text-[#A79E90] hover:text-[#1C1A17] hover:bg-[#F1ECE1] rounded-lg transition-all">
                <TwitterIcon className="w-4 h-4" />
              </button>
              <button onClick={shareToFacebook} title="Share on Facebook" className="p-2 text-[#A79E90] hover:text-[#1877F2] hover:bg-blue-50 rounded-lg transition-all">
                <FacebookIcon className="w-4 h-4" />
              </button>
              <button onClick={copyLink} title="Copy link" className="p-2 text-[#A79E90] hover:text-teal-700 hover:bg-[#EAF2EF] rounded-lg transition-all">
                {copied ? <CheckIcon className="w-4 h-4 text-teal-600" /> : <LinkIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Featured image */}
          {post.featured_image && (
            <div className="mb-10 rounded-[1.5rem] overflow-hidden border border-[#EAE3D6] shadow-chic-sm">
              <img
                src={post.featured_image}
                alt={post.title}
                loading="lazy"
                className="w-full h-auto object-cover max-h-[480px]"
              />
            </div>
          )}

          {/* Content */}
          <div className="prose prose-stone prose-lg max-w-none prose-headings:font-display prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-[#1C1A17] prose-p:text-[#4B453E] prose-li:text-[#4B453E] prose-strong:text-[#1C1A17] prose-a:text-teal-700 prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-code:bg-[#F1ECE1] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-[#1C1A17] prose-pre:text-[#F5F1EA]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content}
            </ReactMarkdown>
          </div>

          {/* Footer with share bar */}
          <div className="mt-12 pt-8 border-t border-[#EAE3D6]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Link to="/blog" className="inline-flex items-center space-x-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800 transition-colors">
                <ArrowLeftIcon className="w-4 h-4" />
                <span>All posts</span>
              </Link>

              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-semibold text-[#A79E90] uppercase tracking-widest mr-2">Share</p>
                <button onClick={shareToLinkedIn} className="flex items-center space-x-1.5 px-3 py-2 bg-[#F5F2EB] hover:bg-[#0A66C2] hover:text-white text-[#6F6860] rounded-xl text-xs font-semibold transition-all border border-[#EAE3D6] hover:border-transparent">
                  <LinkedInIcon className="w-3.5 h-3.5" />
                  <span>LinkedIn</span>
                </button>
                <button onClick={shareToTwitter} className="flex items-center space-x-1.5 px-3 py-2 bg-[#F5F2EB] hover:bg-[#1C1A17] hover:text-white text-[#6F6860] rounded-xl text-xs font-semibold transition-all border border-[#EAE3D6] hover:border-transparent">
                  <TwitterIcon className="w-3.5 h-3.5" />
                  <span>X</span>
                </button>
                <button onClick={shareToFacebook} className="flex items-center space-x-1.5 px-3 py-2 bg-[#F5F2EB] hover:bg-[#1877F2] hover:text-white text-[#6F6860] rounded-xl text-xs font-semibold transition-all border border-[#EAE3D6] hover:border-transparent">
                  <FacebookIcon className="w-3.5 h-3.5" />
                  <span>Facebook</span>
                </button>
                <button onClick={copyLink} className="flex items-center space-x-1.5 px-3 py-2 bg-[#F5F2EB] hover:bg-teal-700 hover:text-white text-[#6F6860] rounded-xl text-xs font-semibold transition-all border border-[#EAE3D6] hover:border-transparent">
                  {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy link'}</span>
                </button>
                <button onClick={() => { setShowCaptionModal(true); setCaptionText(''); setCaptionCopied(false); }} className="flex items-center space-x-1.5 px-3 py-2 bg-[#EDEAF3] hover:bg-[#7C6FB0] hover:text-white text-[#7C6FB0] rounded-xl text-xs font-semibold transition-all border border-[#7C6FB0]/20 hover:border-transparent">
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>AI caption</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* AI Caption Modal */}
      {showCaptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowCaptionModal(false)}>
          <div className="fixed inset-0 bg-[#1C1A17]/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-[1.5rem] shadow-2xl border border-[#EAE3D6] overflow-hidden mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#EAE3D6] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-5 h-5 text-[#7C6FB0]" />
                <h3 className="font-display text-lg font-medium text-[#1C1A17]">Generate social caption</h3>
              </div>
              <button onClick={() => setShowCaptionModal(false)} className="p-1 text-[#A79E90] hover:text-[#1C1A17]">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-[#A79E90] uppercase tracking-widest">Platform</label>
                <div className="flex items-center space-x-2">
                  {([
                    { id: 'linkedin' as SocialPlatform, label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> },
                    { id: 'twitter' as SocialPlatform, label: 'X / Twitter', icon: <TwitterIcon className="w-4 h-4" /> },
                    { id: 'facebook' as SocialPlatform, label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" /> },
                  ]).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setCaptionPlatform(p.id)}
                      className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        captionPlatform === p.id
                          ? 'bg-[#EDEAF3] border-[#7C6FB0]/30 text-[#5e5290]'
                          : 'bg-white border-[#EAE3D6] text-[#8A8178] hover:bg-[#FBFAF7]'
                      }`}
                    >
                      {p.icon}
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerateCaption}
                disabled={captionGenerating}
                className="w-full py-3 bg-[#7C6FB0] text-white rounded-xl font-semibold text-sm hover:bg-[#6a5d9c] transition-all disabled:opacity-40 flex items-center justify-center space-x-2 shadow-chic-sm"
              >
                {captionGenerating ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                <span>{captionGenerating ? 'Generating…' : 'Generate caption'}</span>
              </button>

              {captionText && (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={captionText}
                      onChange={e => setCaptionText(e.target.value)}
                      rows={8}
                      className="w-full p-4 rounded-xl bg-[#FBFAF7] border border-[#EAE3D6] text-sm leading-relaxed resize-none focus:ring-2 focus:ring-[#7C6FB0]/30 focus:border-transparent outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyCaptionText}
                      className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-[#1C1A17] text-white rounded-xl text-sm font-semibold hover:bg-black transition-all"
                    >
                      {captionCopied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                      <span>{captionCopied ? 'Copied!' : 'Copy caption'}</span>
                    </button>
                    <button
                      onClick={() => {
                        const url = captionPlatform === 'linkedin'
                          ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getPostUrl())}`
                          : captionPlatform === 'twitter'
                            ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(captionText)}`
                            : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getPostUrl())}`;
                        window.open(url, '_blank', 'width=600,height=600');
                      }}
                      className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-semibold hover:bg-teal-800 transition-all"
                    >
                      {captionPlatform === 'linkedin' ? <LinkedInIcon className="w-4 h-4" /> : captionPlatform === 'twitter' ? <TwitterIcon className="w-4 h-4" /> : <FacebookIcon className="w-4 h-4" />}
                      <span>Open {captionPlatform === 'linkedin' ? 'LinkedIn' : captionPlatform === 'twitter' ? 'X' : 'Facebook'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-[#A79E90] text-center">Edit the caption above, then copy or share directly.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BlogPostPage;
