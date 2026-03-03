import React, { useState } from 'react';
import { Play, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { DnaRecord, DnaTestResult, testDnaPrompt, buildPromptFromDnaRecord } from '../../../lib/dna';

interface Props {
  dna: DnaRecord;
  userId: string;
}

const DnaTestRunner: React.FC<Props> = ({ dna, userId }) => {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const v of dna.variables) {
      defaults[v.name] = v.default_value || '';
    }
    return defaults;
  });
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DnaTestResult | null>(null);
  const [showBuilt, setShowBuilt] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await testDnaPrompt(dna, variableValues, context, userId);
      setResult(res);
    } catch (err: unknown) {
      setResult({
        systemInstruction: '',
        finalPrompt: '',
        response: '',
        tokensUsed: 0,
        latencyMs: 0,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    setRunning(false);
  };

  const handlePreview = () => {
    const { systemInstruction, finalPrompt } = buildPromptFromDnaRecord(dna, variableValues, context);
    setResult({
      systemInstruction,
      finalPrompt,
      response: '',
      tokensUsed: 0,
      latencyMs: 0,
      success: true,
    });
    setShowBuilt(true);
  };

  return (
    <div className="space-y-6">
      {/* Variable inputs */}
      {dna.variables.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Variable Inputs</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dna.variables.map(v => (
              <div key={v.name}>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  {v.name} {v.required && <span className="text-red-400">*</span>}
                </label>
                <input
                  value={variableValues[v.name] ?? ''}
                  onChange={e => setVariableValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                  placeholder={v.description || v.default_value || v.name}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Additional Context</label>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={3}
          placeholder="Optional extra context to append to the prompt..."
          className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Play size={16} />
          {running ? 'Running...' : 'Run Test'}
        </button>
        <button
          onClick={handlePreview}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          Preview Prompt
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Metrics */}
          <div className="flex items-center gap-4">
            {result.success ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full">
                <CheckCircle size={14} /> Success
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded-full">
                <XCircle size={14} /> Error
              </span>
            )}
            {result.latencyMs > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={13} /> {result.latencyMs}ms
              </span>
            )}
            {result.tokensUsed > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <Zap size={13} /> {result.tokensUsed} tokens
              </span>
            )}
          </div>

          {/* Error */}
          {result.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-700">{result.error}</p>
            </div>
          )}

          {/* Built prompt */}
          {(showBuilt || result.response) && result.systemInstruction && (
            <div>
              <button
                onClick={() => setShowBuilt(!showBuilt)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 mb-2"
              >
                {showBuilt ? 'Hide' : 'Show'} Built Prompt
              </button>
              {showBuilt && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">System Instruction</p>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">{result.systemInstruction}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Final Prompt</p>
                    <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">{result.finalPrompt}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Response */}
          {result.response && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">AI Response</p>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{result.response}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DnaTestRunner;
