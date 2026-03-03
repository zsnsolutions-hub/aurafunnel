import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { OutputSchema, buildOutputSchemaBlock } from '../../../lib/dna';

interface Props {
  schema: OutputSchema | null;
  onChange: (schema: OutputSchema | null) => void;
  disabled?: boolean;
}

const DnaOutputSchemaEditor: React.FC<Props> = ({ schema, onChange, disabled }) => {
  const enabled = schema !== null;
  const entries = schema ? Object.entries(schema) : [];

  const toggle = () => {
    onChange(enabled ? null : {});
  };

  const updateKey = (oldKey: string, newKey: string) => {
    if (!schema) return;
    const next: OutputSchema = {};
    for (const [k, v] of Object.entries(schema)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };

  const updateValue = (key: string, value: string) => {
    if (!schema) return;
    onChange({ ...schema, [key]: value });
  };

  const addField = () => {
    onChange({ ...(schema ?? {}), '': '' });
  };

  const removeField = (key: string) => {
    if (!schema) return;
    const { [key]: _, ...rest } = schema;
    onChange(Object.keys(rest).length > 0 ? rest : {});
  };

  const preview = buildOutputSchemaBlock(schema);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={toggle}
            disabled={disabled}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-gray-700">Enable Output Schema</span>
        </label>
        {enabled && !disabled && (
          <button
            onClick={addField}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <Plus size={14} /> Add Field
          </button>
        )}
      </div>

      {enabled && entries.length === 0 && (
        <p className="text-sm text-gray-400 italic">No fields defined. Add fields to define the expected output structure.</p>
      )}

      {enabled && (
        <div className="space-y-3">
          {entries.map(([key, desc], i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-1">
                <input
                  value={key}
                  onChange={e => updateKey(key, e.target.value)}
                  disabled={disabled}
                  placeholder="field_name"
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex-[2]">
                <input
                  value={desc}
                  onChange={e => updateValue(key, e.target.value)}
                  disabled={disabled}
                  placeholder="Description of this field"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                />
              </div>
              {!disabled && (
                <button onClick={() => removeField(key)} className="p-2 text-gray-400 hover:text-red-500 transition-colors mt-0.5">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {enabled && entries.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Preview</p>
          <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap">{preview || 'No schema defined'}</pre>
        </div>
      )}
    </div>
  );
};

export default DnaOutputSchemaEditor;
