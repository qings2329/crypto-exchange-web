// 币种图标：按资产名确定性取色的渐变圆形徽标 + 首字母。
// 不依赖外部图片/图标库，杜绝币种图标缺失（404/加载失败）问题。
// 供资产卡片与划转弹窗等复用，保证视觉一致。

// 资产标识底色（按资产名确定性取色，贴近币安多色徽标）。
const BADGE_COLORS = [
  "from-[#FCD535] to-[#F0B90B]",
  "from-[#0ECB81] to-[#0B9E66]",
  "from-[#4B9EFF] to-[#2D6FE0]",
  "from-[#F6465D] to-[#C9334A]",
  "from-[#9B7CFF] to-[#6E4FD8]",
  "from-[#FF9F43] to-[#E07B1A]",
];

export function badgeGradient(asset: string): string {
  let h = 0;
  for (let i = 0; i < asset.length; i++) h = (h * 31 + asset.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length];
}

export function CoinBadge({
  asset,
  size = 36,
  fontSize,
}: {
  asset: string;
  size?: number;
  fontSize?: number;
}) {
  return (
    <span
      aria-hidden
      data-testid={`coin-badge-${asset}`}
      className={`grid shrink-0 select-none place-items-center rounded-full bg-gradient-to-br font-bold text-black ${badgeGradient(asset)}`}
      style={{ width: size, height: size, fontSize: fontSize ?? Math.round(size * 0.4) }}
    >
      {asset.charAt(0)}
    </span>
  );
}
