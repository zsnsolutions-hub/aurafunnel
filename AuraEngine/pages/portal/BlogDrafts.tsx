import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useOutletContext } from 'react-router-dom';
import { User } from '../../types';
import { EditIcon, PlusIcon, SparklesIcon, ShieldIcon, CheckIcon, RefreshIcon } from '../../components/Icons';

const BlogDrafts: React.FC = () => {
  const { user } = useOutletContext<{ user: User }>();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [newPost, setNewPost] = useState({ title: '', content: '', slug: '', category_id: '', featured_image: null as string | null });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: d } = await supabase
        .from('blog_posts')
        .select('*, blog_categories(name)')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });
      
      const { data: c } = await supabase.from('blog_categories').select('*');

      if (d) setDrafts(d);
      if (c) setCategories(c);
    } catch (err: any) {
      console.error("Sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user.id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `client-uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blog-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('blog-assets')
        .getPublicUrl(filePath);

      setNewPost(prev => ({ ...prev, featured_image: publicUrl }));
    } catch (err: any) {
      setError("Asset upload failure: " + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (status: 'draft' | 'pending_review') => {
    if (!newPost.title || !newPost.content) {
      setError("Please provide a title and narrative content.");
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert([{
          ...newPost,
          author_id: user.id,
          status: status,
          slug: newPost.title.toLowerCase().replace(/\s+/g, '-')
        }]);
      
      if (insertErr) throw insertErr;
      
      setNewPost({ title: '', content: '', slug: '', category_id: '', featured_image: null });
      setSuccess(status === 'draft' ? "Draft archived." : "Insight transmitted for review.");
      await fetchData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Transmission error.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight font-heading">Thought Leadership</h1>
          <p className="text-slate-500 mt-2 max-w-lg leading-relaxed font-medium">
            Draft insights for the Aura Engine community. Guest posts are subject to admin review before publishing.
          </p>
        </div>
        <div className="bg-indigo-50 px-5 py-3 rounded-2xl border border-indigo-100 flex items-center space-x-4 shadow-sm">
           <SparklesIcon className="w-5 h-5 text-indigo-600" />
           <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Contributor Node Verified</span>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-200 shadow-3xl overflow-hidden p-10">
        <h3 className="text-xl font-black text-slate-900 font-heading mb-8">Author New Insight</h3>
        
        {error && <div className="mb-8 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl font-bold">⚠️ {error}</div>}
        {success && <div className="mb-8 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-2xl font-bold flex items-center space-x-2"><CheckIcon className="w-4 h-4" /><span>{success}</span></div>}

        <form className="space-y-8" onSubmit={e => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Post Title</label>
                   <input required value={newPost.title} onChange={e => setNewPost({...newPost, title: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold" placeholder="Future of AI Funnels" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxonomy Node</label>
                   <select value={newPost.category_id} onChange={e => setNewPost({...newPost, category_id: e.target.value})} className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold">
                     <option value="">Select Category...</option>
                     {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                   </select>
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hero Asset</label>
                <div className="relative h-40 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100 flex items-center justify-center overflow-hidden group">
                   {newPost.featured_image ? (
                     <img src={newPost.featured_image} className="w-full h-full object-cover" />
                   ) : (
                     <div className="text-center">
                        {uploadingImage ? <RefreshIcon className="w-5 h-5 animate-spin mx-auto text-indigo-400" /> : (
                          <>
                            <PlusIcon className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                            <p className="text-[9px] font-black text-slate-400 uppercase">Upload Cover</p>
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                          </>
                        )}
                     </div>
                   )}
                </div>
             </div>
          </div>

          <div className="space-y-2">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Body Narrative</label>
             <textarea required value={newPost.content} onChange={e => setNewPost({...newPost, content: e.target.value})} rows={8} className="w-full p-8 rounded-3xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-100 outline-none leading-relaxed italic text-slate-700" placeholder="Share your expertise with the network..." />
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button type="button" disabled={isCreating} onClick={() => handleSubmit('pending_review')} className="flex-grow py-5 bg-slate-900 text-white rounded-[2rem] font-bold shadow-2xl hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center space-x-2">
               <span>Submit for Editorial Review</span>
               <PlusIcon className="w-5 h-5" />
            </button>
            <button type="button" disabled={isCreating} onClick={() => handleSubmit('draft')} className="px-10 py-5 bg-white text-slate-500 border border-slate-200 rounded-[2rem] font-bold hover:bg-slate-50 transition-all active:scale-95">Save Draft</button>
          </div>
        </form>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-black text-slate-900 font-heading px-4">Your Intelligence Pipeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? [1, 2].map(i => <div key={i} className="h-48 bg-white border border-slate-100 rounded-[2.5rem] animate-pulse"></div>) : drafts.map(d => (
            <div key={d.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
               <div className="flex justify-between items-start mb-6">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${d.status === 'published' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{d.status.replace('_', ' ')}</span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(d.created_at).toLocaleDateString()}</p>
               </div>
               <div className="flex items-center space-x-4 mb-4">
                  {d.featured_image && <img src={d.featured_image} className="w-12 h-12 rounded-xl object-cover shadow-sm" />}
                  <h4 className="text-lg font-bold text-slate-900 font-heading leading-tight">{d.title}</h4>
               </div>
               <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-6 italic">"{d.content}"</p>
               <div className="pt-4 border-t border-slate-50 flex justify-between items-center"><span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">{d.blog_categories?.name || 'Insight'}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BlogDrafts;