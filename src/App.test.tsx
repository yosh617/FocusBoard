import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("renders the dashboard and opens the accessible settings drawer", () => {
    render(<App />);
    expect(screen.getByLabelText("ポモドーロタイマー")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    expect(screen.getByRole("dialog", { name: "表示設定" })).toBeTruthy();
  });
});
