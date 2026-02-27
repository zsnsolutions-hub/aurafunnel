import React from 'react';
import {
  Target, Users, Brain, Compass, Sparkles, PenSquare, GitBranch,
  Send, PieChart, MessageSquare, Zap, LayoutGrid, Plug, Mail,
  SlidersHorizontal, CreditCard, FileText, Settings, BookOpen,
  HelpCircle,
} from 'lucide-react';

// ── Types ──

export type NavSection =
  | 'primary'
  | 'tools'
  | 'workspace'
  | 'billing'
  | 'settings';

export interface NavConfigItem {
  /** Route path (relative to /portal) */
  route: string;
  /** Label shown in sidebar nav */
  navLabel: string;
  /** Canonical page title rendered by PageHeader */
  pageTitle: string;
  /** Lucide icon component */
  icon: React.FC<{ size?: number }>;
  /** Navigation section grouping */
  section: NavSection;
  /** Display order within section */
  order: number;
  /** Nested child routes */
  children?: NavConfigItem[];
  /** Visual divider above this item */
  divider?: boolean;
  /** Non-clickable section header (children always visible) */
  isGroup?: boolean;
  /** Badge text (e.g. "2 active") — set dynamically at render time */
  badge?: string;
  /** Whether this item is visible in simplified mode (default true) */
  simplifiedVisible?: boolean;
}

// ── Config ──

export const NAV_CONFIG: NavConfigItem[] = [
  // ── Primary ──
  {
    route: '/portal',
    navLabel: 'Home',
    pageTitle: 'Home',
    icon: Target,
    section: 'primary',
    order: 0,
  },
  {
    route: '/portal/leads',
    navLabel: 'Leads',
    pageTitle: 'Leads',
    icon: Users,
    section: 'primary',
    order: 1,
    children: [
      {
        route: '/portal/leads/apollo',
        navLabel: 'Find Prospects',
        pageTitle: 'Find Prospects',
        icon: Compass,
        section: 'primary',
        order: 0,
      },
      {
        route: '/portal/intelligence',
        navLabel: 'Lead Insights',
        pageTitle: 'Lead Insights',
        icon: Brain,
        section: 'primary',
        order: 1,
      },
    ],
  },
  {
    route: '/portal/content',
    navLabel: 'Campaigns',
    pageTitle: 'Campaigns',
    icon: Sparkles,
    section: 'primary',
    order: 2,
    children: [
      {
        route: '/portal/content-studio',
        navLabel: 'Content Studio',
        pageTitle: 'Content Studio',
        icon: PenSquare,
        section: 'primary',
        order: 0,
      },
      {
        route: '/portal/automation',
        navLabel: 'Automations',
        pageTitle: 'Automations',
        icon: GitBranch,
        section: 'primary',
        order: 1,
      },
    ],
  },
  {
    route: '/portal/social-scheduler',
    navLabel: 'Social',
    pageTitle: 'Social',
    icon: Send,
    section: 'primary',
    order: 3,
    children: [
      {
        route: '/portal/blog',
        navLabel: 'Blog Posts',
        pageTitle: 'Blog Posts',
        icon: PenSquare,
        section: 'primary',
        order: 0,
      },
    ],
  },
  {
    route: '/portal/analytics',
    navLabel: 'Reports',
    pageTitle: 'Reports',
    icon: PieChart,
    section: 'primary',
    order: 4,
  },

  // ── Tools ──
  {
    route: '/portal/ai',
    navLabel: 'AI Assistant',
    pageTitle: 'AI Assistant',
    icon: MessageSquare,
    section: 'tools',
    order: 0,
    divider: true,
  },
  {
    route: '/portal/strategy',
    navLabel: 'Tasks',
    pageTitle: 'Tasks',
    icon: Zap,
    section: 'tools',
    order: 1,
    children: [
      {
        route: '/portal/team-hub',
        navLabel: 'Board View',
        pageTitle: 'Board View',
        icon: LayoutGrid,
        section: 'tools',
        order: 0,
      },
    ],
  },

  // ── Workspace (group) ──
  {
    route: '',
    navLabel: 'Workspace',
    pageTitle: '',
    icon: Plug,
    section: 'workspace',
    order: 0,
    isGroup: true,
    divider: true,
    children: [
      {
        route: '/portal/integrations',
        navLabel: 'Integrations',
        pageTitle: 'Integrations',
        icon: Plug,
        section: 'workspace',
        order: 0,
      },
      {
        route: '/portal/sender-accounts',
        navLabel: 'Sender Accounts',
        pageTitle: 'Sender Accounts',
        icon: Mail,
        section: 'workspace',
        order: 1,
      },
      {
        route: '/portal/model-training',
        navLabel: 'AI Settings',
        pageTitle: 'AI Settings',
        icon: SlidersHorizontal,
        section: 'workspace',
        order: 2,
        simplifiedVisible: false,
      },
    ],
  },

  // ── Billing (group) ──
  {
    route: '',
    navLabel: 'Billing',
    pageTitle: '',
    icon: CreditCard,
    section: 'billing',
    order: 0,
    isGroup: true,
    children: [
      {
        route: '/portal/billing',
        navLabel: 'Subscription',
        pageTitle: 'Subscription',
        icon: CreditCard,
        section: 'billing',
        order: 0,
      },
      {
        route: '/portal/invoices',
        navLabel: 'Billing History',
        pageTitle: 'Billing History',
        icon: FileText,
        section: 'billing',
        order: 1,
      },
    ],
  },

  // ── Settings ──
  {
    route: '/portal/settings',
    navLabel: 'Settings',
    pageTitle: 'Settings',
    icon: Settings,
    section: 'settings',
    order: 0,
    children: [
      {
        route: '/portal/manual',
        navLabel: 'User Manual',
        pageTitle: 'User Manual',
        icon: BookOpen,
        section: 'settings',
        order: 0,
      },
      {
        route: '/portal/help',
        navLabel: 'Help Center',
        pageTitle: 'Help Center',
        icon: HelpCircle,
        section: 'settings',
        order: 1,
      },
    ],
  },
];

// ── Helpers ──

/** Flat map of route → config item (includes children) */
const _routeMap = new Map<string, NavConfigItem>();
function populateMap(items: NavConfigItem[]) {
  for (const item of items) {
    if (item.route) _routeMap.set(item.route, item);
    if (item.children) populateMap(item.children);
  }
}
populateMap(NAV_CONFIG);

/** Look up a nav config entry by its route path */
export function getNavItem(route: string): NavConfigItem | undefined {
  return _routeMap.get(route);
}

/** Get the canonical page title for a route */
export function getPageTitle(route: string): string | undefined {
  return _routeMap.get(route)?.pageTitle;
}

/** Find the parent nav item for a child route */
export function getParentNavItem(route: string): NavConfigItem | undefined {
  for (const item of NAV_CONFIG) {
    if (item.children?.some(c => c.route === route)) return item;
  }
  return undefined;
}

/** Build breadcrumb segments for a route: [{ label, path }] */
export function getBreadcrumbs(route: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [];
  const parent = getParentNavItem(route);
  if (parent && parent.route) {
    crumbs.push({ label: parent.navLabel, path: parent.route });
  }
  const current = getNavItem(route);
  if (current) {
    crumbs.push({ label: current.pageTitle, path: current.route });
  }
  return crumbs;
}
