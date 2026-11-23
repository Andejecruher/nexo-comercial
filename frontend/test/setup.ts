import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

configure({ reactStrictMode: false });

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

if (typeof window !== 'undefined') {
  window.ResizeObserver = ResizeObserverMock;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  // jsdom no implementa matchMedia y next-themes lo consulta al montar.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock('next/navigation', async () => {
  const navigation = await import('./utils/next-navigation');
  return {
    useRouter: () => navigation.getMockRouter(),
    usePathname: () => navigation.getMockPathname(),
    useSearchParams: () => navigation.getMockSearchParams(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: () => null,
}));
