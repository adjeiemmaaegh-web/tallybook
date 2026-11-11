import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShopHelp } from "./ShopHelp";
import { filterHelp, HELP_TOPICS } from "./shopHelpContent";

describe("help content", () => {
  it("every topic has a question, at least one answer paragraph and a unique id", () => {
    expect(new Set(HELP_TOPICS.map(t => t.id)).size).toBe(HELP_TOPICS.length);
    for (const t of HELP_TOPICS) { expect(t.question.endsWith("?")).toBe(true); expect(t.answer.length).toBeGreaterThan(0); expect(t.answer.every(p => p.length > 20)).toBe(true); }
  });
  it("search needs every word to match; roles see their own plus the shared topics", () => {
    expect(filterHelp(HELP_TOPICS, "refund approve").map(t => t.id)).toEqual(["refunds"]);
    expect(filterHelp(HELP_TOPICS, "zzzz")).toEqual([]);
    const owner = filterHelp(HELP_TOPICS, "", "owner").map(t => t.id), attendant = filterHelp(HELP_TOPICS, "", "attendant").map(t => t.id);
    expect(owner).toContain("setup"); expect(owner).not.toContain("join");
    expect(attendant).toContain("join"); expect(attendant).not.toContain("setup"); expect(attendant).toContain("sell");
  });
  it("says nothing the app does not do: no promise of moving money, and costs stay private", () => {
    const text = HELP_TOPICS.map(t => t.answer.join(" ")).join(" ");
    expect(text).toMatch(/Tallybook keeps records/);
    expect(text).toMatch(/never see what things cost/);
  });
});

describe("help panel", () => {
  it("opens from the footer, searches, and closes", () => {
    render(<ShopHelp role="owner" />);
    expect(screen.queryByLabelText("Search help")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Help and questions" }));
    expect(screen.getByText("How do I set up my shop?")).toBeInTheDocument();
    expect(screen.queryByText("How do I join my employer's shop?")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "offline" } });
    expect(screen.getByText("What works without internet?")).toBeInTheDocument();
    expect(screen.queryByText("How do I set up my shop?")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "qqqq" } });
    expect(screen.getByRole("status")).toHaveTextContent("Nothing matches");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("Search help")).toBeNull();
  });
  it("an attendant sees their topics first and can widen to everything", () => {
    render(<ShopHelp role="attendant" />);
    fireEvent.click(screen.getByRole("button", { name: "Help and questions" }));
    expect(screen.getByText("How do I join my employer's shop?")).toBeInTheDocument();
    expect(screen.queryByText("How do I set up my shop?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Everything" }));
    expect(screen.getByText("How do I set up my shop?")).toBeInTheDocument();
  });
  it("shows everything when the role is not known yet (before joining a shop)", () => {
    render(<ShopHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Help and questions" }));
    expect(screen.getByText("How do I set up my shop?")).toBeInTheDocument();
    expect(screen.getByText("How do I join my employer's shop?")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
  });
});
