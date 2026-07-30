// Module "Sankey Funnel & ROAS" : le simulateur d'acquisition.
// Le principe : le Budget Allocator dit combien d'argent on met sur chaque canal (SEO, Ads, Influence, PR).
// Ici, on prend ce budget et on simule ce qu'il devient une fois transformé en clics, puis en leads
// (des prospects intéressés), puis en clients payants, puis en revenu. Le ROAS (retour sur les dépenses
// publicitaires, "Return On Ad Spend" en anglais) c'est juste le rapport revenu / budget dépensé : un ROAS
// de 3 veut dire que chaque euro dépensé en rapporte 3.
// C'est la preuve concrète que les modules communiquent entre eux : ce module ne fait QUE lire le budget
// (jamais le modifier), et le Budget Allocator n'a pas besoin de savoir que le Sankey Funnel existe.
import { useMemo } from 'react';
import { sankey, sankeyLeft, sankeyLinkHorizontal } from 'd3-sankey';
import { CHANNELS, CHANNEL_COLORS, CHANNEL_LABELS, type Channel, type ChannelFunnelConfig } from '../../store/types';
import { useLaunchStore } from '../../store/useLaunchStore';
import { CsvImportButton } from '../../components/CsvImportButton';

// Une config "vide" utilisée quand un canal n'a pas encore d'hypothèses enregistrées dans le store
// (ça évite de planter si jamais un canal manque, par exemple juste après un import CSV partiel).
function emptyConfig(channel: Channel): ChannelFunnelConfig {
  return { channel, costPerClick: 0, clickToLeadRate: 0, leadToCustomerRate: 0, avgRevenuePerCustomer: 0 };
}

// Petits formatteurs pour afficher les nombres proprement (en euros ou avec une décimale).
const formatMoney = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const formatNumber = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// --- Diagramme de Sankey (le graphique en "flux" du funnel) --------------------------------------
// Un diagramme de Sankey est fait de "nœuds" (des rectangles, ex: un canal, une étape) reliés par des
// "liens" (des flux, dont l'épaisseur représente une quantité). Ici, chaque canal a sa propre "voie" :
// Canal -> Clics -> Leads -> Clients, avec 4 voies parallèles (une par canal) qui gardent la couleur
// du canal tout du long, pour qu'on puisse suivre visuellement où l'argent de chaque canal finit.
const SANKEY_WIDTH = 860;
const SANKEY_HEIGHT = 380;

// Les 4 colonnes affichées dans le diagramme, dans l'ordre. "stage" sert à retrouver la position
// x de chaque colonne une fois le diagramme calculé (voir plus bas).
type SankeyStage = 'channel' | 'clics' | 'leads' | 'clients';
const STAGE_HEADERS: { stage: SankeyStage; label: string }[] = [
  { stage: 'channel', label: 'Canal' },
  { stage: 'clics', label: 'Clics' },
  { stage: 'leads', label: 'Leads' },
  { stage: 'clients', label: 'Clients' },
];

// La forme d'un nœud/lien AVANT de les donner à d3-sankey (qui va ensuite calculer x0, x1, y0, y1...
// les positions à l'écran, en fonction des valeurs). "channel" est répété sur chaque nœud/lien pour
// qu'on sache quelle couleur lui appliquer, même après que d3-sankey ait transformé les données.
interface SankeyGraphNode {
  id: string;
  label: string;
  channel: Channel;
  stage: SankeyStage;
}
interface SankeyGraphLink {
  source: number;
  target: number;
  value: number;
  channel: Channel;
}

// Un en-tête de colonne au-dessus du diagramme (ex: "Clics"), avec sa position x et son ancrage de
// texte ("start"/"end"/"middle", le point du texte qui correspond à la position x qu'on lui donne).
interface SankeyHeader {
  stage: SankeyStage;
  label: string;
  x: number;
  anchor: 'start' | 'end' | 'middle';
}

// Construit les nœuds et les liens du diagramme à partir des chiffres déjà calculés du funnel
// (une ligne = un canal, avec ses clics/leads/clients). Une voie de canal s'arrête dès que le
// volume tombe à 0 (par exemple si aucun taux de conversion n'a été renseigné) : ça évite d'afficher
// un flux à largeur nulle, qui ne veut rien dire visuellement.
function buildSankeyGraph(rows: { channel: Channel; clicks: number; leads: number; customers: number }[]) {
  const nodes: SankeyGraphNode[] = [];
  const links: SankeyGraphLink[] = [];
  const nodeIndexById = new Map<string, number>();

  const getOrCreateNode = (id: string, label: string, channel: Channel, stage: SankeyStage): number => {
    const existingIndex = nodeIndexById.get(id);
    if (existingIndex !== undefined) return existingIndex;
    const index = nodes.length;
    nodeIndexById.set(id, index);
    nodes.push({ id, label, channel, stage });
    return index;
  };

  for (const row of rows) {
    if (row.clicks <= 0) continue;
    const channelNode = getOrCreateNode(`channel-${row.channel}`, CHANNEL_LABELS[row.channel], row.channel, 'channel');
    const clicsNode = getOrCreateNode(`clics-${row.channel}`, 'Clics', row.channel, 'clics');
    links.push({ source: channelNode, target: clicsNode, value: row.clicks, channel: row.channel });

    if (row.leads <= 0) continue;
    const leadsNode = getOrCreateNode(`leads-${row.channel}`, 'Leads', row.channel, 'leads');
    links.push({ source: clicsNode, target: leadsNode, value: row.leads, channel: row.channel });

    if (row.customers <= 0) continue;
    const clientsNode = getOrCreateNode(`clients-${row.channel}`, 'Clients', row.channel, 'clients');
    links.push({ source: leadsNode, target: clientsNode, value: row.customers, channel: row.channel });
  }

  return { nodes, links };
}

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
    const current = funnelConfigs.find((c) => c.channel === channel) ?? emptyConfig(channel);
    const updated: ChannelFunnelConfig = { ...current, [field]: value };
    const exists = funnelConfigs.some((c) => c.channel === channel);
    const nextConfigs = exists
      ? funnelConfigs.map((c) => (c.channel === channel ? updated : c))
      : [...funnelConfigs, updated];
    setFunnelConfigs(nextConfigs);
  };

  // Pour chaque canal, on calcule le funnel complet à partir du budget (Budget Allocator) et des
  // hypothèses (ce module) : clics -> leads -> clients -> revenu -> ROAS.
  const rows = CHANNELS.map((channel) => {
    const amount = channelBudgets.find((b) => b.channel === channel)?.amount ?? 0;
    const config = funnelConfigs.find((c) => c.channel === channel) ?? emptyConfig(channel);

    const clicks = config.costPerClick > 0 ? amount / config.costPerClick : 0;
    const leads = clicks * config.clickToLeadRate;
    const customers = leads * config.leadToCustomerRate;
    const revenue = customers * config.avgRevenuePerCustomer;
    const roas = amount > 0 ? revenue / amount : 0;

    return { channel, amount, config, clicks, leads, customers, revenue, roas };
  });

  // Calcule la position de chaque nœud/lien du diagramme de Sankey à partir de "rows". useMemo évite
  // de refaire ce calcul à chaque frappe dans un champ qui ne concerne pas le diagramme : il ne se
  // relance que quand "rows" change vraiment (donc dès qu'un budget ou une hypothèse change, mais
  // pas à chaque re-rendu du composant).
  const sankeyDiagram = useMemo(() => {
    const graph = buildSankeyGraph(rows);
    if (graph.nodes.length === 0) return null;

    // sankeyLeft garde chaque nœud dans sa colonne "naturelle" (Canal / Clics / Leads / Clients)
    // même si une voie de canal s'arrête en cours de route ; sans ça, d3-sankey pousserait un nœud
    // sans flux sortant tout à droite du diagramme, ce qui casserait l'alignement des colonnes.
    const layoutGenerator = sankey<SankeyGraphNode, SankeyGraphLink>()
      .nodeId((node) => node.index ?? 0)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(18)
      .extent([
        [1, 28],
        [SANKEY_WIDTH - 1, SANKEY_HEIGHT - 1],
      ]);

    const layout = layoutGenerator({
      // On passe des copies : d3-sankey modifie les objets qu'on lui donne (il leur ajoute x0, x1...),
      // on ne veut surtout pas modifier directement les données de "rows".
      nodes: graph.nodes.map((node) => ({ ...node })),
      links: graph.links.map((link) => ({ ...link })),
    });

    // Position x de chaque colonne, retrouvée à partir d'un nœud existant de cette étape (toutes les
    // "Clics" par exemple, sont dans la même colonne, donc au même x0/x1). Pour la 1ère colonne
    // (Canal) et la dernière (Clients), on ancre le texte à gauche/à droite du nœud plutôt qu'au
    // centre : sinon, comme ces colonnes sont collées aux bords du diagramme, un texte centré
    // dépasserait du cadre SVG et serait coupé (SVG ne "wrap" pas le texte qui sort de sa zone).
    const headers: SankeyHeader[] = [];
    for (const { stage, label } of STAGE_HEADERS) {
      const node = layout.nodes.find((n) => n.stage === stage);
      if (!node) continue;
      const x0 = node.x0 ?? 0;
      const x1 = node.x1 ?? 0;
      if (stage === 'channel') headers.push({ stage, label, x: x0, anchor: 'start' });
      else if (stage === 'clients') headers.push({ stage, label, x: x1, anchor: 'end' });
      else headers.push({ stage, label, x: (x0 + x1) / 2, anchor: 'middle' });
    }

    const linkPath = sankeyLinkHorizontal<SankeyGraphNode, SankeyGraphLink>();

    return { nodes: layout.nodes, links: layout.links, headers, linkPath };
  }, [rows]);

  // La ligne "total" tout en bas du tableau récap : on additionne simplement toutes les colonnes.
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
  const totalRoas = totals.amount > 0 ? totals.revenue / totals.amount : 0;

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
          Il se recalcule tout seul (via useMemo sur "rows") dès qu'un budget ou une hypothèse change. */}
      <div className="overflow-x-auto rounded-lg border border-neutral-800 p-4">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">Diagramme du funnel par canal</h3>
        {sankeyDiagram ? (
          <svg
            viewBox={`0 0 ${SANKEY_WIDTH} ${SANKEY_HEIGHT}`}
            className="h-auto w-full min-w-[640px]"
            role="img"
            aria-label="Diagramme de Sankey du funnel d'acquisition par canal"
          >
            {/* En-têtes de colonnes : Canal / Clics / Leads / Clients, positionnés au-dessus de
                chaque colonne calculée par d3-sankey. */}
            {sankeyDiagram.headers.map((header) => (
              <text
                key={header.stage}
                x={header.x}
                y={16}
                textAnchor={header.anchor}
                className="fill-neutral-500 text-[11px] uppercase tracking-wide"
              >
                {header.label}
              </text>
            ))}

            {/* Les flux : un chemin par lien, épais proportionnellement à sa valeur (clics/leads/
                clients), coloré selon le canal d'origine pour rester cohérent avec le donut chart. */}
            <g fill="none">
              {sankeyDiagram.links.map((link, i) => (
                <path
                  key={i}
                  d={sankeyDiagram.linkPath(link) ?? undefined}
                  stroke={CHANNEL_COLORS[link.channel]}
                  strokeOpacity={0.35}
                  strokeWidth={Math.max(1, link.width ?? 0)}
                >
                  <title>
                    {`${CHANNEL_LABELS[link.channel]} : ${formatNumber(link.value)}`}
                  </title>
                </path>
              ))}
            </g>

            {/* Les nœuds : un rectangle par étape de chaque voie de canal, avec sa valeur affichée
                à côté (le nom du canal pour la première colonne, juste le chiffre pour les suivantes,
                puisque l'en-tête de colonne dit déjà "Clics"/"Leads"/"Clients"). */}
            <g>
              {sankeyDiagram.nodes.map((node) => {
                const x0 = node.x0 ?? 0;
                const x1 = node.x1 ?? 0;
                const y0 = node.y0 ?? 0;
                const y1 = node.y1 ?? 0;
                const isRightHalf = x0 > SANKEY_WIDTH / 2;
                const textContent = node.stage === 'channel' ? node.label : formatNumber(node.value ?? 0);
                return (
                  <g key={node.id}>
                    <rect
                      x={x0}
                      y={y0}
                      width={Math.max(1, x1 - x0)}
                      height={Math.max(1, y1 - y0)}
                      rx={2}
                      fill={CHANNEL_COLORS[node.channel]}
                    >
                      <title>{`${CHANNEL_LABELS[node.channel]} · ${node.label} : ${formatNumber(node.value ?? 0)}`}</title>
                    </rect>
                    <text
                      x={isRightHalf ? x0 - 6 : x1 + 6}
                      y={(y0 + y1) / 2}
                      dominantBaseline="middle"
                      textAnchor={isRightHalf ? 'end' : 'start'}
                      className="fill-neutral-300 text-[11px]"
                    >
                      {textContent}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          // Sans clics sur aucun canal (coût/clic à 0 partout, ou budget à 0), il n'y a rien à
          // faire circuler dans le diagramme : on l'explique plutôt que d'afficher un cadre vide.
          <div className="flex h-[160px] items-center justify-center text-center text-sm text-neutral-500">
            Renseignez un budget et un coût/clic pour voir le diagramme du funnel
          </div>
        )}
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
                <td className="py-2 pr-3">{formatNumber(clicks)}</td>
                <td className="py-2 pr-3">{formatNumber(leads)}</td>
                <td className="py-2 pr-3">{formatNumber(customers)}</td>
                <td className="py-2 pr-3">{formatMoney(revenue)}</td>
                <td className="py-2 pr-3 font-medium text-emerald-400">{formatNumber(roas)}x</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-700 font-semibold text-white">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 pr-3">{formatMoney(totals.amount)}</td>
              <td className="py-2 pr-3">{formatNumber(totals.clicks)}</td>
              <td className="py-2 pr-3">{formatNumber(totals.leads)}</td>
              <td className="py-2 pr-3">{formatNumber(totals.customers)}</td>
              <td className="py-2 pr-3">{formatMoney(totals.revenue)}</td>
              <td className="py-2 pr-3 text-emerald-400">{formatNumber(totalRoas)}x</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
