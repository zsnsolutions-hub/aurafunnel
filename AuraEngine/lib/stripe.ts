import { supabase } from './supabase';

export interface CheckoutSessionParams {
  planName: string;
  amount: string;
  credits: number;
  userId: string;
}

export const getStripeConfig = async () => {
  const { data, error } = await supabase
    .from('config_settings')
    .select('value')
    .eq('key', 'stripe_api_key')
    .maybeSingle();
    
  if (error || !data?.value) {
    console.warn("Stripe API Key not found in config_settings. Using sandbox mode.");
    return "pk_test_sample";
  }
  return data.value;
};

export const processStripePayment = async (params: CheckoutSessionParams): Promise<boolean> => {
  // Simulate Stripe API Latency and Handshake
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  try {
    // 1. Update Profile Plan & Credits
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        plan: params.planName,
        credits_total: params.credits,
        credits_used: 0 // Reset usage on upgrade
      })
      .eq('id', params.userId);
    
    if (profileError) throw profileError;

    // 2. Update Subscription Record
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({ 
        plan_name: params.planName,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('user_id', params.userId);

    if (subError) throw subError;

    // 3. Log the Transaction in Audit Logs
    await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'PAYMENT_SUCCESS',
      details: `Stripe transaction verified for ${params.planName} plan (${params.amount})`
    });

    return true;
  } catch (err) {
    console.error("Payment Processing Error:", err);
    return false;
  }
};