import type { JSX } from 'react';

type IconProps = {
  className?: string;
  content?: string;
};

const Icon = ({ className, content }: IconProps): JSX.Element => (
  <span className={`font-mono ${className || ''}`} aria-hidden="true">
    {content || '󰖟'}
  </span>
);

export default Icon;
