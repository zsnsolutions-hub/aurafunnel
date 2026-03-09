import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, resolvePlanName } from './credits';

export interface TeamSeatInfo {
  currentMembers: number;
  pendingInvites: number;
  occupiedSeats: number;
  includedSeats: number;
  maxSeats: number | null;
  extraSeatsBought: number;
  totalAllowedSeats: number;
  canAddSeat: boolean;
  canBuyExtraSeat: boolean;
  extraSeatPrice: number;
  planName: string;
  teamId: string;
  ownerId: string;
}

export async function getTeamSeatInfo(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamSeatInfo> {
  // 1. Get team owner
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select('owner_id')
    .eq('id', teamId)
    .single();
  if (teamErr || !team) throw new Error('Team not found');

  const ownerId = team.owner_id;

  // 2. Get owner's plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', ownerId)
    .single();
  const planName = resolvePlanName(profile?.plan || 'Free');

  // 3. Get plan config
  const planCfg = PLANS.find(p => p.name === planName) || PLANS[0];
  const includedSeats = planCfg.seats;
  const maxSeats = planCfg.maxUsers ?? null;
  const extraSeatPrice = planCfg.extraSeatPrice ?? 0;

  // 4. Count current members
  const { count: memberCount } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);

  // 5. Count pending invites
  const { count: inviteCount } = await supabase
    .from('team_invites')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'pending');

  // 6. Get extra seats bought
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('extra_seats')
    .eq('user_id', ownerId)
    .maybeSingle();
  const extraSeatsBought = sub?.extra_seats ?? 0;

  const currentMembers = memberCount ?? 0;
  const pendingInvites = inviteCount ?? 0;
  const occupiedSeats = currentMembers + pendingInvites;
  const totalAllowedSeats = maxSeats !== null
    ? Math.min(includedSeats + extraSeatsBought, maxSeats)
    : includedSeats + extraSeatsBought;
  const canAddSeat = occupiedSeats < totalAllowedSeats;
  const canBuyExtraSeat = extraSeatPrice > 0 && (maxSeats === null || totalAllowedSeats < maxSeats);

  return {
    currentMembers,
    pendingInvites,
    occupiedSeats,
    includedSeats,
    maxSeats,
    extraSeatsBought,
    totalAllowedSeats,
    canAddSeat,
    canBuyExtraSeat,
    extraSeatPrice,
    planName,
    teamId,
    ownerId,
  };
}

export async function purchaseExtraSeat(
  supabase: SupabaseClient,
  teamId: string,
): Promise<{ success: boolean; message: string }> {
  const info = await getTeamSeatInfo(supabase, teamId);

  if (!info.canBuyExtraSeat) {
    return { success: false, message: `Your ${info.planName} plan has reached the maximum number of seats.` };
  }

  const newCount = info.extraSeatsBought + 1;

  const { error } = await supabase
    .from('subscriptions')
    .update({ extra_seats: newCount })
    .eq('user_id', info.ownerId);

  if (error) {
    return { success: false, message: 'Failed to update subscription. Please try again.' };
  }

  // Log the purchase
  try {
    await supabase.from('audit_logs').insert({
      user_id: info.ownerId,
      action: 'SEAT_PURCHASED',
      details: `Extra seat #${newCount} purchased at $${info.extraSeatPrice}/mo (team: ${teamId})`,
    });
  } catch { /* ignore */ }

  return { success: true, message: `Extra seat added (+$${info.extraSeatPrice}/mo). You now have ${info.includedSeats + newCount} total seats.` };
}
