import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { RefreshIcon } from '../../components/Icons';

const BlogPage: React.FC = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(name), profiles(name)')
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (data) setPosts(data);
      setLoading(false);
    };
    fetchPosts();
  }, []);

  return (
    <div className="bg-[#FBFAF7] text-[#1C1A17] pt-36 pb-24">
      <div className="mx-auto max-w-[1180px] px-6">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <p className="eyebrow text-teal-700 mb-4">Resources</p>
          <h1 className="font-display text-4xl sm:text-[3.5rem] leading-[1.05] font-medium tracking-[-0.02em] text-[#1C1A17]">
            The Scaliyo blog
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#6F6860]">
            Field notes on AI-driven growth, the psychology of great outreach, and building a modern sales motion.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshIcon className="w-9 h-9 text-teal-600/40 animate-spin mx-auto mb-4" />
            <p className="text-xs font-semibold text-[#A79E90] uppercase tracking-widest">Loading posts…</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-10 gap-y-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="flex flex-col items-start group">
                <div className="relative w-full overflow-hidden rounded-[1.75rem] bg-[#F1ECE1] aspect-[16/9] mb-7 border border-[#EAE3D6] shadow-chic-sm transition-all group-hover:shadow-chic group-hover:-translate-y-1 duration-500">
                  <img
                    src={post.featured_image || `https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800&seed=${post.id}`}
                    alt={post.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute top-5 left-5">
                    <span className="bg-white/90 backdrop-blur-md text-[9px] font-bold uppercase tracking-widest text-[#1C1A17] px-3.5 py-1.5 rounded-full shadow-sm">
                      {post.blog_categories?.name || 'Scaliyo'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-x-4 text-xs mb-3">
                  <time dateTime={post.published_at} className="text-[#A79E90] font-semibold uppercase tracking-widest">
                    {new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </time>
                </div>
                <div className="relative group">
                  <h3 className="font-display text-2xl font-medium leading-snug text-[#1C1A17] group-hover:text-teal-700 transition-colors">
                    <Link to={`/blog/${post.slug}`}>
                      <span className="absolute inset-0" />
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[#6F6860]">
                    {post.excerpt || `${post.content.substring(0, 120)}…`}
                  </p>
                </div>
                <div className="relative mt-7 flex items-center gap-x-3">
                  <div className="h-10 w-10 rounded-full bg-[#EAF2EF] flex items-center justify-center font-semibold text-teal-700 border border-teal-600/10 uppercase">
                    {post.profiles?.name?.charAt(0) || 'S'}
                  </div>
                  <div className="text-sm leading-6">
                    <p className="font-semibold text-[#1C1A17]">
                      {post.profiles?.name || 'The Scaliyo team'}
                    </p>
                    <p className="text-[10px] text-[#A79E90] font-semibold uppercase tracking-widest">Author</p>
                  </div>
                </div>
              </article>
            ))}
            {posts.length === 0 && (
              <div className="lg:col-span-3 py-28 text-center border border-dashed border-[#E0D9CD] rounded-[2rem]">
                <p className="text-[#9A9189]">No posts published yet — check back soon.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogPage;
