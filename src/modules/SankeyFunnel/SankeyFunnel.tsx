// Module "Sankey Funnel & ROAS" : le simulateur d'acquisition.
// Le principe : le Budget Allocator dit combien d'argent on met sur chaque canal (SEO, Ads, Influence, PR).
// Ici, on prend ce budget et on simule ce qu'il devient une fois transformé en clics, puis en leads
// (des prospects intéressés), puis en clients payants, puis en revenu. Le ROAS (retour sur les dépenses
// publicitaires, "Return On Ad Spend" en anglais) c'est juste le rapport revenu / budget dépensé : un ROAS
// de 3 veut dire que chaque euro dépensé en rapporte 3.
// C'est la preuve concrète que les modules communiquent entre eux : ce module ne fait QUE lire le budget
// (jamais le modifier), et le Budget Allocator n'a pas besoin de savoir que le Sankey Funnel existe.
import { CHANNELS, CHANNEL_LABELS, type Channel, type ChannelFunnelConfig } from '../../store/types';
import { useLaunchStore } from '../../store/useLaunchStore';
import { CsvImportButton } from '../../components/CsvImportButton';
import { formatCount, formatMoney, formatNumber } from '../../store/formatters';
import { computeFunnelRows, computeFunnelTotals, emptyFunnelConfig } from './funnelMath';
import { SankeyDiagram } from './SankeyDiagram';

export default function SankeyFunnel() {
  // Lecture seule : le budget par canal vient du Budget Allocator, on n'y touche jamais ici.
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  // Lecture + écriture : les hypothèses de conversion propres à ce module.
  const funnelConfigs = useLaunchStore((state) => state.funnelConfigs);
  const setFunnelConfigs = useLaunchStore((state) => state.setFunnelConfigs);

  // Met à jour un seul champ (ex: costPerClick) pour un canal donné, puis renvoie le tableau complet
  // au store via setFunnelConfigs (comme demandé : on reconstruit toute la liste avec l'entrée modifiée).
  const updateField = (
    channel: Channel,
    field: keyof Omit<ChannelFunnelConfig, 'channel'>,
    value: number,
  ) => {
    const current = funnelConfigs.find((c) => c.channel === channel) ?? emptyFunnelConfig(channel);
    const updated: ChannelFunnelConfig = { ...current, [field]: value };
    const exists = funnelConfigs.some((c) => c.channel === channel);
    const nextConfigs = exists
      ? funnelConfigs.map((c) => (c.channel === channel ? updated : c))
      : [...funnelConfigs, updated];
    setFunnelConfigs(nextConfigs);
  };

  // Le calcul du funnel (clics -> leads -> clients -> revenu -> ROAS) vit dans funnelMath.ts, pour
  // pouvoir être réutilisé tel quel par le PDF Export sans dupliquer la formule.
  const rows = computeFunnelRows(channelBudgets, funnelConfigs);
  const totals = computeFunnelTotals(rows);

  // mapRow du CSV : on vérifie que le canal fait bien partie des 4 connus avant d'accepter la ligne.
  // Si mapRow lève une erreur, parseCsvFile ignore juste cette ligne (voir csvImport.ts).
  const mapCsvRow = (row: Record<string, string>): ChannelFunnelConfig => {
    const rawChannel = row.channel?.trim();
    if (!rawChannel || !(CHANNELS as readonly string[]).includes(rawChannel)) {
      throw new Error(`Canal inconnu dans le CSV : "${rawChannel}"`);
    }
    return {
      channel: rawChannel as Channel,
      costPerClick: Number(row.costPerClick),
      clickToLeadRate: Number(row.clickToLeadRate),
      leadToCustomerRate: Number(row.leadToCustomerRate),
      avgRevenuePerCustomer: Number(row.avgRevenuePerCustomer),
    };
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Sankey Funnel & ROAS</h2>
        <p className="text-sm text-neutral-500">
          Simulateur d'acquisition : on part du budget par canal pour estimer clics, leads, clients et revenu.
        </p>
      </div>

      {/* Encart de preuve : ces montants ne sont PAS saisis ici, ils viennent tels quels du Budget Allocator. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-semibold text-neutral-200">Budgets venant du Budget Allocator</h3>
        <p className="mb-3 text-xs text-neutral-500">
          Ces chiffres sont en lecture seule ici : pour les changer, il faut aller dans le module Budget
          Allocator.
        </p>
        <ul className="flex flex-wrap gap-3">
          {channelBudgets.map((b) => (
            <li
              key={b.channel}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300"
            >
              <span className="text-neutral-500">{CHANNEL_LABELS[b.channel]} : </span>
              <span className="font-medium text-emerald-400">{formatMoney(b.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Import CSV des hypothèses de conversion, branché directement sur setFunnelConfigs. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Import des hypothèses</h3>
        <CsvImportButton<ChannelFunnelConfig>
          label="Importer les hypothèses (CSV)"
          templateFilename="sankey-funnel-template.csv"
          templateHeaders={['channel', 'costPerClick', 'clickToLeadRate', 'leadToCustomerRate', 'avgRevenuePerCustomer']}
          templateSampleRows={[
            ['ads', '1.5', '0.10', '0.20', '450'],
            ['seo', '0.30', '0.06', '0.18', '450'],
            ['influence', '0.80', '0.12', '0.10', '450'],
            ['pr', '0.50', '0.04', '0.25', '450'],
          ]}
          mapRow={mapCsvRow}
          onImport={(importedRows) => setFunnelConfigs(importedRows)}
        />
      </div>

      {/* Tableau éditable : chaque champ est relié au store, chaque frappe met à jour funnelConfigs. */}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Hypothèses par canal</h3>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-neutral-500">
              <th className="pb-2 pr-3">Canal</th>
              <th className="pb-2 pr-3">Coût / clic</th>
              <th className="pb-2 pr-3">Taux clic → lead</th>
              <th className="pb-2 pr-3">Taux lead → client</th>
              <th className="pb-2 pr-3">Revenu / client</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ channel, config }) => (
              <tr key={channel} className="border-t border-neutral-800">
                <td className="py-2 pr-3 font-medium text-neutral-300">{CHANNEL_LABELS[channel]}</td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={config.costPerClick}
                    onChange={(e) => updateField(channel, 'costPerClick', Number(e.target.value))}
                    className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-emerald-500 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.clickToLeadRate}
                    onChange={(e) => updateField(channel, 'clickToLeadRate', Number(e.target.value))}
                    className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-emerald-500 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.leadToCustomerRate}
                    onChange={(e) => updateField(channel, 'leadToCustomerRate', Number(e.target.value))}
                    className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-emerald-500 focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={config.avgRevenuePerCustomer}
                    onChange={(e) => updateField(channel, 'avgRevenuePerCustomer', Number(e.target.value))}
                    className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100 focus:border-emerald-500 focus:outline-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Le diagramme de Sankey : la vue "flux" du funnel. Chaque voie de couleur suit un canal du
          Budget Allocator, de son budget jusqu'aux clients, en passant par les clics et les leads.
          Il se recalcule tout seul dès qu'un budget ou une hypothèse change. */}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Diagramme du funnel par canal</h3>
        <SankeyDiagram rows={rows} />
      </div>

      {/* Tableau récapitulatif : le résultat du calcul du funnel, canal par canal + une ligne total,
          en complément du diagramme ci-dessus (utile pour lire les chiffres exacts d'un coup d'œil). */}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Résultat du funnel par canal</h3>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs text-neutral-500">
              <th className="pb-2 pr-3">Canal</th>
              <th className="pb-2 pr-3">Budget</th>
              <th className="pb-2 pr-3">Clics</th>
              <th className="pb-2 pr-3">Leads</th>
              <th className="pb-2 pr-3">Clients</th>
              <th className="pb-2 pr-3">Revenu</th>
              <th className="pb-2 pr-3">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ channel, amount, clicks, leads, customers, revenue, roas }) => (
              <tr key={channel} className="border-t border-neutral-800 text-neutral-300">
                <td className="py-2 pr-3 font-medium">{CHANNEL_LABELS[channel]}</td>
                <td className="py-2 pr-3">{formatMoney(amount)}</td>
                <td className="py-2 pr-3">{formatCount(clicks)}</td>
                <td className="py-2 pr-3">{formatCount(leads)}</td>
                <td className="py-2 pr-3">{formatCount(customers)}</td>
                <td className="py-2 pr-3">{formatMoney(revenue)}</td>
                <td className="py-2 pr-3 font-medium text-emerald-400">{formatNumber(roas)}x</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-700 font-semibold text-white">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3">{formatMoney(totals.amount)}</td>
              <td className="py-2 pr-3">{formatCount(totals.clicks)}</td>
              <td className="py-2 pr-3">{formatCount(totals.leads)}</td>
              <td className="py-2 pr-3">{formatCount(totals.customers)}</td>
              <td className="py-2 pr-3">{formatMoney(totals.revenue)}</td>
              <td className="py-2 pr-3 text-emerald-400">{formatNumber(totals.roas)}x</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
