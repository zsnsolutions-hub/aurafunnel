import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApolloContact, ApolloSearchParams } from '../../types';
import { searchApollo, importApolloContacts, ApolloSearchResult, ApolloImportResult } from '../../lib/apollo';

// ── Constants ──
const EMPLOYEE_RANGES = [
  { label: '1-10', value: '1,10' },
  { label: '11-50', value: '11,50' },
  { label: '51-200', value: '51,200' },
  { label: '201-500', value: '201,500' },
  { label: '501-1,000', value: '501,1000' },
  { label: '1,001-5,000', value: '1001,5000' },
  { label: '5,001-10,000', value: '5001,10000' },
  { label: '10,001+', value: '10001,' },
];

const SENIORITY_OPTIONS = [
  { label: 'Owner / Founder', value: 'owner' },
  { label: 'C-Suite', value: 'c_suite' },
  { label: 'VP', value: 'vp' },
  { label: 'Director', value: 'director' },
  { label: 'Manager', value: 'manager' },
  { label: 'Individual Contributor', value: 'individual_contributor' },
];

const DEPARTMENT_OPTIONS = [
  'Engineering', 'Sales', 'Marketing', 'Finance', 'Operations',
  'Human Resources', 'Product', 'Design', 'Legal', 'Customer Success',
  'Data Science', 'IT', 'Business Development', 'Support',
];

const FUNDING_STAGE_OPTIONS = [
  'Seed', 'Series A', 'Series B', 'Series C', 'Series D+',
  'IPO', 'Private Equity', 'Acquired', 'Angel', 'Pre-Seed',
];

const REVENUE_RANGE_OPTIONS = [
  { label: 'Under $1M', min: undefined, max: 1000000 },
  { label: '$1M - $10M', min: 1000000, max: 10000000 },
  { label: '$10M - $50M', min: 10000000, max: 50000000 },
  { label: '$50M - $100M', min: 50000000, max: 100000000 },
  { label: '$100M - $500M', min: 100000000, max: 500000000 },
  { label: '$500M+', min: 500000000, max: undefined },
];

const QUICK_LOCATIONS = ['United States', 'Canada', 'United Kingdom', 'Germany'];
const QUICK_TITLES = ['CEO', 'CTO', 'VP Sales', 'Founder', 'Director'];
const QUICK_INDUSTRIES = ['SaaS', 'FinTech', 'Healthcare', 'AI/ML', 'Cybersecurity'];

const MOCK_PEOPLE: ApolloContact[] = [
  { id: 'mock-1', first_name: 'Sarah', last_name: 'Chen', name: 'Sarah Chen', title: 'VP of Engineering', email: 'sarah.chen@techcorp.io', linkedin_url: 'https://linkedin.com/in/sarahchen', city: 'San Francisco', state: 'CA', country: 'United States', headline: 'Building the future of developer tools', phone_numbers: [{ number: '+1-415-555-0101' }], organization: { name: 'TechCorp', website_url: 'https://techcorp.io', industry: 'Software Development', estimated_num_employees: 250 } },
  { id: 'mock-2', first_name: 'James', last_name: 'Rodriguez', name: 'James Rodriguez', title: 'CEO', email: 'james@growthmetrics.com', linkedin_url: 'https://linkedin.com/in/jamesrodriguez', city: 'New York', state: 'NY', country: 'United States', headline: 'Scaling data-driven companies', phone_numbers: [{ number: '+1-212-555-0202' }], organization: { name: 'GrowthMetrics', website_url: 'https://growthmetrics.com', industry: 'Analytics', estimated_num_employees: 85 } },
  { id: 'mock-3', first_name: 'Emily', last_name: 'Nakamura', name: 'Emily Nakamura', title: 'Head of Sales', email: 'emily.n@cloudstack.dev', linkedin_url: 'https://linkedin.com/in/emilynakamura', city: 'Austin', state: 'TX', country: 'United States', headline: 'Enterprise SaaS sales leader', phone_numbers: [], organization: { name: 'CloudStack', website_url: 'https://cloudstack.dev', industry: 'Cloud Computing', estimated_num_employees: 500 } },
  { id: 'mock-4', first_name: 'Marcus', last_name: 'Williams', name: 'Marcus Williams', title: 'CTO', email: 'marcus@dataflow.ai', linkedin_url: 'https://linkedin.com/in/marcuswilliams', city: 'Seattle', state: 'WA', country: 'United States', headline: 'AI/ML infrastructure at scale', phone_numbers: [{ number: '+1-206-555-0404' }], organization: { name: 'DataFlow AI', website_url: 'https://dataflow.ai', industry: 'Artificial Intelligence', estimated_num_employees: 120 } },
  { id: 'mock-5', first_name: 'Priya', last_name: 'Sharma', name: 'Priya Sharma', title: 'Director of Marketing', email: 'priya@brandlift.co', linkedin_url: 'https://linkedin.com/in/priyasharma', city: 'Chicago', state: 'IL', country: 'United States', headline: 'Growth marketing & brand strategy', phone_numbers: [{ number: '+1-312-555-0505' }], organization: { name: 'BrandLift', website_url: 'https://brandlift.co', industry: 'Marketing', estimated_num_employees: 45 } },
  { id: 'mock-6', first_name: 'David', last_name: 'Park', name: 'David Park', title: 'VP of Sales', email: 'david.park@nexuserp.com', linkedin_url: 'https://linkedin.com/in/davidpark', city: 'Boston', state: 'MA', country: 'United States', headline: 'Enterprise sales & partnerships', phone_numbers: [{ number: '+1-617-555-0606' }], organization: { name: 'NexusERP', website_url: 'https://nexuserp.com', industry: 'Enterprise Software', estimated_num_employees: 1200 } },
  { id: 'mock-7', first_name: 'Lisa', last_name: 'Thompson', name: 'Lisa Thompson', title: 'Chief Revenue Officer', email: 'lisa@finova.io', linkedin_url: 'https://linkedin.com/in/lisathompson', city: 'Denver', state: 'CO', country: 'United States', headline: 'FinTech revenue leader', phone_numbers: [], organization: { name: 'Finova', website_url: 'https://finova.io', industry: 'Financial Technology', estimated_num_employees: 310 } },
  { id: 'mock-8', first_name: 'Alex', last_name: 'Petrov', name: 'Alex Petrov', title: 'Head of Product', email: 'alex@synthwave.tech', linkedin_url: 'https://linkedin.com/in/alexpetrov', city: 'Los Angeles', state: 'CA', country: 'United States', headline: 'Product-led growth advocate', phone_numbers: [{ number: '+1-310-555-0808' }], organization: { name: 'Synthwave', website_url: 'https://synthwave.tech', industry: 'SaaS', estimated_num_employees: 75 } },
  { id: 'mock-9', first_name: 'Rachel', last_name: 'Kim', name: 'Rachel Kim', title: 'CEO', email: 'rachel@pixelcraft.design', linkedin_url: 'https://linkedin.com/in/rachelkim', city: 'Portland', state: 'OR', country: 'United States', headline: 'Design-led product company founder', phone_numbers: [{ number: '+1-503-555-0909' }], organization: { name: 'PixelCraft', website_url: 'https://pixelcraft.design', industry: 'Design', estimated_num_employees: 30 } },
  { id: 'mock-10', first_name: 'Michael', last_name: 'Foster', name: 'Michael Foster', title: 'VP of Engineering', email: 'michael@orbitsec.com', linkedin_url: 'https://linkedin.com/in/michaelfoster', city: 'Washington', state: 'DC', country: 'United States', headline: 'Cybersecurity platform builder', phone_numbers: [{ number: '+1-202-555-1010' }], organization: { name: 'OrbitSec', website_url: 'https://orbitsec.com', industry: 'Cybersecurity', estimated_num_employees: 180 } },
  { id: 'mock-11', first_name: 'Anika', last_name: 'Patel', name: 'Anika Patel', title: 'Director of Operations', email: 'anika@logisync.io', linkedin_url: 'https://linkedin.com/in/anikapatel', city: 'Atlanta', state: 'GA', country: 'United States', headline: 'Supply chain & ops optimization', phone_numbers: [], organization: { name: 'LogiSync', website_url: 'https://logisync.io', industry: 'Logistics', estimated_num_employees: 400 } },
  { id: 'mock-12', first_name: 'Tom', last_name: 'Brennan', name: 'Tom Brennan', title: 'CTO', email: 'tom@healthpulse.ai', linkedin_url: 'https://linkedin.com/in/tombrennan', city: 'Miami', state: 'FL', country: 'United States', headline: 'HealthTech innovation leader', phone_numbers: [{ number: '+1-305-555-1212' }], organization: { name: 'HealthPulse AI', website_url: 'https://healthpulse.ai', industry: 'Healthcare Technology', estimated_num_employees: 95 } },
];

// ── Filter persistence ──
const STORAGE_KEY = 'apollo_search_filters';

interface FilterState {
  titleTags: string[];
  keywords: string;
  locationTags: string[];
  orgLocationTags: string[];
  employeeRange: string;
  domainTags: string[];
  industryTags: string[];
  seniorityTags: string[];
  departmentTags: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  revenueRange: { min?: number; max?: number } | null;
  fundingStageTags: string[];
}

const DEFAULT_FILTERS: FilterState = {
  titleTags: [], keywords: '', locationTags: [], orgLocationTags: [],
  employeeRange: '', domainTags: [], industryTags: [],
  seniorityTags: [], departmentTags: [], hasEmail: false, hasPhone: false,
  revenueRange: null, fundingStageTags: [],
};

function encodeFilters(f: FilterState): string {
  return btoa(JSON.stringify(f));
}

function decodeFilters(encoded: string): FilterState | null {
  try { return JSON.parse(atob(encoded)) as FilterState; } catch { return null; }
}

// ── Collapsible filter section (sidebar) ──
const FilterSection: React.FC<{
  icon: React.ReactNode;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ icon, label, count, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-slate-400 shrink-0">{icon}</span>
        <span className="text-[13px] font-medium text-slate-700 flex-1">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-bold">{count}</span>
        )}
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  );
};

// ── Tag input for sidebar ──
const SidebarTagInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}> = ({ value, onChange, placeholder, tags, onTagsChange }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && value.trim()) {
      e.preventDefault();
      const newTag = value.trim().replace(/,+$/, '');
      if (newTag && !tags.includes(newTag)) onTagsChange([...tags, newTag]);
      onChange('');
    }
    if (e.key === 'Backspace' && !value && tags.length > 0) {
      onTagsChange(tags.slice(0, -1));
    }
  };
  const removeTag = (idx: number) => onTagsChange(tags.filter((_, i) => i !== idx));

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[11px] font-semibold">
              {tag}
              <button onClick={() => removeTag(i)} className="text-indigo-400 hover:text-indigo-600">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
      />
    </div>
  );
};

// ── Multi-select toggle list ──
const MultiToggleList: React.FC<{
  options: { label: string; value: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ options, selected, onChange }) => {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  return (
    <div className="space-y-0.5 max-h-36 overflow-y-auto">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => toggle(o.value)}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-2 ${
            selected.includes(o.value) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
            selected.includes(o.value) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
          }`}>
            {selected.includes(o.value) && (
              <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            )}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
};

// ── Quick filter chip ──
const QuickChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
      active
        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
    }`}
  >
    {label}
  </button>
);

// ── Icons ──
const Icons = {
  briefcase: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
  mapPin: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
  building: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21" /></svg>,
  users: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  tag: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>,
  globe: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
  mail: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
  search: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>,
  linkedin: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>,
  hierarchy: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
  phone: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>,
  dollar: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  rocket: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>,
};

// ── Main Page ──
const ApolloSearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialized = useRef(false);

  // Mode & sidebar
  const [demoMode, setDemoMode] = useState(true);
  const [showFilters, setShowFilters] = useState(true);

  // Filter state — initialized from URL > localStorage > defaults
  const [titleTags, setTitleTags] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [keywords, setKeywords] = useState('');
  const [locationTags, setLocationTags] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [orgLocationTags, setOrgLocationTags] = useState<string[]>([]);
  const [orgLocationInput, setOrgLocationInput] = useState('');
  const [employeeRange, setEmployeeRange] = useState('');
  const [domainTags, setDomainTags] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [industryTags, setIndustryTags] = useState<string[]>([]);
  const [industryInput, setIndustryInput] = useState('');
  // New advanced filters
  const [seniorityTags, setSeniorityTags] = useState<string[]>([]);
  const [departmentTags, setDepartmentTags] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [revenueRange, setRevenueRange] = useState<{ min?: number; max?: number } | null>(null);
  const [fundingStageTags, setFundingStageTags] = useState<string[]>([]);

  // Restore filters from URL or localStorage on mount
  useEffect(() => {
    const urlF = searchParams.get('f');
    let restored: FilterState | null = null;
    if (urlF) restored = decodeFilters(urlF);
    if (!restored) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) restored = JSON.parse(stored) as FilterState;
      } catch { /* ignore */ }
    }
    if (restored) {
      setTitleTags(restored.titleTags ?? []);
      setKeywords(restored.keywords ?? '');
      setLocationTags(restored.locationTags ?? []);
      setOrgLocationTags(restored.orgLocationTags ?? []);
      setEmployeeRange(restored.employeeRange ?? '');
      setDomainTags(restored.domainTags ?? []);
      setIndustryTags(restored.industryTags ?? []);
      setSeniorityTags(restored.seniorityTags ?? []);
      setDepartmentTags(restored.departmentTags ?? []);
      setHasEmail(restored.hasEmail ?? false);
      setHasPhone(restored.hasPhone ?? false);
      setRevenueRange(restored.revenueRange ?? null);
      setFundingStageTags(restored.fundingStageTags ?? []);
    }
    initialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filters to URL + localStorage on change
  const currentFilters: FilterState = useMemo(() => ({
    titleTags, keywords, locationTags, orgLocationTags, employeeRange,
    domainTags, industryTags, seniorityTags, departmentTags,
    hasEmail, hasPhone, revenueRange, fundingStageTags,
  }), [titleTags, keywords, locationTags, orgLocationTags, employeeRange,
    domainTags, industryTags, seniorityTags, departmentTags,
    hasEmail, hasPhone, revenueRange, fundingStageTags]);

  useEffect(() => {
    if (!initialized.current) return;
    const encoded = encodeFilters(currentFilters);
    setSearchParams({ f: encoded }, { replace: true });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFilters)); } catch { /* quota */ }
  }, [currentFilters, setSearchParams]);

  // Results state
  const [results, setResults] = useState<ApolloContact[]>([]);
  const [pagination, setPagination] = useState({ page: 1, per_page: 25, total_entries: 0, total_pages: 0 });
  const [searchLogId, setSearchLogId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Selection & import state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ApolloImportResult | null>(null);
  const [importError, setImportError] = useState('');

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (titleTags.length) c++;
    if (keywords.trim()) c++;
    if (locationTags.length) c++;
    if (orgLocationTags.length) c++;
    if (employeeRange) c++;
    if (domainTags.length) c++;
    if (industryTags.length) c++;
    if (seniorityTags.length) c++;
    if (departmentTags.length) c++;
    if (hasEmail) c++;
    if (hasPhone) c++;
    if (revenueRange) c++;
    if (fundingStageTags.length) c++;
    return c;
  }, [titleTags, keywords, locationTags, orgLocationTags, employeeRange, domainTags, industryTags,
    seniorityTags, departmentTags, hasEmail, hasPhone, revenueRange, fundingStageTags]);

  const clearFilters = () => {
    setTitleTags([]); setTitleInput('');
    setKeywords('');
    setLocationTags([]); setLocationInput('');
    setOrgLocationTags([]); setOrgLocationInput('');
    setEmployeeRange('');
    setDomainTags([]); setDomainInput('');
    setIndustryTags([]); setIndustryInput('');
    setSeniorityTags([]);
    setDepartmentTags([]);
    setHasEmail(false);
    setHasPhone(false);
    setRevenueRange(null);
    setFundingStageTags([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  };

  const toggleQuickFilter = (tag: string, tags: string[], setTags: (t: string[]) => void) => {
    if (tags.includes(tag)) setTags(tags.filter(t => t !== tag));
    else setTags([...tags, tag]);
  };

  const filterMockData = useCallback((): ApolloContact[] => {
    let filtered = [...MOCK_PEOPLE];
    if (titleTags.length > 0) {
      filtered = filtered.filter(p => titleTags.some(t => p.title.toLowerCase().includes(t.toLowerCase())));
    }
    if (keywords.trim()) {
      const kw = keywords.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(kw) || p.title.toLowerCase().includes(kw) ||
        p.headline.toLowerCase().includes(kw) || (p.organization?.name ?? '').toLowerCase().includes(kw) ||
        (p.organization?.industry ?? '').toLowerCase().includes(kw)
      );
    }
    if (locationTags.length > 0) {
      filtered = filtered.filter(p => {
        const loc = [p.city, p.state, p.country].join(' ').toLowerCase();
        return locationTags.some(t => loc.includes(t.toLowerCase()));
      });
    }
    if (orgLocationTags.length > 0) {
      filtered = filtered.filter(p => {
        const loc = [p.city, p.state, p.country].join(' ').toLowerCase();
        return orgLocationTags.some(t => loc.includes(t.toLowerCase()));
      });
    }
    if (industryTags.length > 0) {
      filtered = filtered.filter(p =>
        industryTags.some(t => (p.organization?.industry ?? '').toLowerCase().includes(t.toLowerCase()) || p.headline.toLowerCase().includes(t.toLowerCase()))
      );
    }
    if (domainTags.length > 0) {
      filtered = filtered.filter(p =>
        domainTags.some(d => (p.organization?.website_url ?? '').toLowerCase().includes(d.toLowerCase()))
      );
    }
    if (hasEmail) {
      filtered = filtered.filter(p => !!p.email);
    }
    if (hasPhone) {
      filtered = filtered.filter(p => p.phone_numbers && p.phone_numbers.length > 0);
    }
    return filtered;
  }, [titleTags, keywords, locationTags, orgLocationTags, industryTags, domainTags, hasEmail, hasPhone]);

  const handleSearch = useCallback(async (page = 1) => {
    setSearching(true);
    setSearchError('');
    setImportResult(null);
    setImportError('');
    setHasSearched(true);

    if (demoMode) {
      await new Promise(r => setTimeout(r, 500));
      const filtered = filterMockData();
      setResults(filtered);
      setPagination({ page: 1, per_page: 25, total_entries: filtered.length, total_pages: 1 });
      setSearchLogId(null);
      setSelectedIds(new Set());
      setSearching(false);
      return;
    }

    try {
      const params: ApolloSearchParams = { page, per_page: 25 };
      if (titleTags.length) params.person_titles = titleTags;
      const kw = [keywords.trim(), ...industryTags].filter(Boolean).join(', ');
      if (kw) params.q_keywords = kw;
      if (locationTags.length) params.person_locations = locationTags;
      if (orgLocationTags.length) params.organization_locations = orgLocationTags;
      if (employeeRange) params.employee_ranges = [employeeRange];
      if (domainTags.length) params.q_organization_domains = domainTags;
      // Advanced filters
      if (seniorityTags.length) params.person_seniorities = seniorityTags;
      if (departmentTags.length) params.person_departments = departmentTags;
      if (hasEmail) params.contact_email_status = ['verified', 'guessed', 'unavailable'];
      if (hasPhone) params.prospected_by_current_team = ['no'];
      if (fundingStageTags.length) params.organization_latest_funding_stage_cd = fundingStageTags;
      if (revenueRange) {
        if (revenueRange.min !== undefined) params.organization_revenue_min = revenueRange.min;
        if (revenueRange.max !== undefined) params.organization_revenue_max = revenueRange.max;
      }

      const data: ApolloSearchResult = await searchApollo(params);
      setResults(data.people);
      setPagination(data.pagination);
      setSearchLogId(data.search_log_id);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [demoMode, filterMockData, titleTags, keywords, industryTags, locationTags, orgLocationTags,
    employeeRange, domainTags, seniorityTags, departmentTags, hasEmail, hasPhone, fundingStageTags, revenueRange]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === results.length ? new Set() : new Set(results.map(p => p.id)));
  };

  const handleImport = useCallback(async () => {
    const selected = results.filter(p => selectedIds.has(p.id));
    if (!selected.length) return;
    setImporting(true); setImportError(''); setImportResult(null);
    try {
      const data = await importApolloContacts(selected, searchLogId);
      setImportResult(data);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally { setImporting(false); }
  }, [results, selectedIds, searchLogId]);

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-slate-900">Find People</h1>
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(1); }}
              placeholder="Search people..."
              className="pl-8 pr-3 py-1.5 w-56 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDemoMode(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
              demoMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${demoMode ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {demoMode ? 'Demo' : 'Live'}
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {importing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Import {selectedIds.size}
            </button>
          )}
          <button
            onClick={() => navigate('/portal/leads')}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Back to Leads
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 px-5 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <div><span className="font-bold text-slate-800">{demoMode ? '12' : pagination.total_entries.toLocaleString()}</span> <span className="text-slate-400">Total</span></div>
          <div className="w-px h-3 bg-slate-200" />
          <div><span className="font-bold text-indigo-600">{results.length}</span> <span className="text-slate-400">Showing</span></div>
          <div className="w-px h-3 bg-slate-200" />
          <div><span className="font-bold text-slate-800">{selectedIds.size}</span> <span className="text-slate-400">Selected</span></div>
        </div>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-[11px] font-semibold text-red-400 hover:text-red-600 transition-colors">
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        {showFilters && (
          <div className="w-60 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
            <FilterSection icon={Icons.briefcase} label="Job Titles" count={titleTags.length} defaultOpen>
              <SidebarTagInput value={titleInput} onChange={setTitleInput} placeholder="Add title..." tags={titleTags} onTagsChange={setTitleTags} />
              <div className="flex flex-wrap gap-1 mt-2">
                {QUICK_TITLES.map(t => (
                  <QuickChip key={t} label={t} active={titleTags.includes(t)} onClick={() => toggleQuickFilter(t, titleTags, setTitleTags)} />
                ))}
              </div>
            </FilterSection>

            <FilterSection icon={Icons.hierarchy} label="Seniority" count={seniorityTags.length}>
              <MultiToggleList
                options={SENIORITY_OPTIONS}
                selected={seniorityTags}
                onChange={setSeniorityTags}
              />
            </FilterSection>

            <FilterSection icon={Icons.users} label="Departments" count={departmentTags.length}>
              <MultiToggleList
                options={DEPARTMENT_OPTIONS.map(d => ({ label: d, value: d }))}
                selected={departmentTags}
                onChange={setDepartmentTags}
              />
            </FilterSection>

            <FilterSection icon={Icons.mapPin} label="Location" count={locationTags.length} defaultOpen>
              <SidebarTagInput value={locationInput} onChange={setLocationInput} placeholder="Add location..." tags={locationTags} onTagsChange={setLocationTags} />
              <div className="flex flex-wrap gap-1 mt-2">
                {QUICK_LOCATIONS.map(l => (
                  <QuickChip key={l} label={l} active={locationTags.includes(l)} onClick={() => toggleQuickFilter(l, locationTags, setLocationTags)} />
                ))}
              </div>
            </FilterSection>

            <FilterSection icon={Icons.phone} label="Contact Info" count={(hasEmail ? 1 : 0) + (hasPhone ? 1 : 0)}>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasEmail}
                    onChange={e => setHasEmail(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  Has email address
                </label>
                <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPhone}
                    onChange={e => setHasPhone(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  Has phone number
                </label>
              </div>
            </FilterSection>

            <FilterSection icon={Icons.building} label="Company" count={domainTags.length}>
              <SidebarTagInput value={domainInput} onChange={setDomainInput} placeholder="e.g. stripe.com" tags={domainTags} onTagsChange={setDomainTags} />
            </FilterSection>

            <FilterSection icon={Icons.globe} label="Org Locations" count={orgLocationTags.length}>
              <SidebarTagInput value={orgLocationInput} onChange={setOrgLocationInput} placeholder="Add org location..." tags={orgLocationTags} onTagsChange={setOrgLocationTags} />
            </FilterSection>

            <FilterSection icon={Icons.users} label="# Employees" count={employeeRange ? 1 : 0}>
              <div className="space-y-1">
                {EMPLOYEE_RANGES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setEmployeeRange(employeeRange === r.value ? '' : r.value)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      employeeRange === r.value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    {r.label} employees
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection icon={Icons.tag} label="Industry & Keywords" count={industryTags.length} defaultOpen>
              <SidebarTagInput value={industryInput} onChange={setIndustryInput} placeholder="Add industry..." tags={industryTags} onTagsChange={setIndustryTags} />
              <div className="flex flex-wrap gap-1 mt-2">
                {QUICK_INDUSTRIES.map(ind => (
                  <QuickChip key={ind} label={ind} active={industryTags.includes(ind)} onClick={() => toggleQuickFilter(ind, industryTags, setIndustryTags)} />
                ))}
              </div>
            </FilterSection>

            <FilterSection icon={Icons.dollar} label="Revenue" count={revenueRange ? 1 : 0}>
              <div className="space-y-1">
                {REVENUE_RANGE_OPTIONS.map(opt => {
                  const isActive = revenueRange?.min === opt.min && revenueRange?.max === opt.max;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => setRevenueRange(isActive ? null : { min: opt.min, max: opt.max })}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection icon={Icons.rocket} label="Funding Stage" count={fundingStageTags.length}>
              <MultiToggleList
                options={FUNDING_STAGE_OPTIONS.map(s => ({ label: s, value: s }))}
                selected={fundingStageTags}
                onChange={setFundingStageTags}
              />
            </FilterSection>

            <FilterSection icon={Icons.mail} label="Email Status">
              <div className="flex flex-wrap gap-1">
                {['Verified', 'Unverified', 'Any'].map(s => (
                  <QuickChip key={s} label={s} active={false} onClick={() => {}} />
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 italic">Available with Apollo paid plan</p>
            </FilterSection>

            {/* Search button in sidebar */}
            <div className="px-4 py-4 border-t border-slate-100">
              <button
                onClick={() => handleSearch(1)}
                disabled={searching}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searching ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Searching...</>
                ) : (
                  <>{Icons.search} Search</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-slate-50/30">
          {/* Alerts */}
          {searchError && (
            <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
              <p className="text-xs text-red-600">{searchError}</p>
            </div>
          )}
          {importResult && (
            <div className="mx-5 mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center gap-3 text-xs">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="font-bold text-emerald-700">{importResult.imported} imported</span>
                {importResult.skipped > 0 && <span className="text-amber-600 font-semibold">{importResult.skipped} skipped</span>}
                {importResult.failed > 0 && <span className="text-red-600 font-semibold">{importResult.failed} failed</span>}
                <button onClick={() => navigate('/portal/leads')} className="ml-auto text-emerald-700 font-bold hover:underline">View Leads &rarr;</button>
              </div>
              {importResult.duplicates.length > 0 && (
                <div className="mt-2 pl-7 space-y-0.5">
                  {importResult.duplicates.map((d, i) => (
                    <p key={i} className="text-[11px] text-slate-500">{d.name} — <span className="italic">{d.reason}</span></p>
                  ))}
                </div>
              )}
            </div>
          )}
          {importError && (
            <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">Import error: {importError}</div>
          )}

          {/* Results table */}
          {results.length > 0 ? (
            <div className="m-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="pl-4 pr-2 py-2.5 w-10">
                        <input type="checkbox" checked={results.length > 0 && selectedIds.size === results.length} onChange={toggleSelectAll} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</th>
                      <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-20">LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {results.map(person => {
                      const location = [person.city, person.state, person.country].filter(Boolean).join(', ');
                      const sel = selectedIds.has(person.id);
                      return (
                        <tr key={person.id} onClick={() => toggleSelect(person.id)} className={`cursor-pointer transition-colors ${sel ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80'}`}>
                          <td className="pl-4 pr-2 py-2.5">
                            <input type="checkbox" checked={sel} onChange={() => toggleSelect(person.id)} onClick={e => e.stopPropagation()} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px] shrink-0">
                                {person.first_name?.charAt(0)}{person.last_name?.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-slate-800 truncate">{person.name}</div>
                                {person.title && <div className="text-[11px] text-slate-400 truncate">{person.title}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="text-[13px] text-slate-700 font-medium truncate">{person.organization?.name || '—'}</div>
                            {person.organization?.industry && <div className="text-[10px] text-slate-400 truncate">{person.organization.industry}</div>}
                          </td>
                          <td className="px-3 py-2.5">
                            {person.email ? <span className="text-[13px] text-slate-600">{person.email}</span> : <span className="text-[11px] text-slate-300 italic">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[13px] text-slate-500 truncate">{location || '—'}</td>
                          <td className="px-3 py-2.5">
                            {person.linkedin_url ? (
                              <a href={person.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-[12px] font-medium">
                                {Icons.linkedin} View
                              </a>
                            ) : <span className="text-[11px] text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                {pagination.total_pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <span className="text-xs text-slate-500">Page {pagination.page} of {pagination.total_pages}</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleSearch(pagination.page - 1)} disabled={pagination.page <= 1 || searching} className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
                      <button onClick={() => handleSearch(pagination.page + 1)} disabled={pagination.page >= pagination.total_pages || searching} className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Empty / initial state */
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-lg px-8">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">
                  {hasSearched ? 'No results found' : 'Find the right prospects'}
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  {hasSearched
                    ? 'Try adjusting your filters or broadening your search'
                    : 'Use the filters on the left to narrow your search, then click Search'
                  }
                </p>

                {/* Quick filters in empty state */}
                {!hasSearched && (
                  <div className="bg-white border border-slate-200 rounded-xl p-5 text-left space-y-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick filters</p>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Locations</p>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_LOCATIONS.map(l => (
                          <QuickChip key={l} label={l} active={locationTags.includes(l)} onClick={() => toggleQuickFilter(l, locationTags, setLocationTags)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Job Titles</p>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_TITLES.map(t => (
                          <QuickChip key={t} label={t} active={titleTags.includes(t)} onClick={() => toggleQuickFilter(t, titleTags, setTitleTags)} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Industry</p>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_INDUSTRIES.map(ind => (
                          <QuickChip key={ind} label={ind} active={industryTags.includes(ind)} onClick={() => toggleQuickFilter(ind, industryTags, setIndustryTags)} />
                        ))}
                      </div>
                    </div>
                    {demoMode && (
                      <p className="text-[10px] text-amber-600 font-medium bg-amber-50 px-2.5 py-1.5 rounded-lg inline-block">
                        Demo mode — results use sample data
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApolloSearchPage;
