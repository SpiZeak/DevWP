import type { JSX } from 'react';
import type { SimpleIcon } from 'simple-icons';

interface BrandLogoProps {
  icon: SimpleIcon;
  size?: number;
  className?: string;
}

export function BrandLogo({
  icon,
  size = 24,
  className,
}: BrandLogoProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`text-seasalt-400 ${className}`}
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d={icon.path} />
    </svg>
  );
}
