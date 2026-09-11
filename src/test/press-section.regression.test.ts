import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("homepage press section", () => {
  it("renders all supplied previews immediately after the about section", () => {
    const homepage = read("src/screens/Index.tsx");
    const section = read("src/components/home/PressSection.tsx");

    expect(homepage).toMatch(/<AboutSection\s*\/>\s*<PressSection\s*\/>/);
    expect(section.match(/href: "https:\/\//g)).toHaveLength(9);
    expect(section.match(/logo: "\/media\/press\//g)).toHaveLength(9);
    expect(section).not.toContain("image:");
    expect(section).toContain("object-contain");
    expect(section).toContain('id="imprensa"');
    expect(section).toContain("<Carousel");
  });
});
