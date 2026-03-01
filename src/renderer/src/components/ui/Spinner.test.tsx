import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Spinner from './Spinner';

describe('Spinner', () => {
  it('renders with default title', () => {
    const { getAllByTitle } = render(<Spinner />);
    expect(getAllByTitle('Loading')[0]).toBeInTheDocument();
  });

  it('renders with custom title, className, and svgClass', () => {
    const { getAllByTitle, container } = render(
      <Spinner
        title="Please wait"
        className="custom-wrapper"
        svgClass="custom-svg"
      />,
    );
    expect(getAllByTitle('Please wait')[0]).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('custom-wrapper');
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('custom-svg');
  });
});
