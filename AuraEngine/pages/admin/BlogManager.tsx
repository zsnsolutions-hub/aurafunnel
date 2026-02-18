import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { EditIcon, CheckIcon, RefreshIcon, TargetIcon, SparklesIcon, ChartIcon, ShieldIcon, PlusIcon, BoltIcon } from '../../components/Icons';

interface BlogPost {
  id?: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featured_image: string | null;
  status: 'draft' | 'pending_review' | 'published' | 'archived';
  category_id: string | null;
  author_id?: string;
  seo_settings?: {
    title: string;
    description: string;
    og_image: string;
  };
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  _count?: number; // Virtual count for post associations
}

const BlogManager: React.FC = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'categories'>('posts');
  const [filter, setFilter] = useState('ALL');
  
  // Category Form
  const [newCat, setNewCat] = useState({ name: '', description: '', slug: '' });

  // Editor Modal States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState<BlogPost>({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    featured_image: null,
    status: 'draft',
    category_id: null,
    seo_settings: { title: '', description: '', og_image: '' }
  });

  const generateSlug = (text: string) => {
    return text.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch posts with category and profile info
      const { data: p } = await supabase
        .from('blog_posts')
        .select('*, profiles(email, name), blog_categories(id, name)')
        .order('created_at', { ascending: false });
      
      // Fetch categories
      const { data: c } = await supabase
        .from('blog_categories')
        .select('*')
        .order('name', { ascending: true });
      
      // Fetch counts manually since Supabase doesn't support easy count joins in one go without RPC
      const { data: counts } = await supabase.rpc('get_category_post_counts');
      
      if (p) setPosts(p);
      if (c) {
        const catsWithCounts = c.map(cat => ({
          ...cat,
          _count: counts?.find((cnt: any) => cnt.category_id === cat.id)?.post_count || 0
        }));
        setCategories(catsWithCounts);
      }
    } catch (err) {
      console.error("Fetch failure:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `blog-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blog-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('blog-assets')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, featured_image: data.publicUrl }));
    } catch (err: unknown) {
      alert("Asset Transmission Failure: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploadingImage(false);
    }
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat.name) return;
    
    setIsSyncing(true);
    try {
      const slug = newCat.slug || generateSlug(newCat.name);
      const { error } = await supabase.from('blog_categories').insert([{ 
        name: newCat.name, 
        description: newCat.description, 
        slug 
      }]);
      
      if (!error) {
        setNewCat({ name: '', description: '', slug: '' });
        await fetchData();
      } else {
        alert("Taxonomy Error: " + error.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (cat._count && cat._count > 0) {
      if (!confirm(`Warning: This category contains ${cat._count} posts. These posts will become 'Uncategorized'. Proceed?`)) return;
    } else {
      if (!confirm(`Are you sure you want to delete '${cat.name}'?`)) return;
    }
    
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('blog_categories').delete().eq('id', cat.id);
      if (error) throw error;
      await fetchData();
    } catch (err: unknown) {
      alert("Deletion Blocked: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const openEditor = (post: any = null) => {
    if (post) {
      setEditingPost(post);
      setFormData({
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt || '',
        featured_image: post.featured_image || null,
        status: post.status,
        category_id: post.category_id,
        seo_settings: post.seo_settings || { title: '', description: '', og_image: '' }
      });
    } else {
      setEditingPost(null);
      setFormData({
        title: '',
        slug: '',
        content: '',
        excerpt: '',
        featured_image: null,
        status: 'draft',
        category_id: categories.length > 0 ? categories[0].id : null,
        seo_settings: { title: '', description: '', og_image: '' }
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated session.");

      const payload = {
        ...formData,
        author_id: editingPost ? editingPost.author_id : user.id,
        published_at: formData.status === 'published' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      if (editingPost?.id) {
        await supabase.from('blog_posts').update(payload).eq('id', editingPost.id);
      } else {
        await supabase.from('blog_posts').insert([payload]);
      }

      await fetchData();
      setIsEditorOpen(false);
    } catch (err: unknown) {
      alert("Transmission Failure: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setIsSyncing(true);
    await supabase.from('blog_posts').update({ 
      status, 
      published_at: status === 'published' ? new Date().toISOString() : null 
    }).eq('id', id);
    await fetchData();
    setIsSyncing(false);
  };

  const filteredPosts = posts.filter(p => filter === 'ALL' || p.status === filter.toLowerCase());

  if (loading) return <div className="py-24 text-center text-slate-400 uppercase tracking-widest animate-pulse">Syncing Editorial Grid...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Editorial Command</h1>
          <p className="text-slate-500 mt-1">Manage global content nodes, categories, and media assets.</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button onClick={() => setActiveTab('posts')} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'posts' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Posts</button>
            <button onClick={() => setActiveTab('categories')} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'categories' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Taxonomy</button>
          </div>
          <button onClick={fetchData} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
            <RefreshIcon className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {activeTab === 'posts' ? (
        <>
          <div className="flex justify-between items-center">
            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {['ALL', 'PENDING_REVIEW', 'PUBLISHED', 'DRAFT'].map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900'}`}>{f.replace('_', ' ')}</button>
              ))}
            </div>
            <button onClick={() => openEditor()} className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
              <PlusIcon className="w-4 h-4" />
              <span>Create Official Post</span>
            </button>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                <tr>
                  <th className="px-10 py-6">Identity</th>
                  <th className="px-10 py-6">Source</th>
                  <th className="px-10 py-6">Taxonomy</th>
                  <th className="px-10 py-6">Status</th>
                  <th className="px-10 py-6 text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPosts.map((post) => (
                  <tr key={post.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-10 py-7">
                      <div className="flex items-center space-x-4">
                        {post.featured_image && <img src={post.featured_image} className="w-10 h-10 rounded-lg object-cover shadow-sm border border-slate-100" />}
                        <div>
                          <p className="text-sm font-bold text-slate-900 font-heading">{post.title}</p>
                          <p className="text-[10px] text-slate-400 font-mono">/{post.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-7"><span className="text-xs font-medium text-slate-600">{post.profiles?.email}</span></td>
                    <td className="px-10 py-7"><span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{post.blog_categories?.name || 'Uncategorized'}</span></td>
                    <td className="px-10 py-7">
                      <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest ${post.status === 'published' ? 'bg-emerald-50 text-emerald-700' : post.status === 'pending_review' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{post.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-10 py-7 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {post.status === 'pending_review' && <button onClick={() => updateStatus(post.id, 'published')} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-600 shadow-lg shadow-emerald-200">Approve</button>}
                        <button onClick={() => openEditor(post)} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><EditIcon className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-1">
             <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm sticky top-24">
                <div className="flex items-center space-x-3 mb-8">
                   <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><PlusIcon className="w-5 h-5" /></div>
                   <h3 className="text-xl font-black text-slate-900 font-heading">Register Node</h3>
                </div>
                <form onSubmit={createCategory} className="space-y-6">
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Category Name</label>
                     <input 
                      required 
                      value={newCat.name} 
                      onChange={e => {
                        const name = e.target.value;
                        setNewCat({...newCat, name, slug: generateSlug(name)});
                      }} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-100 outline-none font-bold" 
                      placeholder="e.g. Behavioral Science" 
                     />
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">URL Slug</label>
                     <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px]">/</span>
                        <input 
                          value={newCat.slug} 
                          onChange={e => setNewCat({...newCat, slug: generateSlug(e.target.value)})} 
                          className="w-full pl-7 pr-5 py-4 rounded-2xl bg-slate-100 border border-slate-200 font-mono text-xs text-slate-600 outline-none" 
                          placeholder="auto-generated-slug" 
                        />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Description</label>
                     <textarea 
                      value={newCat.description} 
                      onChange={e => setNewCat({...newCat, description: e.target.value})} 
                      className="w-full px-5 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-100 outline-none italic text-sm resize-none" 
                      rows={3}
                      placeholder="Define the scope of this branch..." 
                     />
                   </div>
                   <button type="submit" disabled={isSyncing} className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-bold shadow-2xl hover:bg-indigo-600 transition-all flex items-center justify-center space-x-3">
                     {isSyncing ? <RefreshIcon className="w-5 h-5 animate-spin" /> : <span>Deploy Taxonomy Node</span>}
                   </button>
                </form>
             </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
             <div className="flex items-center justify-between px-4">
                <h3 className="text-xl font-black text-slate-900 font-heading">Live Taxonomy Grid</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{categories.length} Nodes Active</span>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {categories.map(c => (
                  <div key={c.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col group transition-all hover:shadow-xl hover:-translate-y-1">
                     <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                           <TargetIcon className="w-6 h-6" />
                        </div>
                        <button onClick={() => deleteCategory(c)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                           <span className="text-[9px] font-black uppercase tracking-widest">Destroy</span>
                        </button>
                     </div>
                     <h4 className="text-lg font-bold text-slate-900 font-heading mb-1">{c.name}</h4>
                     <p className="text-[10px] font-mono text-slate-400 mb-4 tracking-tighter">path: /{c.slug}</p>
                     <p className="text-xs text-slate-500 leading-relaxed italic line-clamp-2 mb-6 flex-grow">
                        {c.description || 'No descriptive metadata assigned to this node.'}
                     </p>
                     <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Post Association</span>
                        <div className="flex items-center space-x-2">
                           <span className="text-xs font-bold text-slate-900">{c._count || 0}</span>
                           <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="bg-indigo-500 h-full" style={{ width: `${Math.min((c._count || 0) * 10, 100)}%` }}></div>
                           </div>
                        </div>
                     </div>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="col-span-2 py-20 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
                     <SparklesIcon className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                     <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">Awaiting Taxonomy Initialization</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => !isSyncing && setIsEditorOpen(false)}></div>
          <div className="relative bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[3rem] shadow-3xl animate-in zoom-in-95 duration-300 p-10 md:p-14 custom-scrollbar">
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100"><EditIcon className="w-6 h-6" /></div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-heading">Content Architect</h2>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{isSyncing ? 'Transmission Active' : 'Ready for Commit'}</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => !isSyncing && setIsEditorOpen(false)} 
                className={`text-slate-400 font-black uppercase tracking-widest text-[10px] ${isSyncing ? 'opacity-20 cursor-not-allowed' : 'hover:text-slate-600'}`}
              >
                Discard changes
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Featured Asset</label>
                   <div className="relative h-56 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                      {formData.featured_image ? (
                        <>
                          <img 
                            key={formData.featured_image}
                            src={formData.featured_image} 
                            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300" 
                            onError={(e) => {
                              console.error("Asset Link Broken:", formData.featured_image);
                              (e.target as any).src = 'https://via.placeholder.com/800x450?text=Asset+Link+Failure';
                            }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                             <button type="button" onClick={() => setFormData({...formData, featured_image: null})} className="px-4 py-2 bg-red-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg">Remove Asset</button>
                          </div>
                          <div className="absolute top-4 left-4">
                            <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">Neural Link Verified</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-6">
                           {uploadingImage ? (
                             <div className="space-y-4 flex flex-col items-center">
                               <RefreshIcon className="w-10 h-10 text-indigo-500 animate-spin" />
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Synchronizing Asset...</p>
                             </div>
                           ) : (
                             <>
                               <PlusIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Drop Image or Click to Upload</p>
                               <p className="text-[9px] text-slate-400 mt-1 uppercase tracking-tighter">PNG, JPG, WebP supported</p>
                               <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                             </>
                           )}
                        </div>
                      )}
                   </div>
                </div>
                <div className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Post Title</label>
                      <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value, slug: generateSlug(e.target.value)})} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none focus:ring-4 focus:ring-indigo-100" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxonomy Node</label>
                      <select value={formData.category_id || ''} onChange={e => setFormData({...formData, category_id: e.target.value})} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 font-bold outline-none focus:ring-4 focus:ring-indigo-100">
                        <option value="">Uncategorized</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                   </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Excerpt</label>
                <textarea value={formData.excerpt} onChange={e => setFormData({...formData, excerpt: e.target.value})} rows={2} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-100 outline-none text-sm resize-none" placeholder="Brief summary for previews (max 200 chars)..." />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Content Narrative (Markdown)</label>
                <textarea required value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} rows={12} className="w-full p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-indigo-100 outline-none leading-relaxed text-slate-700 italic" placeholder="Share industry insights..." />
              </div>

              {/* SEO Settings */}
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-5">
                <div className="flex items-center space-x-3 mb-2">
                  <TargetIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">SEO Settings</h3>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SEO Title</label>
                  <input
                    value={formData.seo_settings?.title || ''}
                    onChange={e => setFormData({...formData, seo_settings: { ...(formData.seo_settings || { title: '', description: '', og_image: '' }), title: e.target.value }})}
                    className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-100 font-bold outline-none focus:ring-4 focus:ring-indigo-100"
                    placeholder="Custom title for search engines"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meta Description</label>
                  <textarea
                    value={formData.seo_settings?.description || ''}
                    onChange={e => setFormData({...formData, seo_settings: { ...(formData.seo_settings || { title: '', description: '', og_image: '' }), description: e.target.value }})}
                    rows={2}
                    className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-100 outline-none focus:ring-4 focus:ring-indigo-100 text-sm resize-none"
                    placeholder="Brief description for search results (max 160 chars)"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OG Image URL</label>
                  <input
                    value={formData.seo_settings?.og_image || ''}
                    onChange={e => setFormData({...formData, seo_settings: { ...(formData.seo_settings || { title: '', description: '', og_image: '' }), og_image: e.target.value }})}
                    className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-100 outline-none focus:ring-4 focus:ring-indigo-100 font-mono text-sm"
                    placeholder="Image URL for social sharing"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSyncing} 
                className={`w-full py-6 rounded-[2rem] font-bold text-lg shadow-2xl transition-all flex items-center justify-center space-x-3 active:scale-95 ${isSyncing ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}
              >
                {isSyncing ? (
                  <>
                    <RefreshIcon className="w-6 h-6 animate-spin" />
                    <span>Synchronizing with Grid...</span>
                  </>
                ) : (
                  <>
                    <span>Commit to Intelligence Grid</span>
                    <CheckIcon className="w-6 h-6" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogManager;