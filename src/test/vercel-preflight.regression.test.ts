import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Vercel preflight contract", () => {
  it("keeps local hook and CI on the deploy gate", () => {
    const pkg = JSON.parse(read("package.json"));
    const workflow = read(".github/workflows/ci.yml");

    expect(pkg.engines.node).toBe("24.x");
    expect(pkg.scripts.preflight).toBe("npm test && npm run build");
    expect(read(".githooks/pre-push")).toContain("npm run preflight");
    expect(workflow).toContain("run: npm run preflight");
    expect(workflow).not.toContain("continue-on-error");
    expect(
      [...workflow.matchAll(/uses:\s+([^\s]+)/g)].every((match) =>
        /@[a-f0-9]{40}$/.test(match[1]),
      ),
    ).toBe(true);
    expect(read("next.config.js")).toContain("outputFileTracingRoot: __dirname");
  });
});
