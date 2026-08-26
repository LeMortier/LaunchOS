// Le diagramme de Sankey (le graphique en "flux" du funnel), extrait de SankeyFunnel.tsx dans son
// propre composant pour pouvoir être réutilisé tel quel par le PDF Export (qui a besoin d'afficher
// exactement le même diagramme, hors écran, pour le capturer en image avec html2canvas).
// Un diagramme de Sankey est fait de "nœuds" (des rectangles, ex: un canal, une étape) reliés par des
// "liens" (des flux, dont l'épaisseur représente une quantité). Ici, chaque canal a sa propre "voie" :
// Canal -> Clics -> Leads -> Clients, avec 4 voies parallèles (une par canal) qui gardent la couleur
// du canal tout du long, pour qu'on puisse suivre visuellement où l'argent de chaque canal finit.
import { useMemo } from 'react';
import { sankey, sankeyLeft, sankeyLinkHorizontal } from 'd3-sankey';
import { CHANNEL_COLORS, CHANNEL_LABELS, type Channel } from '../../store/types';
import { formatCount } from '../../store/formatters';
import type { FunnelRow } from './funnelMath';

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

interface SankeyDiagramProps {
  rows: Pick<FunnelRow, 'channel' | 'clicks' | 'leads' | 'customers'>[];
}

// N'a pas de style d'encart (bordure, padding) : c'est au composant appelant de décider comment
// l'entourer, puisqu'il est utilisé à la fois dans la page du module et hors écran pour le PDF.
export function SankeyDiagram({ rows }: SankeyDiagramProps) {
  // Calcule la position de chaque nœud/lien du diagramme. useMemo évite de refaire ce calcul à
  // chaque rendu si "rows" n'a pas vraiment changé.
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

  if (!sankeyDiagram) {
    // Sans clics sur aucun canal (coût/clic à 0 partout, ou budget à 0), il n'y a rien à faire
    // circuler dans le diagramme : on l'explique plutôt que d'afficher un cadre vide.
    return (
      <div className="flex h-[160px] items-center justify-center text-center text-sm text-neutral-500">
        Renseignez un budget et un coût/clic pour voir le diagramme du funnel
      </div>
    );
  }

  return (
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
            <title>{`${CHANNEL_LABELS[link.channel]} : ${formatCount(link.value)}`}</title>
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
          const textContent = node.stage === 'channel' ? node.label : formatCount(node.value ?? 0);
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
                <title>{`${CHANNEL_LABELS[node.channel]} · ${node.label} : ${formatCount(node.value ?? 0)}`}</title>
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
  );
}
