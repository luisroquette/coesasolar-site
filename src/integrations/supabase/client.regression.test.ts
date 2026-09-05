import { describe, it, expect, beforeEach, vi } from "vitest";

describe("REGRESSÃO: client Supabase legado não explode sem envs no prerender", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("import não lança quando NEXT_PUBLIC_SUPABASE_* estão ausentes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(import("./client")).resolves.toBeDefined();
  });

  it("usar o client sem envs lança erro claro só no uso", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { supabase } = await import("./client");
    expect(() => supabase.from("qualquer_tabela")).toThrow(/NEXT_PUBLIC_SUPABASE/);
  });
});
