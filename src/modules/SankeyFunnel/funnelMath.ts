// Le calcul du funnel (budget -> clics -> leads -> clients -> revenu -> ROAS), séparé du composant
// SankeyFunnel.tsx pour pouvoir être réutilisé tel quel par le PDF Export (qui a besoin des mêmes
// chiffres pour remplir son tableau récapitulatif, sans dupliquer la formule à deux endroits).
import { CHANNELS, type Channel, type ChannelBudget, type ChannelFunnelConfig } from '../../store/types';

// Une config "vide" utilisée quand un canal n'a pas encore d'hypothèses enregistrées dans le store
// (ça évite de planter si jamais un canal manque, par exemple juste après un import CSV partiel).
export function emptyFunnelConfig(channel: Channel): ChannelFunnelConfig {
  return { channel, costPerClick: 0, clickToLeadRate: 0, leadToCustomerRate: 0, avgRevenuePerCustomer: 0 };
}

// Le résultat du calcul du funnel pour un canal : tout ce qu'il faut pour remplir une ligne de
// tableau ou un nœud du diagramme de Sankey.
export interface FunnelRow {
  channel: Channel;
  amount: number;
  config: ChannelFunnelConfig;
  clicks: number;
  leads: number;
  customers: number;
  revenue: number;
  roas: number;
}

// Pour chaque canal, calcule le funnel complet à partir du budget (Budget Allocator) et des
// hypothèses de conversion (Sankey Funnel) : clics -> leads -> clients -> revenu -> ROAS.
export function computeFunnelRows(
  channelBudgets: ChannelBudget[],
  funnelConfigs: ChannelFunnelConfig[],
): FunnelRow[] {
  return CHANNELS.map((channel) => {
    const amount = channelBudgets.find((b) => b.channel === channel)?.amount ?? 0;
    const config = funnelConfigs.find((c) => c.channel === channel) ?? emptyFunnelConfig(channel);

    const clicks = config.costPerClick > 0 ? amount / config.costPerClick : 0;
    const leads = clicks * config.clickToLeadRate;
    const customers = leads * config.leadToCustomerRate;
    const revenue = customers * config.avgRevenuePerCustomer;
    const roas = amount > 0 ? revenue / amount : 0;

    return { channel, amount, config, clicks, leads, customers, revenue, roas };
  });
}

// La ligne "total" additionnant toutes les colonnes numériques des lignes du funnel.
export function computeFunnelTotals(rows: FunnelRow[]) {
  const totals = rows.reduce(
    (acc, r) => ({
      amount: acc.amount + r.amount,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
      customers: acc.customers + r.customers,
      revenue: acc.revenue + r.revenue,
    }),
    { amount: 0, clicks: 0, leads: 0, customers: 0, revenue: 0 },
  );
  const roas = totals.amount > 0 ? totals.revenue / totals.amount : 0;
  return { ...totals, roas };
}
