import "@testing-library/jest-dom";
import { vi } from "vitest";

// Radix (Checkbox usado no CandidaturaForm) mede o tamanho do input via
// ResizeObserver, ausente no jsdom.
vi.stubGlobal("ResizeObserver", vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
