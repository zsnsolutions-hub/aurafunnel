import { supabase } from './supabase';

// ── Color Token Types ──

export type ColorToken =
  | 'slate' | 'red' | 'orange' | 'amber' | 'yellow' | 'green'
  | 'teal' | 'blue' | 'indigo' | 'violet' | 'pink' | 'rose';

export type StageColorMap = Record<string, ColorToken>;
export type ColorOverrideMap = Record<string, ColorToken>;

// ── Color Token Palette ──

export const COLOR_TOKENS: { token: ColorToken; label: string }[] = [
  { token: 'slate', label: 'Slate' },
  { token: 'red', label: 'Red' },
  { token: 'orange', label: 'Orange' },
  { token: 'amber', label: 'Amber' },
  { token: 'yellow', label: 'Yellow' },
  { token: 'green', label: 'Green' },
  { token: 'teal', label: 'Teal' },
  { token: 'blue', label: 'Blue' },
  { token: 'indigo', label: 'Indigo' },
  { token: 'violet', label: 'Violet' },
  { token: 'pink', label: 'Pink' },
  { token: 'rose', label: 'Rose' },
];

// ── Default Stage → Color Mapping ──

export const DEFAULT_STAGE_COLORS: StageColorMap = {
  New: 'slate',
  Contacted: 'blue',
  Qualified: 'amber',
  Converted: 'green',
  Lost: 'red',
};

// ── Tailwind Class Mappings ──

const COLOR_CLASS_MAP: Record<ColorToken, { dot: string; bg: string; text: string; border: string; ring: string; label: string }> = {
  slate:  { dot: 'bg-slate-500',  bg: 'bg-slate-50',  text: 'text-slate-700',  border: 'border-l-slate-500',  ring: 'ring-slate-400',  label: 'Slate' },
  red:    { dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-l-red-500',    ring: 'ring-red-400',    label: 'Red' },
  orange: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-l-orange-500', ring: 'ring-orange-400', label: 'Orange' },
  amber:  { dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-l-amber-500',  ring: 'ring-amber-400',  label: 'Amber' },
  yellow: { dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-l-yellow-500', ring: 'ring-yellow-400', label: 'Yellow' },
  green:  { dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-l-green-500',  ring: 'ring-green-400',  label: 'Green' },
  teal:   { dot: 'bg-teal-500',   bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-l-teal-500',   ring: 'ring-teal-400',   label: 'Teal' },
  blue:   { dot: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-l-blue-500',   ring: 'ring-blue-400',   label: 'Blue' },
  indigo: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-l-indigo-500', ring: 'ring-indigo-400', label: 'Indigo' },
  violet: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-l-violet-500', ring: 'ring-violet-400', label: 'Violet' },
  pink:   { dot: 'bg-pink-500',   bg: 'bg-pink-50',   text: 'text-pink-700',   border: 'border-l-pink-500',   ring: 'ring-pink-400',   label: 'Pink' },
  rose:   { dot: 'bg-rose-500',   bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-l-rose-500',   ring: 'ring-rose-400',   label: 'Rose' },
};

export function getColorClasses(token: ColorToken) {
  return COLOR_CLASS_MAP[token] || COLOR_CLASS_MAP.slate;
}

// ── Resolver ──

export function resolveLeadColor(
  lead: { id: string; status: string },
  stageColors: StageColorMap,
  overrides: ColorOverrideMap
): ColorToken {
  if (overrides[lead.id]) return overrides[lead.id];
  if (stageColors[lead.status]) return stageColors[lead.status];
  return (DEFAULT_STAGE_COLORS[lead.status] as ColorToken) || 'slate';
}

// ── CRUD: Stage Colors ──

export async function fetchStageColors(): Promise<StageColorMap> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ...DEFAULT_STAGE_COLORS };

  const { data, error } = await supabase
    .from('lead_stage_colors')
    .select('stage, color_token')
    .eq('owner_id', session.user.id);

  if (error || !data || data.length === 0) return { ...DEFAULT_STAGE_COLORS };

  const map: StageColorMap = { ...DEFAULT_STAGE_COLORS };
  for (const row of data) {
    map[row.stage] = row.color_token as ColorToken;
  }
  return map;
}

export async function saveStageColors(mapping: StageColorMap): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const rows = Object.entries(mapping).map(([stage, color_token]) => ({
    owner_id: session.user.id,
    stage,
    color_token,
    updated_at: new Date().toISOString(),
  }));

  await supabase
    .from('lead_stage_colors')
    .upsert(rows, { onConflict: 'owner_id,stage' });
}

// ── CRUD: Color Overrides ──

export async function fetchColorOverrides(): Promise<ColorOverrideMap> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};

  const { data, error } = await supabase
    .from('lead_color_overrides')
    .select('lead_id, color_token')
    .eq('owner_id', session.user.id);

  if (error || !data) return {};

  const map: ColorOverrideMap = {};
  for (const row of data) {
    map[row.lead_id] = row.color_token as ColorToken;
  }
  return map;
}

export async function setLeadColorOverride(leadId: string, token: ColorToken | null): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  if (token === null) {
    await supabase
      .from('lead_color_overrides')
      .delete()
      .eq('owner_id', session.user.id)
      .eq('lead_id', leadId);
  } else {
    await supabase
      .from('lead_color_overrides')
      .upsert(
        { owner_id: session.user.id, lead_id: leadId, color_token: token },
        { onConflict: 'owner_id,lead_id' }
      );
  }
}
