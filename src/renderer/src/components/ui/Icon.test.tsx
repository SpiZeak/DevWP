import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Icon from './Icon';

describe('Icon', () => {
  it('renders with default content', () => {
    const { getByText } = render(<Icon />);
    expect(getByText('󰖟')).toBeInTheDocument();
  });

  it('renders with custom content and className', () => {
    const { getByText, container } = render(
      <Icon content="A" className="text-red-500" />,
    );
    expect(getByText('A')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-red-500');
  });
});
