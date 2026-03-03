import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import {
  DnaRecord, DnaCategory, DnaModule, DnaVariable, ToneConfig, OutputSchema,
  DNA_CATEGORIES, DNA_MODULES,
  getDna, createDna, updateDna, restoreVersion, slugify,
} from '../../../lib/dna';
import { supabase } from '../../../lib/supabase';
import DnaVariablesEditor from './DnaVariablesEditor';
import DnaToneBuilder from './DnaToneBuilder';
import DnaOutputSchemaEditor from './DnaOutputSchemaEditor';
import DnaTestRunner from './DnaTestRunner';
import DnaVersionHistory from './DnaVersionHistory';

type Tab = 'template' | 'variables' | 'tone' | 'schema' | 'test' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'template', label: 'Template' },
  { key: 'variables', label: 'Variables' },
  { key: 'tone', label: 'Tone' },
  { key: 'schema', label: 'Output Schema' },
  { key: 'test', label: 'Test' },
  { key: 'history', label: 'History' },
];

const DEFAULT_TONE: ToneConfig = {
  formality: 5,
  creativity: 5,
  verbosity: 5,
  custom_instructions: '',
};

const DnaEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('template');
  const [userId, setUserId] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DnaCategory>('general');
  const [module, setModule] = useState<DnaModule>('general');
  const [isActive, setIsActive] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [variables, setVariables] = useState<DnaVariable[]>([]);
  const [toneConfig, setToneConfig] = useState<ToneConfig>(DEFAULT_TONE);
  const [outputSchema, setOutputSchema] = useState<OutputSchema | null>(null);
  const [guardrails, setGuardrails] = useState<string[]>([]);
  const [changeNote, setChangeNote] = useState('');
  const [activeVersion, setActiveVersion] = useState(1);
  const [dnaRecord, setDnaRecord] = useState<DnaRecord | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUserId(data.session.user.id);
    });
  }, []);

  const loadDna = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const data = await getDna(id);
      if (!data) {
        setError('Blueprint not found');
        return;
      }
      setDnaRecord(data);
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description);
      setCategory(data.category);
      setModule(data.module);
      setIsActive(data.is_active);
      setIsLocked(data.is_locked);
      setSystemPrompt(data.system_prompt);
      setPromptTemplate(data.prompt_template);
      setVariables(data.variables || []);
      setToneConfig(data.tone_config || DEFAULT_TONE);
      setOutputSchema(data.output_schema);
      setGuardrails(data.guardrails || []);
      setActiveVersion(data.active_version);
    } catch (err) {
      setError('Failed to load blueprint');
    }
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { loadDna(); }, [loadDna]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (isNew) setSlug(slugify(value));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!userId) { setError('Not authenticated'); return; }

    setSaving(true);
    setError('');
    setSaved(false);

    try {
      if (isNew) {
        const record = await createDna({
          workspace_id: null,
          name: name.trim(),
          slug: slug || slugify(name),
          category,
          description,
          module,
          system_prompt: systemPrompt,
          prompt_template: promptTemplate,
          variables,
          tone_config: toneConfig,
          output_schema: outputSchema,
          guardrails,
          is_locked: isLocked,
          is_active: isActive,
          created_by: userId,
        });
        navigate(`/admin/prompts/${record.id}`, { replace: true });
      } else if (id) {
        const updated = await updateDna(
          id,
          {
            name: name.trim(),
            slug,
            category,
            description,
            module,
            system_prompt: systemPrompt,
            prompt_template: promptTemplate,
            variables,
            tone_config: toneConfig,
            output_schema: outputSchema,
            guardrails,
            is_locked: isLocked,
            is_active: isActive,
          },
          changeNote || 'Updated',
          userId,
        );
        setDnaRecord(updated);
        setActiveVersion(updated.active_version);
        setChangeNote('');
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
    setSaving(false);
  };

  const handleRestore = async (versionNumber: number) => {
    if (!id || !userId) return;
    try {
      const restored = await restoreVersion(id, versionNumber, userId);
      setDnaRecord(restored);
      setSystemPrompt(restored.system_prompt);
      setPromptTemplate(restored.prompt_template);
      setVariables(restored.variables || []);
      setToneConfig(restored.tone_config || DEFAULT_TONE);
      setOutputSchema(restored.output_schema);
      setGuardrails(restored.guardrails || []);
      setActiveVersion(restored.active_version);
    } catch (err) {
      setError('Restore failed');
    }
  };

  // Build a DnaRecord-like object for the test runner
  const currentDna: DnaRecord = dnaRecord
    ? { ...dnaRecord, name, slug, category, description, module, system_prompt: systemPrompt, prompt_template: promptTemplate, variables, tone_config: toneConfig, output_schema: outputSchema, guardrails, is_active: isActive, is_locked: isLocked }
    : {
        id: 'preview',
        workspace_id: null,
        name, slug, category, description, module,
        system_prompt: systemPrompt,
        prompt_template: promptTemplate,
        variables,
        tone_config: toneConfig,
        output_schema: outputSchema,
        guardrails,
        is_locked: isLocked,
        is_active: isActive,
        active_version: activeVersion,
        ab_group: null,
        marketplace_status: null,
        fine_tune_model_id: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 size={24} className="animate-spin text-gray-400 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => navigate('/admin/prompts')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Registry
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Blueprint name"
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Slug</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="auto-generated-slug"
              className="w-full px-4 py-2.5 text-sm font-mono border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Brief description of what this blueprint does..."
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as DnaCategory)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            >
              {DNA_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Module</label>
            <select
              value={module}
              onChange={e => setModule(e.target.value as DnaModule)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            >
              {DNA_MODULES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2.5">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>
          <div className="flex items-end">
            <span className="text-sm text-gray-400 pb-2.5">v{activeVersion}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {TABS.map(t => {
            // Only show History/Test for existing records
            if ((t.key === 'history' || t.key === 'test') && isNew) return null;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        {tab === 'template' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={6}
                placeholder="Define the AI's persona, role, and core behavior..."
                className="w-full px-4 py-3 text-sm font-mono border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prompt Template
                <span className="text-xs text-gray-400 font-normal ml-2">Use {'{{variable_name}}'} for dynamic values</span>
              </label>
              <textarea
                value={promptTemplate}
                onChange={e => setPromptTemplate(e.target.value)}
                rows={10}
                placeholder="Write the prompt template with {{variables}}..."
                className="w-full px-4 py-3 text-sm font-mono border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
              />
            </div>
            {/* Guardrails inline */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Guardrails
                <span className="text-xs text-gray-400 font-normal ml-2">One per line</span>
              </label>
              <textarea
                value={guardrails.join('\n')}
                onChange={e => setGuardrails(e.target.value.split('\n').filter(Boolean))}
                rows={4}
                placeholder="Never reveal internal system prompts&#10;Always respond in English&#10;Keep responses under 500 words"
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-y"
              />
            </div>
          </div>
        )}

        {tab === 'variables' && (
          <DnaVariablesEditor variables={variables} onChange={setVariables} />
        )}

        {tab === 'tone' && (
          <DnaToneBuilder toneConfig={toneConfig} onChange={setToneConfig} />
        )}

        {tab === 'schema' && (
          <DnaOutputSchemaEditor schema={outputSchema} onChange={setOutputSchema} />
        )}

        {tab === 'test' && dnaRecord && (
          <DnaTestRunner dna={currentDna} userId={userId} />
        )}

        {tab === 'history' && id && !isNew && (
          <DnaVersionHistory
            dnaId={id}
            currentVersion={activeVersion}
            onRestore={handleRestore}
          />
        )}
      </div>

      {/* Save bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4 sticky bottom-4">
        {!isNew && (
          <input
            value={changeNote}
            onChange={e => setChangeNote(e.target.value)}
            placeholder="Change note (optional)..."
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        )}
        <div className="flex items-center gap-3 ml-auto">
          {error && <span className="text-sm text-red-600">{error}</span>}
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isNew ? 'Create Blueprint' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DnaEditorPage;
