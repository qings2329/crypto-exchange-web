export function Header({ symbol }: { symbol: string }) {
  return (
    <header className="header">
      <span className="logo">crypto-exchange</span>
      <span className="symbol">{symbol}</span>
    </header>
  );
}
