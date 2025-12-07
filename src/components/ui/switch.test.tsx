import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders', () => {
    render(<Switch aria-label="Toggle" />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('can be checked by default', () => {
    render(<Switch defaultChecked aria-label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('can be unchecked by default', () => {
    render(<Switch aria-label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
  });

  it('calls onCheckedChange when toggled', () => {
    const handleChange = vi.fn();
    render(<Switch onCheckedChange={handleChange} aria-label="Toggle" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('can be disabled', () => {
    render(<Switch disabled aria-label="Toggle" />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('applies custom className', () => {
    render(<Switch className="custom-class" aria-label="Toggle" />);
    expect(screen.getByRole('switch').className).toContain('custom-class');
  });

  it('applies switch styles', () => {
    render(<Switch aria-label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl.className).toContain('peer');
    expect(switchEl.className).toContain('rounded-full');
  });
});
