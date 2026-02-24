/** Mock analytics — swap with Segment / Mixpanel / PostHog later. */

type EventName =
  | 'cta_click'
  | 'signup_start'
  | 'signup_success'
  | 'signup_error'
  | 'page_view'
  | 'pricing_view';

export function track(event: EventName, props?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.log(`[analytics] ${event}`, props ?? '');
  }
  // TODO: replace with real analytics SDK call
  // e.g. posthog.capture(event, props);
}
