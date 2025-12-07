import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from './section-header';

describe('SectionHeader', () => {
  it('renders the label', () => {
    render(<SectionHeader number="01" label="identity" />);
    expect(screen.getByText(/identity/)).toBeInTheDocument();
  });

  it('renders the number', () => {
    render(<SectionHeader number="01" label="identity" />);
    expect(screen.getByText(/01/)).toBeInTheDocument();
  });

  it('renders with the // prefix pattern', () => {
    render(<SectionHeader number="01" label="identity" data-testid="header" />);
    const header = screen.getByTestId('header');
    expect(header.textContent).toContain('//');
  });

  it('renders action when provided', () => {
    render(
      <SectionHeader
        number="01"
        label="identity"
        action={<button>Edit</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('applies section-header class', () => {
    render(<SectionHeader number="01" label="identity" data-testid="header" />);
    expect(screen.getByTestId('header').className).toContain('section-header');
  });

  it('applies custom className', () => {
    render(
      <SectionHeader
        number="01"
        label="identity"
        className="custom-class"
        data-testid="header"
      />
    );
    expect(screen.getByTestId('header').className).toContain('custom-class');
  });

  it('renders without number when not provided', () => {
    render(<SectionHeader label="settings" data-testid="header" />);
    const header = screen.getByTestId('header');
    expect(header.textContent).toContain('//');
    expect(header.textContent).toContain('settings');
    expect(header.textContent).not.toContain('01');
  });

  it('renders dot marker when showDot is true', () => {
    render(<SectionHeader label="identity" showDot data-testid="header" />);
    const header = screen.getByTestId('header');
    const dot = header.querySelector('.marker-dot');
    expect(dot).toBeInTheDocument();
    expect(header.textContent).not.toContain('//');
  });

  it('renders // prefix by default (showDot false)', () => {
    render(<SectionHeader label="identity" data-testid="header" />);
    const header = screen.getByTestId('header');
    expect(header.textContent).toContain('//');
    expect(header.querySelector('.marker-dot')).not.toBeInTheDocument();
  });
});
