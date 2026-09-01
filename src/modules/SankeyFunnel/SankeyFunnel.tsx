// Module "Sankey Funnel & ROAS" : le simulateur d'acquisition.
// Le principe : le Budget Allocator dit combien d'argent on met sur chaque canal (SEO, Ads, Influence, PR).
// Ici, on prend ce budget et on simule ce qu'il devient une fois transformé en clics, puis en leads
// (des prospects intéressés), puis en clients payants, puis en revenu. Le ROAS (retour sur les dépenses
// publicitaires, "Return On Ad Spend" en anglais) c'est juste le rapport revenu / budget dépensé : un ROAS
// de 3 veut dire que chaque euro dépensé en rapporte 3.
// C'est la preuve concrète que les modules communiquent entre eux : ce module ne fait QUE lire le budget
// (jamais le modifier), et le Budget Allocator n'a pas besoin de savoir que le Sankey Funnel existe.
import { useState } from 'react';
import { CHANNELS, CHANNEL_LABELS, type Channel, type ChannelFunnelConfig } from '../../store/types';
import { useLaunchStore } from '../../store/useLaunchStore';
import { CsvImportButton } from '../../components/CsvImportButton';
import {
  formatCount,
  formatEditableNumber,
  formatMoney,
  formatNumber,
  parseEditableNumber,
} from '../../store/formatters';
import {
  clampToRange,
  CONVERSION_RATE_MAX,
  CONVERSION_RATE_MIN,
  COST_PER_CLICK_MIN,
  parseCsvNumber,
  REVENUE_PER_CUSTOMER_MIN,
} from '../../store/numberBounds';
import { computeFunnelRows, computeFunnelTotals, emptyFunnelConfig } from './funnelMath';
import { FunnelCharts } from './SankeyDiagram';

export default function SankeyFunnel() {
  // Lecture seule : le budget par canal vient du Budget Allocator, on n'y touche jamais ici.
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  // Lecture + écriture : les hypothèses de conversion propres à ce module.
  const funnelConfigs = useLaunchStore((state) => state.funnelConfigs);
  const setFunnelConfigs = useLaunchStore((state) => state.setFunnelConfigs);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // Les 4 champs hypothèses sont des <input type="text"> (pas type="number", voir le commentaire de
  // formatEditableNumber dans store/formatters.ts) : ça nous laisse choisir nous-mêmes l'affichage
  // (virgule française), plutôt que de dépendre de l'habillage du navigateur qui disparaît après le
  // premier blur. Tant qu'on est en train de taper dans un champ, on affiche exactement ce texte-là
  // (même incomplet, ex: "0,"), identifié par "canal:champ" ; dès qu'on quitte le champ, l'entrée est
  // retirée et l'affichage repart de la valeur (éventuellement corrigée) du store.
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const fieldKey = (channel: Channel, field: string) => `${channel}:${field}`;

  // Le texte à afficher dans un champ hypothèse : ce qui est en train d'être tapé s'il y a une saisie
  // en cours sur ce champ précis, sinon la valeur du store, formatée en français.
  const displayValue = (
    channel: Channel,
    field: keyof Omit<ChannelFunnelConfig, 'channel'>,
    storeValue: number,
  ) => editingText[fieldKey(channel, field)] ?? formatEditableNumber(storeValue);

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

  // À chaque frappe : on garde le texte tapé tel quel pour l'affichage (voir editingText plus haut),
  // et si ça correspond déjà à un nombre valide (virgule ou point), on le pousse dans le store tout de
  // suite, pour que le diagramme et le tableau de résultats se recalculent en direct comme avant.
  // Un texte encore incomplet (ex: "0,") donne NaN : on ne touche pas au store tant que ce n'est pas
  // exploitable, on laisse juste la personne finir de taper.
  const handleFieldChange = (
    channel: Channel,
    field: keyof Omit<ChannelFunnelConfig, 'channel'>,
    text: string,
  ) => {
    setEditingText((prev) => ({ ...prev, [fieldKey(channel, field)]: text }));
    const parsed = parseEditableNumber(text);
    if (!Number.isNaN(parsed)) {
      updateField(channel, field, parsed);
    }
  };

  // À la sortie du champ (onBlur, quand on quitte le champ), on ramène une valeur hors limites à la
  // limite la plus proche, sans message d'erreur (voir clampToRange dans store/numberBounds.ts) : le
  // store n'est réécrit QUE si la valeur clampée diffère vraiment de la valeur actuelle, pour ne pas
  // réécrire inutilement une valeur déjà correcte. On efface ensuite le texte "en cours de saisie" :
  // l'affichage repart de la valeur (corrigée ou non) du store, toujours reformatée en français.
  const handleFieldBlur = (
    channel: Channel,
    field: keyof Omit<ChannelFunnelConfig, 'channel'>,
    min: number,
    max: number,
  ) => {
    const current = funnelConfigs.find((c) => c.channel === channel) ?? emptyFunnelConfig(channel);
    const clamped = clampToRange(current[field], min, max);
    if (clamped !== current[field]) {
      updateField(channel, field, clamped);
    }
    setEditingText((prev) => {
      const next = { ...prev };
      delete next[fieldKey(channel, field)];
      return next;
    });
  };

  // Le calcul du funnel (clics -> leads -> clients -> revenu -> ROAS) vit dans funnelMath.ts, pour
  // pouvoir être réutilisé tel quel par le PDF Export sans dupliquer la formule.
  const rows = computeFunnelRows(channelBudgets, funnelConfigs);
  const totals = computeFunnelTotals(rows);

  // mapRow du CSV : on vérifie que le canal fait bien partie des 4 connus, puis que les 4 hypothèses
  // respectent les mêmes bornes que la saisie manuelle (voir les <input> du tableau plus bas). En
  // mode strict (voir CsvImportButton ci-dessous), la moindre ligne invalide annule tout l'import.
  const mapCsvRow = (row: Record<string, string>): ChannelFunnelConfig => {
    const rawChannel = row.channel?.trim();
    if (!rawChannel || !(CHANNELS as readonly string[]).includes(rawChannel)) {
      throw new Error(`Canal inconnu dans le CSV : "${rawChannel}"`);
    }
    return {
      channel: rawChannel as Channel,
      costPerClick: parseCsvNumber(row.costPerClick, 'Le coût par clic', COST_PER_CLICK_MIN, Infinity),
      clickToLeadRate: parseCsvNumber(row.clickToLeadRate, 'Le taux clic → lead', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX),
      leadToCustomerRate: parseCsvNumber(row.leadToCustomerRate, 'Le taux lead → client', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX),
      avgRevenuePerCustomer: parseCsvNumber(row.avgRevenuePerCustomer, 'Le revenu par client', REVENUE_PER_CUSTOMER_MIN, Infinity),
    };
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Funnel d'acquisition & ROAS</h2>
        <p className="text-sm text-muted mt-2">
          Simulateur d'acquisition : on part du budget par canal pour estimer clics, leads, clients et revenu.
        </p>
      </div>

      {/* Encart de preuve : ces montants ne sont PAS saisis ici, ils viennent tels quels du Budget Allocator. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-semibold text-ink">Budgets venant du Budget Allocator</h3>
        <p className="mb-3 text-xs text-muted">
          Ces chiffres sont en lecture seule ici : pour les changer, il faut aller dans le module Budget
          Allocator.
        </p>
        <ul className="flex flex-wrap gap-3">
          {channelBudgets.map((b) => (
            <li
              key={b.channel}
              className="rounded border border-border bg-canvas px-3 py-1.5 text-sm text-ink"
            >
              <span className="text-muted">{CHANNEL_LABELS[b.channel]} : </span>
              {/* Montant = un nombre affiché : toujours en mono pour que les chiffres s'alignent bien. */}
              <span className="font-mono tabular-nums font-medium">{formatMoney(b.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Import CSV des hypothèses de conversion, branché directement sur setFunnelConfigs. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">Import des hypothèses</h3>
        <CsvImportButton<ChannelFunnelConfig>
          key={resetGeneration}
          label="Importer les hypothèses (CSV)"
          templateFilename="funnel-acquisition-template.csv"
          templateHeaders={['channel', 'costPerClick', 'clickToLeadRate', 'leadToCustomerRate', 'avgRevenuePerCustomer']}
          templateSampleRows={[
            ['ads', '1.5', '0.10', '0.20', '450'],
            ['seo', '0.30', '0.06', '0.18', '450'],
            ['influence', '0.80', '0.12', '0.10', '450'],
            ['pr', '0.50', '0.04', '0.25', '450'],
          ]}
          mapRow={mapCsvRow}
          onImport={(importedRows) => setFunnelConfigs(importedRows)}
          strict
        />
      </div>

      {/* Tableau éditable : chaque champ est relié au store, chaque frappe met à jour funnelConfigs. */}
      <div className="overflow-x-auto bg-surface border border-border rounded-lg p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">Hypothèses par canal</h3>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-2 pr-3">Canal</th>
              <th className="pb-2 pr-3">Coût / clic</th>
              <th className="pb-2 pr-3">Taux clic → lead</th>
              <th className="pb-2 pr-3">Taux lead → client</th>
              <th className="pb-2 pr-3">Revenu / client</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ channel, config }) => (
              <tr key={channel} className="border-t border-border">
                <td className="py-2 pr-3 font-medium text-ink">{CHANNEL_LABELS[channel]}</td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayValue(channel, 'costPerClick', config.costPerClick)}
                    onChange={(e) => handleFieldChange(channel, 'costPerClick', e.target.value)}
                    onBlur={() => handleFieldBlur(channel, 'costPerClick', COST_PER_CLICK_MIN, Infinity)}
                    className="w-24 rounded border border-border bg-canvas px-2 py-1 font-mono tabular-nums text-ink focus:border-accent"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayValue(channel, 'clickToLeadRate', config.clickToLeadRate)}
                    onChange={(e) => handleFieldChange(channel, 'clickToLeadRate', e.target.value)}
                    onBlur={() => handleFieldBlur(channel, 'clickToLeadRate', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX)}
                    className="w-24 rounded border border-border bg-canvas px-2 py-1 font-mono tabular-nums text-ink focus:border-accent"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayValue(channel, 'leadToCustomerRate', config.leadToCustomerRate)}
                    onChange={(e) => handleFieldChange(channel, 'leadToCustomerRate', e.target.value)}
                    onBlur={() => handleFieldBlur(channel, 'leadToCustomerRate', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX)}
                    className="w-24 rounded border border-border bg-canvas px-2 py-1 font-mono tabular-nums text-ink focus:border-accent"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayValue(channel, 'avgRevenuePerCustomer', config.avgRevenuePerCustomer)}
                    onChange={(e) => handleFieldChange(channel, 'avgRevenuePerCustomer', e.target.value)}
                    onBlur={() => handleFieldBlur(channel, 'avgRevenuePerCustomer', REVENUE_PER_CUSTOMER_MIN, Infinity)}
                    className="w-24 rounded border border-border bg-canvas px-2 py-1 font-mono tabular-nums text-ink focus:border-accent"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Rappel discret des plages acceptées : utile puisque la correction se fait sans message
            d'erreur, juste en ramenant la valeur à la limite la plus proche à la sortie du champ. */}
        <p className="mt-3 text-xs text-muted">
          Coût par clic : toujours au-dessus de 0. Taux de conversion : entre 0 et 1. Revenu par
          client : jamais négatif. Une valeur hors limites est ramenée automatiquement à la limite
          la plus proche.
        </p>
      </div>

      {/* Un entonnoir par canal (clics -> leads -> clients), chacun dans la couleur de son canal,
          pour comparer les canaux entre eux d'un coup d'œil : c'est la vraie valeur de ce module.
          Se recalcule tout seul dès qu'un budget ou une hypothèse change. C'est LE bloc héros du
          module (juste après le tableau des hypothèses, avant le tableau des résultats), donc on lui
          donne un peu plus de place (p-8) qu'aux autres cartes pour qu'il respire. */}
      <div className="overflow-x-auto bg-surface border border-border rounded-lg p-8">
        <h3 className="mb-3 text-sm font-semibold text-ink">Diagramme du funnel par canal</h3>
        <FunnelCharts rows={rows} />
      </div>

      {/* Tableau récapitulatif : le résultat du calcul du funnel, canal par canal + une ligne total,
          en complément du diagramme ci-dessus (utile pour lire les chiffres exacts d'un coup d'œil). */}
      <div className="overflow-x-auto bg-surface border border-border rounded-lg p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">Résultat du funnel par canal</h3>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
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
              <tr key={channel} className="border-t border-border text-ink">
                <td className="py-2 pr-3 font-medium">{CHANNEL_LABELS[channel]}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{formatMoney(amount)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(clicks)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(leads)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(customers)}</td>
                <td className="py-2 pr-3 font-mono tabular-nums">{formatMoney(revenue)}</td>
                {/* ROAS par canal : reste en couleur normale, l'ambre est réservé à LA valeur clé (le total). */}
                <td className="py-2 pr-3 font-mono tabular-nums font-medium">{formatNumber(roas)}x</td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold text-ink">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{formatMoney(totals.amount)}</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(totals.clicks)}</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(totals.leads)}</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{formatCount(totals.customers)}</td>
              <td className="py-2 pr-3 font-mono tabular-nums">{formatMoney(totals.revenue)}</td>
              {/* Le ROAS total, c'est LE chiffre clé de tout ce tableau : c'est le seul endroit du
                  module où on autorise l'ambre sur le ROAS. */}
              <td className="py-2 pr-3 font-mono tabular-nums text-accent">{formatNumber(totals.roas)}x</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
