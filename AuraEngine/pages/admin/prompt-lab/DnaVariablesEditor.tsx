import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DnaVariable } from '../../../lib/dna';

interface Props {
  variables: DnaVariable[];
  onChange: (variables: DnaVariable[]) => void;
  disabled?: boolean;
}

const EMPTY_VAR: DnaVariable = {
  name: '',
  type: 'string',
  required: false,
  default_value: '',
  description: '',
};

const DnaVariablesEditor: React.FC<Props> = ({ variables, onChange, disabled }) => {
  const update = (index: number, field: keyof DnaVariable, value: unknown) => {
    const next = variables.map((v, i) => (i === index ? { ...v, [field]: value } : v));
    onChange(next);
  };

  const remove = (index: number) => onChange(variables.filter((_, i) => i !== index));
  const add = () => onChange([...variables, { ...EMPTY_VAR }]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          Variables <span className="text-gray-400 font-normal">({variables.length})</span>
        </p>
        {!disabled && (
          <button
            onClick={add}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <Plus size={14} /> Add Variable
          </button>
        )}
      </div>

      {variables.length === 0 && (
        <p className="text-sm text-gray-400 italic">No variables defined. Use <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{'{{variable_name}}'}</code> in your template.</p>
      )}

      <div className="space-y-3">
        {variables.map((v, i) => (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Name</label>
                <input
                  value={v.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  disabled={disabled}
                  placeholder="variable_name"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Type</label>
                <select
                  value={v.type}
                  onChange={e => update(i, 'type', e.target.value)}
                  disabled={disabled}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="array">Array</option>
                  <option value="object">Object</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Default Value</label>
                <input
                  value={v.default_value}
                  onChange={e => update(i, 'default_value', e.target.value)}
                  disabled={disabled}
                  placeholder="Optional default"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                <input
                  value={v.description}
                  onChange={e => update(i, 'description', e.target.value)}
                  disabled={disabled}
                  placeholder="What this variable represents"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={v.required}
                  onChange={e => update(i, 'required', e.target.checked)}
                  disabled={disabled}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-medium text-gray-600">Required</span>
              </label>
              {!disabled && (
                <button onClick={() => remove(i)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DnaVariablesEditor;
