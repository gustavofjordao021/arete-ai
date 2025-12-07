import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a div element', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton').tagName).toBe('DIV');
  });

  it('applies base skeleton classes', () => {
    render(<Skeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('bg-muted');
    expect(skeleton.className).toContain('rounded-md');
  });

  it('applies custom className', () => {
    render(<Skeleton className="w-32 h-4" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.className).toContain('w-32');
    expect(skeleton.className).toContain('h-4');
  });

  it('forwards additional props', () => {
    render(<Skeleton data-testid="skeleton" aria-label="Loading" />);
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-label', 'Loading');
  });
});
