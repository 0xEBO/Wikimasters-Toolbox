// Page de repérage des mises sous le prix moyen du marché.
import {useEffect, useMemo, useState} from "preact/hooks";
import {useStore} from "../../lib/store";
import {sniperState, scanSniper} from "../../features/sniper";
import {priceOf, priceVersion} from "../../state/prices";
import {CardRow, duration, fmt, Notice, Progress} from "../components";
import {isLeading, msLeft, nextBid, placeBid} from "../../features/market";
import {readSession} from "../../lib/session";
import {confirmAction, errorMessage, toast} from "../feedback";
import {L} from "../../../shared/i18n";

export function SniperPage() {
  const state = useStore(sniperState);
  useStore(priceVersion);
  const [discount, setDiscount] = useState(25);
  const [rarities, setRarities] = useState([]);
  const [order, setOrder] = useState("discount");
  const [bidding, setBidding] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (!state.auctions.length && !state.loading && !state.error) scanSniper(); }, []);
  const deals = useMemo(() => state.auctions.map((auction) => {
    const average = priceOf(auction.card_id, auction.snapshot_rarity, {shiny: auction.is_shiny});
    const bid = auction.current_bid ?? auction.base_amount;
    return {auction, average, bid, saving: average == null ? null : 1 - bid / average, card: state.cards.get(auction.card_id)};
  }).filter((x) => x.average != null && x.saving >= discount / 100 && (!rarities.length || rarities.includes(x.auction.is_shiny ? "L" : x.auction.snapshot_rarity)))
    .sort((a, b) => order === "bid-low" ? a.bid - b.bid : order === "bid-high" ? b.bid - a.bid : order === "ending" ? new Date(a.auction.end_at) - new Date(b.auction.end_at) : order === "recent" ? new Date(b.auction.created_at) - new Date(a.auction.created_at) : b.saving - a.saving),
  [state.auctions, state.cards, discount, rarities, order, priceVersion.get()]);
  const toggleRarity = (rarity) => setRarities((selected) => selected.includes(rarity) ? selected.filter((r) => r !== rarity) : [...selected, rarity]);
  const bid = async (auction, card, amount) => {
    const avg = priceOf(auction.card_id, auction.snapshot_rarity, {shiny: auction.is_shiny});
    const ok = await confirmAction({
      title: L(`Enchérir ${fmt(amount)} ₩ ?`, `Bid ${fmt(amount)} ₩?`),
      body: L(`${card?.wikipedia_title || L("Cette carte", "This card")} (${auction.snapshot_rarity}) · mise actuelle ${fmt(auction.current_bid ?? auction.base_amount)} ₩${avg ? ` · prix du marché ${fmt(avg)} ₩` : ""}. Les WikiBidous sont réservés jusqu'à la fin de l'enchère.`, `${card?.wikipedia_title || "This card"} (${auction.snapshot_rarity}) · current bid ${fmt(auction.current_bid ?? auction.base_amount)} ₩${avg ? ` · market price ${fmt(avg)} ₩` : ""}. WikiBidous are held until the auction ends.`),
      confirm: L(`Enchérir ${fmt(amount)} ₩`, `Bid ${fmt(amount)} ₩`),
    });
    if (!ok) return;
    setBidding(auction.id);
    try {
      let placedAmount = amount;
      let result = await placeBid(auction, amount);
      if (result.min) {
        const retry = await confirmAction({
          title: L("Mise trop basse", "Bid too low"),
          body: L(`Le site demande au moins ${fmt(result.min)} ₩. Enchérir ce montant ?`, `The site requires at least ${fmt(result.min)} ₩. Bid this amount?`),
          confirm: L(`Enchérir ${fmt(result.min)} ₩`, `Bid ${fmt(result.min)} ₩`),
        });
        if (!retry) return;
        placedAmount = result.min;
        result = await placeBid(auction, placedAmount);
      }
      if (result.ok) {
        const userId = readSession()?.userId;
        sniperState.set((s) => ({auctions: s.auctions.map((a) => a.id === auction.id ? {...a, current_bid: placedAmount, current_bidder_id: userId} : a)}));
        toast(L("Enchère placée.", "Bid placed."), {type: "ok"});
      } else if (result.error) toast(errorMessage(result.error), {type: "error"});
    } catch (e) {
      toast(errorMessage(e), {type: "error", duration: 10000});
    } finally {
      setBidding(null);
    }
  };
  return <div class="stonks">
    <header class="stonks-head">
      <div style={{flex: 1}}><h1>{L("Sniper", "Market sniper")}</h1><p class="stonks-lead">{L("Repérez les enchères dont la mise est nettement inférieure au prix moyen fiable de la carte dans sa rareté. La comparaison utilise la médiane des ventes récentes.", "Find auctions whose current bid is well below the card's reliable market price for its rarity. The comparison uses the median of recent sales.")}</p></div>
      <button class="btn sm ghost" disabled={state.loading} onClick={() => scanSniper({reset: true})}>{L("Actualiser", "Refresh")}</button>
    </header>
    <div class="sniper-filters">
      <div class="sniper-rarities">
        <span class="small muted">{L("Raretés", "Rarities")}</span>
        <div class="chips" role="group" aria-label={L("Filtrer par rareté", "Filter by rarity")}>
          {["L", "UR", "SR", "R", "PC", "C"].map((rarity) => <button key={rarity} class={`chip${rarities.includes(rarity) ? " on" : ""}`} aria-pressed={rarities.includes(rarity)} onClick={() => toggleRarity(rarity)}><span class={`rarity ${rarity}`}>{rarity}</span></button>)}
        </div>
      </div>
      <label class="small sniper-order">{L("Trier par", "Sort by")} <select value={order} onChange={(e) => setOrder(e.currentTarget.value)}>
        <option value="discount">{L("Remise la plus forte", "Highest discount")}</option>
        <option value="recent">{L("Récemment listées", "Recently listed")}</option>
        <option value="bid-low">{L("Mise la plus basse", "Lowest bid")}</option>
        <option value="bid-high">{L("Mise la plus haute", "Highest bid")}</option>
        <option value="ending">{L("Fin imminente", "Ending soon")}</option>
      </select></label>
      <label class="sniper-discount"><span class="small">{L("Remise minimum", "Minimum discount")} <strong class="num">{discount} %</strong></span><input type="range" min="0" max="100" step="5" value={discount} onInput={(e) => setDiscount(Number(e.currentTarget.value))} aria-label={L("Remise minimum", "Minimum discount")} /></label>
    </div>
    {state.auctions.length > 0 && <p class="sniper-count small muted">{L(`${fmt(deals.length)} résultat${deals.length > 1 ? "s" : ""} · ${fmt(state.auctions.length)} enchères actives analysées`, `${fmt(deals.length)} result${deals.length === 1 ? "" : "s"} · ${fmt(state.auctions.length)} active auctions scanned`)}</p>}
    {state.loading && <Progress label={state.stage === "prices" ? L("Chargement des prix des enchères affichées", "Loading prices for these auctions") : L("Lecture des enchères suivantes", "Loading the next auctions")} done={state.progress?.done || 0} total={state.progress?.total} />}
    {state.error && <Notice type="error">{state.error}</Notice>}
    {!state.loading && !state.error && state.auctions.length === 0 && <Notice>{L("Aucune enchère active à analyser.", "No active auctions to scan.")}</Notice>}
    {!state.loading && state.auctions.length > 0 && !deals.length && <Notice>{L("Aucune enchère ne passe ce seuil avec un prix de marché fiable.", "No auction meets this threshold with a reliable market price.")}</Notice>}
    <div class="stack" style={{gap: "8px"}}>{deals.map(({auction, average, bid: current, saving, card}) => {
      const amount = nextBid(auction);
      const own = auction.seller_id === readSession()?.userId;
      const leading = isLeading(auction);
      const expired = msLeft(auction) <= 0;
      const disabled = bidding === auction.id || own || leading || expired;
      const title = own ? L("Vous vendez cette carte", "You are selling this card") : leading ? L("Vous êtes déjà en tête", "You are already leading") : expired ? L("Cette enchère est terminée", "This auction has ended") : undefined;
      const remaining = msLeft(auction);
      return <CardRow key={auction.id} card={card} rarity={auction.is_shiny ? "L" : auction.snapshot_rarity} badges={[{label: `${Math.round(saving * 100)} % ${L("sous le marché", "below market")}`, type: "ok"}, {label: `${fmt(current)} ₩`}, {label: `${L("réf.", "ref.")} ${fmt(average)} ₩`, type: "muted"}, {label: duration(remaining), type: remaining < 120000 ? "danger" : ""}]} action={<a class="btn sm ghost" href={`/marketplace/${auction.id}`}>{L("Voir l'enchère", "View auction")}</a>} actionBelow={<button class="btn sm primary" disabled={disabled} title={title} onClick={() => bid(auction, card, amount)}>{bidding === auction.id ? L("Mise…", "Bidding…") : `${L("Miser", "Bid")} · ${fmt(amount)} ₩`}</button>} />;
    })}</div>
    {state.hasMore && <div class="actions" style={{justifyContent: "center", marginTop: "16px"}}><button class="btn ghost" disabled={state.loading} onClick={() => scanSniper()}>{state.loading ? L("Chargement…", "Loading…") : L("Charger les 50 offres suivantes", "Load the next 50 listings")}</button></div>}
  </div>;
}
