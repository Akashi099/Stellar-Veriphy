import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { SkipToContentLink } from "@/utils/accessibility";

expect.extend(toHaveNoViolations);

describe("accessibility checks", () => {
  it("ThemeToggle is free of accessibility violations", async () => {
    const { container } = render(<ThemeToggle />);

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it("SkipToContentLink is free of accessibility violations", async () => {
    const { container } = render(<SkipToContentLink />);

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});
