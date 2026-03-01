import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Toggle from './Toggle';

describe('Toggle', () => {
  it('renders toggle correctly', () => {
    const { container } = render(<Toggle title="Test Toggle" />);
    expect(container.querySelector('input')).not.toBeChecked();
  });

  it('renders checked state', () => {
    const { container } = render(<Toggle checked={true} />);
    expect(container.querySelector('input')).toBeChecked();
  });

  it('calls onChange when clicked', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <Toggle checked={false} onChange={handleChange} />,
    );
    const input = container.querySelector('input');
    fireEvent.click(input!);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('disables input when disabled is true', () => {
    const { container } = render(<Toggle disabled={true} />);
    expect(container.querySelector('input')).toBeDisabled();
  });
});
