import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { prefetchRoute } from '../lib/routePrefetchMap';

/**
 * Drop-in replacement for React Router's <Link> that prefetches
 * the target route's chunk on mouseenter / focus so navigation
 * feels instant.
 */
const PrefetchLink = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onMouseEnter, onFocus, ...rest }, ref) => {
    const path = typeof to === 'string' ? to : to.pathname ?? '';

    const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
      prefetchRoute(path);
      onMouseEnter?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLAnchorElement>) => {
      prefetchRoute(path);
      onFocus?.(e);
    };

    return (
      <Link
        ref={ref}
        to={to}
        onMouseEnter={handleMouseEnter}
        onFocus={handleFocus}
        {...rest}
      />
    );
  }
);

PrefetchLink.displayName = 'PrefetchLink';

export default PrefetchLink;
