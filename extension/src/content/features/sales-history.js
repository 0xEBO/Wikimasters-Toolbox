// Historique des ventes d'une carte, lu dans les enchères conclues accessibles via la session du joueur.
import {fetchAll} from "../api/supabase";

export function loadSalesHistory(cardId) {
  return fetchAll(
    `auctions?select=id,card_id,snapshot_rarity,final_price,settled_at,is_shiny&status=eq.settled_sold&card_id=eq.${encodeURIComponent(cardId)}&order=settled_at.asc,id.asc`,
    {key: "id"},
  );
}
