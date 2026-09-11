import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_DISCOUNT_LABEL, PUBLIC_DISCOUNT_PERCENT } from "@/lib/public-discount";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public 20% plan", () => {
  it("keeps the public plan and calculator fixed at 20%", () => {
    const plans = read("src/components/home/PlansSection.tsx");
    const calculator = read("src/components/home/EconomyCalculator.tsx");

    expect(PUBLIC_DISCOUNT_PERCENT).toBe(20);
    expect(PUBLIC_DISCOUNT_LABEL).toBe("20%");
    expect(plans).not.toContain("plans.map");
    expect(plans).not.toMatch(/15%|25%|30%/);
    expect(calculator).toContain("const descontoSelecionado = PUBLIC_DISCOUNT_PERCENT");
    expect(calculator).not.toContain("setDescontoSelecionado");
    expect(calculator).not.toContain("planOptions");
    expect(calculator).not.toMatch(/15%|25%|30%/);
  });
});
