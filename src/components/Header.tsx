export function Header({ symbol }: { symbol: string }) {
  return (
    <>
      <span className="logo">crypto-exchange</span>
      <span className="symbol">{symbol}</span>
    </>
  );
}
