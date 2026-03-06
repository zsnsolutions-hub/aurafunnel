import React, { startTransition, useCallback } from 'react';
import { useNavigate, type LinkProps } from 'react-router-dom';
import { prefetchRoute } from '../lib/routePrefetchMap';

/**
 * Drop-in replacement for React Router's <Link> that:
 * 1. Prefetches the target route's chunk on mouseenter / focus
 * 2. Wraps navigation in startTransition so the old page stays
 *    visible while the new lazy page loads (no Suspense flash)
 */
const PrefetchLink = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onClick, onMouseEnter, onFocus, ...rest }, ref) => {
    const path = typeof to === 'string' ? to : to.pathname ?? '';
    const navigate = useNavigate();

    const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks (ctrl/cmd+click, middle click) go through normally
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        onClick?.(e);
        return;
      }
      e.preventDefault();
      onClick?.(e);
      prefetchRoute(path);
      startTransition(() => {
        navigate(to);
      });
    }, [to, path, navigate, onClick]);

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
      prefetchRoute(path);
      onMouseEnter?.(e);
    }, [path, onMouseEnter]);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLAnchorElement>) => {
      prefetchRoute(path);
      onFocus?.(e);
    }, [path, onFocus]);

    return (
      <a
        ref={ref}
        href={`#${path}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onFocus={handleFocus}
        {...rest}
      />
    );
  }
);

PrefetchLink.displayName = 'PrefetchLink';

export default PrefetchLink;
