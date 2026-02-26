import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getPageTitle, getBreadcrumbs } from '../../lib/navConfig';
import { useUIMode } from '../ui-mode/UIModeProvider';

interface PageHeaderProps {
  /** Page title. Falls back to navConfig lookup if omitted. */
  title?: string;
  description?: string;
  /** Always-visible action buttons */
  actions?: React.ReactNode;
  /** Action buttons only shown in advanced mode */
  advancedActions?: React.ReactNode;
  /** Show breadcrumb trail from navConfig */
  breadcrumb?: boolean;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  advancedActions,
  breadcrumb = false,
  className = '',
}) => {
  const { pathname } = useLocation();
  const { isAdvanced } = useUIMode();

  const resolvedTitle = title ?? getPageTitle(pathname) ?? '';
  const crumbs = breadcrumb ? getBreadcrumbs(pathname) : [];
  const showBreadcrumb = breadcrumb && crumbs.length > 1;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 ${className}`}>
      <div className="min-w-0">
        {showBreadcrumb && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            {crumbs.slice(0, -1).map((crumb) => (
              <React.Fragment key={crumb.path}>
                <Link to={crumb.path} className="hover:text-gray-600 transition-colors">{crumb.label}</Link>
                <ChevronRight size={12} />
              </React.Fragment>
            ))}
            <span className="text-gray-500 font-medium">{crumbs[crumbs.length - 1].label}</span>
          </nav>
        )}
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">{resolvedTitle}</h1>
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      </div>
      {(actions || (isAdvanced && advancedActions)) && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {isAdvanced && advancedActions}
        </div>
      )}
    </div>
  );
};
