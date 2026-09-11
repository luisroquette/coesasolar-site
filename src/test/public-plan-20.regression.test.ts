import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizePublicDiscountClaim,
  PUBLIC_DISCOUNT_LABEL,
  PUBLIC_DISCOUNT_PERCENT,
} from "@/lib/public-discount";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public 20% plan", () => {
  it("keeps the public plan and calculator fixed at 20%", () => {
    const plans = read("src/components/home/PlansSection.tsx");
    const calculator = read("src/components/home/EconomyCalculator.tsx");

    expect(PUBLIC_DISCOUNT_PERCENT).toBe(20);
    expect(PUBLIC_DISCOUNT_LABEL).toBe("20%");
    expect(normalizePublicDiscountClaim("Economize até 30 %")).toBe("Economize 20%");
    expect(normalizePublicDiscountClaim("Economia de 15% a 30%")).toBe("Economia 20%");
    expect(plans).not.toContain("plans.map");
    expect(plans).not.toMatch(/15%|25%|30%/);
    expect(plans).not.toMatch(/>\s*Plano\s*</);
    expect(plans).not.toContain("Seu desconto é");
    expect(plans).toContain("Desconto transparente:");
    expect(plans).toContain("Sem obras ou instalação de painéis");
    expect(plans).toContain("Sem investimento inicial");
    expect(calculator).toContain("const descontoSelecionado = PUBLIC_DISCOUNT_PERCENT");
    expect(calculator).not.toContain("setDescontoSelecionado");
    expect(calculator).not.toContain("planOptions");
    expect(calculator).not.toMatch(/15%|25%|30%/);
  });

  it("removes legacy discounts from public-owned content", () => {
    const sources = [
      "src/app/layout.tsx",
      "src/components/blog/HomeBlogSection.tsx",
      "src/components/home/BenefitsSection.tsx",
      "src/components/home/EconomyCalculator.tsx",
      "src/components/home/HeroSection.tsx",
      "src/components/home/PlansSection.tsx",
      "src/hooks/useConfiguracoes.ts",
      "src/hooks/useFAQs.ts",
      "src/lib/autoblog-profile.ts",
      "src/lib/blog/supabase-blog.ts",
    ].map(read).join("\n");

    expect(sources).not.toMatch(/15%|25%|30%/);
    expect(sources).toContain("normalizePublicDiscountClaim(article.content)");
    expect(sources).not.toContain("slug: normalizePublicDiscountClaim");
  });
});
