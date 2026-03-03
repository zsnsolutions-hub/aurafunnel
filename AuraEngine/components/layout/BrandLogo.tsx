import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../lib/brand';

interface BrandLogoProps {
  /** Where the logo links to */
  to?: string;
  /** Use collapsed (icon-only) variant */
  collapsed?: boolean;
  /** 'light' backgrounds use the light logo, 'dark' backgrounds use the dark logo */
  background?: 'light' | 'dark';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  to = '/',
  collapsed = false,
  background = 'light',
  className = '',
}) => {
  const src = background === 'light' ? BRAND.logo.light : BRAND.logo.dark;

  const img = collapsed ? (
    <img
      src={src}
      alt={BRAND.name}
      width={BRAND.logoCollapsedSize.width}
      height={BRAND.logoCollapsedSize.height}
      className="h-8 w-auto"
    />
  ) : (
    <img
      src={src}
      alt={BRAND.name}
      width={BRAND.logoSize.width}
      height={BRAND.logoSize.height}
      className="h-10 w-auto"
    />
  );

  return (
    <Link to={to} className={`flex items-center ${className}`}>
      {img}
    </Link>
  );
};
