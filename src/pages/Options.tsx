import { useEffect, useState } from "react";
import { api, type OptionContract, type OptionPosition } from "../api/client";
import { useI18n } from "../i18n";
import { InlineError } from "../components/InlineError";
import { Button } from "../components/ui/button";
import { Modal } from "../components/Modal";

function fmtTime(ts: string | number): string {
  if (!ts) return "—";
  return new Date(Number(ts)).toLocaleString();
}

function fmtPrice(v: number): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function Options() {
  const { t } = useI18n();
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Open position form
  const [showOpen, setShowOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<OptionContract | null>(null);
  const [openSide, setOpenSide] = useState<"long" | "short">("long");
  const [openQty, setOpenQty] = useState("");
  const [opening, setOpening] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [cs, ps] = await Promise.all([api.optionContracts(), api.optionPositions()]);
      setContracts(cs);
      setPositions(ps);
    } catch (e: any) {
      setErr(e?.message ?? t("common.queryFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openForm = (c: OptionContract) => {
    setSelectedContract(c);
    setOpenSide("long");
    setOpenQty("1");
    setShowOpen(true);
    setMsg("");
  };

  const handleOpen = async () => {
    if (!selectedContract || !openQty || parseFloat(openQty) <= 0) {
      setMsg(t("options.qtyRequired"));
      return;
    }
    setOpening(true);
    setMsg("");
    try {
      await api.optionOpen({
        contract_id: selectedContract.id,
        side: openSide,
        quantity: parseFloat(openQty),
      });
      setMsg(t("options.openSuccess"));
      setShowOpen(false);
      load();
    } catch (e: any) {
      setMsg(e?.message ?? t("options.openFailed"));
    } finally {
      setOpening(false);
    }
  };

  const handleExercise = async (pos: OptionPosition) => {
    try {
      await api.optionExercise(pos.id);
      load();
    } catch { /* silent */ }
  };

  const openPositions = positions.filter((p) => p.status === "open");

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("options.title")}</h2>
      </div>
      <InlineError err={err} />
      {msg && <div className="ok">{msg}</div>}

      {/* Contracts */}
      <section className="card">
        <div className="card-head">
          <h3>{t("options.contractsTitle")}</h3>
        </div>
        {loading && <div className="muted">{t("common.loading")}</div>}
        {!loading && contracts.length === 0 && (
          <div className="muted" style={{ padding: 16 }}>{t("options.noContracts")}</div>
        )}
        {!loading && contracts.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("options.colUnderlying")}</th>
                <th>{t("col.type")}</th>
                <th>{t("options.colStrike")}</th>
                <th>{t("options.colExpiry")}</th>
                <th>{t("options.colPremium")}</th>
                <th>{t("options.colStyle")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="num">{c.id}</td>
                  <td>{c.underlying}/{c.quote_asset}</td>
                  <td>
                    <span style={{ color: c.type === "call" ? "var(--success)" : "var(--destructive)" }}>
                      {c.type === "call" ? t("options.typeCall") : t("options.typePut")}
                    </span>
                  </td>
                  <td className="num">{fmtPrice(c.strike)}</td>
                  <td className="muted">{fmtTime(c.expiry)}</td>
                  <td className="num">{fmtPrice(c.premium)}</td>
                  <td>{c.style}</td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => openForm(c)}>
                      {t("options.open")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Positions */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>{t("options.myPositions")}</h3>
        </div>
        {!loading && openPositions.length === 0 && (
          <div className="muted" style={{ padding: 16 }}>{t("options.noPositions")}</div>
        )}
        {openPositions.map((p) => {
          const c = p.contract;
          const isCall = c?.type === "call";
          const canExercise = c && (c.style === "american" || new Date(c.expiry) <= new Date());
          return (
            <div key={p.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>
                  {isCall ? t("options.typeCall") : t("options.typePut")} · {c?.underlying}/{c?.quote_asset}
                </span>
                <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                  #{p.id} · {t("options.colQty")}: {p.quantity} · {t("options.colPremium")}: {fmtPrice(p.premium)}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11, minWidth: 100 }}>{fmtTime(p.created_at)}</div>
              {canExercise && (
                <Button size="sm" variant="outline" onClick={() => handleExercise(p)}>
                  {t("options.exercise")}
                </Button>
              )}
            </div>
          );
        })}
      </section>

      {/* Open modal */}
      {showOpen && selectedContract && (
        <Modal
          title={t("options.openTitle")}
          onClose={() => setShowOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setShowOpen(false)}>{t("common.cancel")}</Button>
              <Button className="gap-1.5" onClick={handleOpen} disabled={opening}>
                {opening ? t("options.opening") : t("options.confirmOpen")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">{t("options.colUnderlying")}</span>
                <p className="font-semibold">{selectedContract.underlying}/{selectedContract.quote_asset}</p></div>
              <div><span className="text-muted-foreground">{t("options.colType")}</span>
                <p className="font-semibold">{selectedContract.type}</p></div>
              <div><span className="text-muted-foreground">{t("options.colStrike")}</span>
                <p className="font-semibold num">{fmtPrice(selectedContract.strike)}</p></div>
              <div><span className="text-muted-foreground">{t("options.colExpiry")}</span>
                <p className="font-semibold num">{fmtTime(selectedContract.expiry)}</p></div>
              <div><span className="text-muted-foreground">{t("options.colPremium")}</span>
                <p className="font-semibold num">{fmtPrice(selectedContract.premium)}</p></div>
              <div><span className="text-muted-foreground">{t("options.colStyle")}</span>
                <p className="font-semibold">{selectedContract.style}</p></div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("options.side")}</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={openSide === "long" ? "default" : "outline"}
                  className={openSide === "long" ? "!bg-[#0ECB81] !text-black" : ""}
                  onClick={() => setOpenSide("long")}
                >
                  {t("options.sideLong")}
                </Button>
                <Button
                  size="sm"
                  variant={openSide === "short" ? "default" : "outline"}
                  className={openSide === "short" ? "!bg-[#F6465D] !text-white" : ""}
                  onClick={() => setOpenSide("short")}
                >
                  {t("options.sideShort")}
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("options.colQty")}</label>
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.1"
                value={openQty}
                onChange={(e) => setOpenQty(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {t("options.estimatedCost")}: {fmtPrice(parseFloat(openQty || "0") * (selectedContract.premium ?? 0))} {selectedContract.quote_asset}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
