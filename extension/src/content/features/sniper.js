// Repérage manuel des enchères dont la mise est nettement sous le prix médian fiable.
import {rest, restIn} from "../api/supabase";
import {createStore} from "../lib/store";
import {loadPrices} from "../state/prices";

const PAGE_SIZE = 50;
const FIELDS = "id,card_id,snapshot_rarity,current_bid,base_amount,end_at,created_at,is_shiny,seller_id,current_bidder_id";
const CARD_FIELDS = "id,wikipedia_title,category,rarity,image_url,wikipedia_url,hide_image";
export const sniperState = createStore({auctions: [], cards: new Map(), offset: 0, loading: false, stage: null, progress: null, error: null, hasMore: true, at: 0});

export async function scanSniper({reset = false} = {}) {
  const current = sniperState.get();
  if (current.loading || (!reset && !current.hasMore)) return;
  const offset = reset ? 0 : current.offset;
  if (reset) sniperState.set({auctions: [], cards: new Map(), offset: 0, hasMore: true, error: null, progress: null});
  sniperState.set({loading: true, stage: "auctions", error: null});
  try {
    const auctions = await rest(`auctions?select=${FIELDS}&status=eq.active&end_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`);
    const known = new Set(reset ? [] : current.auctions.map((a) => a.id));
    const fresh = auctions.filter((a) => !known.has(a.id));
    const cards = new Map(reset ? [] : current.cards);
    for (const card of await restIn(`cards?select=${CARD_FIELDS}`, "id", fresh.map((a) => a.card_id))) cards.set(card.id, {...card, image_url: card.hide_image ? null : card.image_url});
    const all = reset ? fresh : [...current.auctions, ...fresh];
    sniperState.set({auctions: all, cards, offset: offset + auctions.length, hasMore: auctions.length === PAGE_SIZE, stage: "prices", progress: {done: 0, total: new Set(fresh.map((a) => a.card_id)).size}});
    await loadPrices(fresh.map((a) => ({id: a.card_id, rarity: a.snapshot_rarity})), {
      onProgress: (done, total) => sniperState.set({progress: {done, total}}),
    });
    sniperState.set({at: Date.now()});
  } catch (e) {
    sniperState.set({error: e.message});
  } finally {
    sniperState.set({loading: false, stage: null, progress: null});
  }
}

const HASH = "#sniper";
export const sniperPage = createStore({open: false});
export const isSniperOpen = () => sniperPage.get().open && location.hash === HASH;
export function openSniper() {
  if (location.hash !== HASH) history.pushState(null, "", HASH);
  sniperPage.set({open: true});
  scanSniper();
}
export function closeSniper() {
  if (location.hash === HASH) history.replaceState(history.state, "", location.pathname + location.search);
  sniperPage.set({open: false});
}
export function startSniperRoute() {
  const sync = () => sniperPage.get().open !== (location.hash === HASH) && sniperPage.set({open: location.hash === HASH});
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);
  sync();
  if (isSniperOpen()) scanSniper();
}
