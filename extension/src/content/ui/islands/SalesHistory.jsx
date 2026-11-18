// Historique graphique des ventes d'une enchère, ouvert depuis le bouton du marché du site.
import {useEffect, useMemo, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {auctionById, auctionVersion, loadAuction} from "../../features/market";
import {loadSalesHistory} from "../../features/sales-history";
import {Icon, Modal, Notice, Progress, fmt} from "../components";
import {L, LOCALE} from "../../../shared/i18n";

function Chart({sales}) {
  const sampled = sales.length > 500 ? Array.from({length: 500}, (_, i) => sales[Math.round(i * (sales.length - 1) / 499)]) : sales;
  const firstDate = sampled[0]?.date.getTime() || 0;
  const lastDate = sampled.at(-1)?.date.getTime() || 0;
  const prices = sampled.map((sale) => sale.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const points = sampled.map((sale) => ({
    ...sale,
    x: 36 + (lastDate === firstDate ? 0.5 : (sale.date.getTime() - firstDate) / (lastDate - firstDate)) * 568,
    y: 18 + (max === min ? 0.5 : 1 - (sale.price - min) / (max - min)) * 126,
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return <div class="sales-history-chart-wrap">
    <div class="sales-history-summary">{L(`${fmt(sales.length)} ventes · ${sales[0].date.toLocaleDateString(LOCALE)} – ${sales.at(-1).date.toLocaleDateString(LOCALE)}`, `${fmt(sales.length)} sales · ${sales[0].date.toLocaleDateString(LOCALE)} – ${sales.at(-1).date.toLocaleDateString(LOCALE)}`)}</div>
    <svg class="sales-history-chart" viewBox="0 0 640 174" role="img" aria-label={L("Prix des ventes dans le temps", "Sale prices over time")}>
      <path class="sales-grid" d="M36 18H604M36 81H604M36 144H604" />
      <text x="32" y="14" text-anchor="end">{fmt(max)} ₩</text>
      <text x="32" y="143" text-anchor="end">{fmt(min)} ₩</text>
      {path && <path class="sales-history-line" d={path} />}
      {points.map((p) => <circle cx={p.x} cy={p.y} r="2.3"><title>{`${p.date.toLocaleDateString(LOCALE)} · ${fmt(p.price)} ₩`}</title></circle>)}
      <text x="36" y="169">{sampled[0].date.toLocaleDateString(LOCALE)}</text>
      <text x="604" y="169" text-anchor="end">{sampled.at(-1).date.toLocaleDateString(LOCALE)}</text>
    </svg>
  </div>;
}

export function SalesHistory({auctionId}) {
  const version = useStore(auctionVersion);
  const auction = auctionById(auctionId);
  const cardId = auction?.card_id || auction?.card?.id;
  const rarity = auction?.snapshot_rarity || auction?.card?.rarity;
  const shiny = Boolean(auction?.is_shiny);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({cardId: null, sales: null, loading: false, error: null});

  useEffect(() => {
    if (!auction?.card && !cardId) loadAuction(auctionId).catch(() => {});
  }, [auctionId, version]);
  useEffect(() => {
    setOpen(false);
    setState({cardId: null, sales: null, loading: false, error: null});
  }, [cardId]);

  const sales = useMemo(() => (state.cardId === cardId ? state.sales || [] : []).map((sale) => ({
    date: new Date(sale.settled_at),
    price: Number(sale.final_price),
    rarity: sale.snapshot_rarity,
    shiny: Boolean(sale.is_shiny),
  })).filter((sale) => Number.isFinite(sale.date.getTime()) && Number.isFinite(sale.price) && sale.rarity === rarity && sale.shiny === shiny), [state, cardId, rarity, shiny]);

  const show = async () => {
    setOpen(true);
    if (!cardId || state.cardId === cardId || state.loading) return;
    setState({cardId, sales: null, loading: true, error: null});
    try {
      const result = await loadSalesHistory(cardId);
      setState({cardId, sales: result, loading: false, error: null});
    } catch (error) {
      setState({cardId, sales: null, loading: false, error: error.message});
    }
  };

  return <>
    <button class="btn sm" disabled={!cardId} onClick={show} title={L("Graphique des ventes conclues de cette carte", "Chart of this card's completed sales")}>
      <Icon name="prices" size={14} /> {L("Historique des prix", "Price history")}
    </button>
    {open && <Modal title={L(`Historique des prix · ${auction?.card?.wikipedia_title || ""}`, `Price history · ${auction?.card?.wikipedia_title || ""}`)} wide onClose={() => setOpen(false)}>
      {state.loading && <Progress label={L("Lecture des ventes conclues", "Loading completed sales")} done={0} />}
      {state.error && <Notice type="error">{state.error}</Notice>}
      {!state.loading && !state.error && state.cardId === cardId && !sales.length && <Notice>{L("Aucune vente conclue pour cette rareté et cette version shiny.", "No completed sales for this rarity and shiny version.")}</Notice>}
      {!state.loading && sales.length > 0 && <Chart sales={sales.sort((a, b) => a.date - b.date)} />}
    </Modal>}
  </>;
}
