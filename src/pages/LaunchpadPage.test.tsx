import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18next";
import "../i18n/index";

vi.mock("../api/client", () => ({
  api: {
    launchProjects: vi.fn().mockRejectedValue(new Error("network down")),
    ApiError: class ApiError extends Error {},
  },
}));

import { LaunchpadPage } from "./LaunchpadPage";

describe("LaunchpadPage 错误态快照", () => {
  it("项目列表加载失败 → 渲染 InlineError（默认 common.loadError）", async () => {
    const { asFragment } = render(
      <I18nextProvider i18n={i18n}>
        <LaunchpadPage />
      </I18nextProvider>,
    );
    expect(await screen.findByTestId("launch-error")).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });
});
