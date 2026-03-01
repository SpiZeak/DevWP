import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  const mockIcon = {
    title: 'Test Icon',
    slug: 'testicon',
    hex: '000000',
    source: 'Test',
    path: 'M0 0h24v24H0z',
  };

  it('renders correctly with default size', () => {
    const { container } = render(<BrandLogo icon={mockIcon} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('d', mockIcon.path);
  });

  it('applies custom size and className', () => {
    const { container } = render(
      <BrandLogo icon={mockIcon} size={32} className="custom-class" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
    expect(svg).toHaveClass('custom-class');
  });
});
