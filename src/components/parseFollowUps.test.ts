import { describe, it, expect } from "vitest";
import { parseFollowUps } from "./AiPanel";

describe("parseFollowUps", () => {
  it("returns the full plan as body when the Follow-ups section is absent", () => {
    const plan = "## 1. Fix images · Quick · LCP −1.2 s\nUse next/image.";
    expect(parseFollowUps(plan)).toEqual({ body: plan, chips: [] });
  });

  it("splits the plan at the Follow-ups section", () => {
    const plan =
      "## 1. Fix images · Quick · LCP −1.2 s\nUse next/image.\n## Follow-ups\n- How much will LCP improve?\n- Which images matter most?\n- Should I use priority?";
    const { body, chips } = parseFollowUps(plan);
    expect(body).toBe("## 1. Fix images · Quick · LCP −1.2 s\nUse next/image.");
    expect(chips).toEqual([
      "How much will LCP improve?",
      "Which images matter most?",
      "Should I use priority?",
    ]);
  });

  it("strips leading bullet markers from chips", () => {
    const plan = "body\n## Follow-ups\n- Question A\n* Question B";
    expect(parseFollowUps(plan).chips).toEqual(["Question A", "Question B"]);
  });

  it("ignores blank lines in the Follow-ups tail", () => {
    const plan = "body\n## Follow-ups\n\n- Q1\n\n- Q2";
    expect(parseFollowUps(plan).chips).toEqual(["Q1", "Q2"]);
  });

  it("caps chips at four", () => {
    const plan =
      "body\n## Follow-ups\n- A\n- B\n- C\n- D\n- E";
    expect(parseFollowUps(plan).chips).toHaveLength(4);
  });

  it("trims whitespace from chip text", () => {
    const plan = "body\n## Follow-ups\n-  padded question  ";
    expect(parseFollowUps(plan).chips).toEqual(["padded question"]);
  });
});
