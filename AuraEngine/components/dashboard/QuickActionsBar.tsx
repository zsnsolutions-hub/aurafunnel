import React from 'react';
import { UploadIcon, SparklesIcon, DocumentIcon } from '../Icons';
import { useNavigate } from 'react-router-dom';

interface QuickActionsBarProps {
  onImportCSV: () => void;
  onGenerateContent?: () => void;
  isAdmin?: boolean;
}

const QuickActionsBar: React.FC<QuickActionsBarProps> = ({ onImportCSV, onGenerateContent, isAdmin }) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center space-x-3 flex-wrap gap-y-2">
      <button
        onClick={onImportCSV}
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
      >
        <UploadIcon className="w-4 h-4" />
        <span>Import Leads</span>
      </button>
      {onGenerateContent && (
        <button
          onClick={onGenerateContent}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>Generate Content</span>
        </button>
      )}
      <button
        onClick={() => navigate(isAdmin ? '/admin/ai-ops' : '/portal/content')}
        className="inline-flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
      >
        <DocumentIcon className="w-4 h-4" />
        <span>Run Report</span>
      </button>
    </div>
  );
};

export default QuickActionsBar;
