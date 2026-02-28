import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { SparklesIcon, BoltIcon, ChartIcon, RefreshIcon } from '../../components/Icons';

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
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-20">
          <h2 className="text-base font-semibold leading-7 text-indigo-600 uppercase tracking-widest">Resources</h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl font-heading">
            Aura Intelligence Blog
          </p>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Insights on AI-driven growth, behavioral sales psychology, and the future of enterprise outreach.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <RefreshIcon className="w-10 h-10 text-indigo-100 animate-spin mx-auto mb-4" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Syncing Publication Grid...</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-12 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="flex flex-col items-start group">
                <div className="relative w-full overflow-hidden rounded-[2.5rem] bg-slate-100 aspect-[16/9] mb-8 ring-1 ring-slate-200 shadow-sm transition-all group-hover:shadow-xl group-hover:-translate-y-1 duration-500">
                  <img
                    src={post.featured_image || `https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800&seed=${post.id}`}
                    alt={post.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-6 left-6">
                     <span className="bg-white/90 backdrop-blur-md text-[9px] font-black uppercase tracking-widest text-slate-900 px-4 py-1.5 rounded-full shadow-lg">
                        {post.blog_categories?.name || 'Scaliyo'}
                     </span>
                  </div>
                </div>
                <div className="flex items-center gap-x-4 text-xs mb-4">
                  <time dateTime={post.published_at} className="text-slate-500 font-bold uppercase tracking-widest">
                    {new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </time>
                </div>
                <div className="relative group">
                  <h3 className="text-2xl font-bold leading-tight text-slate-900 font-heading group-hover:text-indigo-600 transition-colors">
                    <Link to={`/blog/${post.slug}`}>
                      <span className="absolute inset-0" />
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-5 line-clamp-3 text-sm leading-relaxed text-slate-500 italic">
                    "{post.excerpt || post.content.substring(0, 120)}..."
                  </p>
                </div>
                <div className="relative mt-8 flex items-center gap-x-4">
                  <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 border border-indigo-100 uppercase">
                    {post.profiles?.name?.charAt(0) || post.profiles?.email?.charAt(0) || 'A'}
                  </div>
                  <div className="text-sm leading-6">
                    <p className="font-bold text-slate-900">
                      {post.profiles?.name || 'Aura Contributor'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Verified Publication</p>
                  </div>
                </div>
              </article>
            ))}
            {posts.length === 0 && (
              <div className="lg:col-span-3 py-32 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                 <p className="text-slate-400 font-medium italic">No published insights currently on grid.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogPage;