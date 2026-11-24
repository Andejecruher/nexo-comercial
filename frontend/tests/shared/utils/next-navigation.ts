import { vi } from 'vitest';

type Router = {
  replace: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
};

const router: Router = {
  replace: vi.fn(),
  push: vi.fn(),
};

let pathname = '/';
let searchParams = new URLSearchParams();

const setMockPathname = (value: string) => {
  pathname = value;
};

const setMockSearchParams = (value: URLSearchParams) => {
  searchParams = value;
};

const resetMockRouter = () => {
  router.replace.mockReset();
  router.push.mockReset();
};

const getMockRouter = () => router;
const getMockPathname = () => pathname;
const getMockSearchParams = () => searchParams;

export {
  getMockPathname,
  getMockRouter,
  getMockSearchParams,
  resetMockRouter,
  setMockPathname,
  setMockSearchParams,
};
