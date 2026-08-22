import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/i18next";
import "../../i18n/index";

vi.mock("../../api/client", () => ({
  api: {
    otcAds: vi.fn().mockRejectedValue(new Error("network down")),
  },
}));

import { MerchantList } from "./MerchantList";

describe("MerchantList 错误态快照", () => {
  it("OTC 广告加载失败 → 渲染 InlineError（默认 common.loadError）", async () => {
    const { asFragment } = render(
      <I18nextProvider i18n={i18n}>
        <MerchantList onTrade={() => {}} />
      </I18nextProvider>,
    );
    expect(await screen.findByTestId("ads-error")).toBeInTheDocument();
    expect(asFragment()).toMatchSnapshot();
  });
});
