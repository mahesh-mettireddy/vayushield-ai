import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../components/ErrorBoundary';

function ExplodingView({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated UI failure');
  }
  return <p>Healthy dashboard view</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ExplodingView shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Healthy dashboard view')).toBeInTheDocument();
  });

  it('renders an accessible fallback alert, supports recovery on retry, and has zero axe violations', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    function Wrapper() {
      const [broken, setBroken] = useState(true);
      return (
        <ErrorBoundary
          onReset={() => {
            onReset();
            setBroken(false);
          }}
        >
          <ExplodingView shouldThrow={broken} />
        </ErrorBoundary>
      );
    }

    const { container } = render(<Wrapper />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Healthy dashboard view')).toBeVisible();
  });

  it('provides a reload action in the fallback UI', async () => {
    const user = userEvent.setup();
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: reloadSpy },
      configurable: true
    });

    try {
      render(
        <ErrorBoundary>
          <ExplodingView shouldThrow={true} />
        </ErrorBoundary>
      );
      await user.click(screen.getByRole('button', { name: 'Reload page' }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        configurable: true
      });
    }
  });
});
