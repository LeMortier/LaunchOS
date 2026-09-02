// La grille d'entonnoirs du funnel (un par canal) est l'élément le plus impressionnant du produit,
// donc traité en "héros" : placé juste après le tableau des hypothèses, avant le tableau des
// résultats, avec un peu plus de respiration (voir le p-8 dans SankeyFunnel.tsx). Extrait dans son
// propre composant pour pouvoir être réutilisé tel quel par le PDF Export (qui a besoin d'afficher
// exactement la même grille, hors écran, pour la capturer en image).
// Chaque canal a son propre entonnoir (clics -> leads -> clients), dans SA couleur (CHANNEL_COLORS,
// la même que partout ailleurs dans l'app) : le but est de garder la comparaison entre canaux, pas de
// tout fondre dans un entonnoir unique qui perdrait cette comparaison.
import { Cell, Funnel, FunnelChart, LabelList, type LabelProps, ResponsiveContainer, Tooltip } from 'recharts';
import { CHANNEL_COLORS, CHANNEL_LABELS, type Channel } from '../../store/types';
import { formatCount } from '../../store/formatters';
import type { FunnelRow } from './funnelMath';

// Hauteur d'un entonnoir individuel. Volontairement plus petite que l'ancien diagramme unique
// (qui faisait 460px de haut) : ici on affiche 4 entonnoirs séparés plutôt qu'un seul grand
// diagramme, donc chacun reste dans l'échelle des autres graphiques du module (donut à 260, courbes
// KPI à 220).
const CHART_HEIGHT = 240;

// Les 3 étages affichés dans chaque entonnoir, avec l'opacité utilisée pour chacun : toujours la
// couleur du canal, mais de plus en plus intense en descendant (clics -> leads -> clients), pour
// distinguer les étages sans introduire de nouvelle couleur.
const FUNNEL_STAGES: { key: 'clicks' | 'leads' | 'customers'; label: string; opacity: number }[] = [
  { key: 'clicks', label: 'Clics', opacity: 0.55 },
  { key: 'leads', label: 'Leads', opacity: 0.75 },
  { key: 'customers', label: 'Clients', opacity: 1 },
];

// Transforme une couleur hexadécimale (#RRGGBB, celle du canal) en chaîne rgba(...) avec l'opacité
// donnée : c'est ce qui permet de dessiner les 3 étages d'un entonnoir dans une seule couleur de
// canal, avec une intensité différente par étage.
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Sépare "Clics" de "18 750" à l'intérieur de la chaîne "label" construite plus bas (ex:
// "Clics : 18 750") : le seul endroit qui a besoin de cette séparation est FunnelStageLabel juste
// en dessous, donc autant garder ça comme une chaîne toute simple plutôt qu'un objet.
const LABEL_PARTS_SEPARATOR = ' : ';

// Dessine soi-même l'étiquette d'un étage de l'entonnoir (nom au-dessus, valeur en dessous), plutôt
// que de laisser recharts la positionner (position="right" habituel de LabelList). Vérifié en
// inspectant son propre calcul : pour un Funnel, la largeur qu'il réserve à une étiquette de droite
// est mesurée par rapport à la zone de TRACÉ du graphique, qui exclut justement la marge où
// l'étiquette est censée s'afficher. Résultat, mesuré aussi : une largeur quasi nulle, qui désactive
// complètement le retour à la ligne pour l'étage le plus large (le texte déborde tel quel, coupé au
// bord de la carte) et le déclenche à l'excès pour les étages plus étroits (un retour à la ligne
// après chaque mot). On reproduit ici le même point d'ancrage que recharts (bord droit du trapèze, à
// mi-hauteur de l'étage), mais sur deux lignes fixes qu'on sait toujours tenir dans la marge
// réservée, quelle que soit la longueur du nombre affiché.
function FunnelStageLabel(props: LabelProps) {
  const { value, fill } = props;
  // viewBox couvre plusieurs formes possibles (rectangle, cercle, trapèze...) selon le type de
  // graphique ; ici on sait qu'on est toujours dans un Funnel, donc toujours un trapèze
  // (upperWidth/lowerWidth), mais TypeScript ne peut pas le déduire tout seul du type de LabelProps.
  const viewBox = props.viewBox as
    | { x: number; y: number; upperWidth: number; lowerWidth: number; height: number }
    | undefined;
  if (!viewBox || typeof viewBox.upperWidth !== 'number' || typeof value !== 'string') return null;
  const [name, valueText] = value.split(LABEL_PARTS_SEPARATOR);

  const lowerX = viewBox.x + (viewBox.upperWidth - viewBox.lowerWidth) / 2;
  const middleX = (viewBox.x + lowerX) / 2;
  const midHeightWidth = (viewBox.upperWidth + viewBox.lowerWidth) / 2;
  const anchorX = middleX + midHeightWidth + 8; // 8 : petit espace avant le début du texte
  const anchorY = viewBox.y + viewBox.height / 2;

  return (
    <text x={anchorX} y={anchorY} fill={fill} className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <tspan x={anchorX} dy="-0.3em">
        {name}
      </tspan>
      <tspan x={anchorX} dy="1.2em">
        {valueText}
      </tspan>
    </text>
  );
}

// Vrai si l'utilisateur a demandé, au niveau de son système, de réduire les animations.
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface FunnelChartsProps {
  rows: Pick<FunnelRow, 'channel' | 'clicks' | 'leads' | 'customers'>[];
  /** 'light' = version imprimable (fond blanc, texte foncé) utilisée hors écran pour le PDF Export. */
  variant?: 'dark' | 'light';
}

// N'a pas de style d'encart (bordure, padding) autour de la grille entière : c'est au composant
// appelant de décider comment l'entourer, puisqu'il est utilisé à la fois dans la page du module et
// hors écran pour le PDF.
export function FunnelCharts({ rows, variant = 'dark' }: FunnelChartsProps) {
  const isLight = variant === 'light';
  const emptyTextClass = isLight ? 'text-neutral-500' : 'text-muted';
  const channelLabelClass = isLight ? 'text-neutral-700' : 'text-ink';
  // Les entonnoirs recharts ont besoin d'une vraie couleur (pas d'une classe Tailwind) pour leurs
  // étiquettes : mêmes valeurs que BudgetDonutChart, pour rester cohérent sur les deux thèmes.
  const labelFill = isLight ? '#262626' : 'var(--color-ink)';
  // bg-canvas/border-border sont les couleurs de l'appli à l'écran (fond sombre) : sans cette
  // bascule, chaque carte de canal garderait un fond bleu nuit même dans la version imprimable du
  // PDF (fond blanc), au lieu de s'y fondre comme le reste de la page. Pas de fond du tout en clair
  // (juste une bordure fine) : le blanc de la page derrière suffit, pas besoin de le répéter ici.
  const cardBgClass = isLight ? '' : 'bg-canvas';
  const cardBorderClass = isLight ? 'border-neutral-200' : 'border-border';
  // sm:/lg: se basent sur la largeur de la FENÊTRE du navigateur, jamais sur celle d'un conteneur en
  // particulier. Pour la version imprimable, le conteneur hors écran de PDFExport.tsx est bien figé
  // à 820px, mais la fenêtre de la personne qui génère le PDF, elle, ne l'est pas : sur un écran
  // large, lg: se déclencherait quand même et écraserait 4 colonnes dans ces 820px au lieu des 2
  // prévues. On fige donc la grille à 2 colonnes en clair, indépendamment de la fenêtre ; à l'écran
  // (sombre), la grille reste responsive comme avant.
  const gridColsClass = isLight ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  // La copie hors écran qui sert de photo pour le PDF ne doit JAMAIS s'animer, et ce n'est pas une
  // question de goût. Pendant son animation d'entrée, recharts n'affiche pas du tout les étiquettes
  // des étages (dans son code : showLabels vaut !isAnimating), il ne dessine que les formes. Or cette
  // animation repart à zéro dès que le tableau de données change d'identité, et c'est exactement ce
  // qui se passe au clic sur "Générer le PDF" : le clic met à jour un state de PDFExport, qui
  // recalcule funnelRows, donc de nouvelles données, donc une animation qui redémarre pile au moment
  // où html-to-image prend la photo. Résultat mesuré : les 12 étiquettes disparaissent du DOM hors
  // écran pendant environ 2 secondes, et le PDF ne recevait que des entonnoirs muets.
  // À l'écran l'animation reste active, elle sert à voir le funnel se construire.
  const animate = !isLight && !prefersReducedMotion();

  // Tant qu'aucun canal n'a de clic (aucun budget ni coût par clic renseigné nulle part), il n'y a
  // rien à dessiner du tout : un seul message centré à la place de toute la grille, plutôt que 4
  // cases vides côte à côte.
  const hasAnyData = rows.some((row) => row.clicks > 0);
  if (!hasAnyData) {
    return (
      <div className={`flex h-[200px] items-center justify-center text-center text-sm ${emptyTextClass}`}>
        Renseignez un budget et un coût par clic pour dessiner le funnel.
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${gridColsClass}`}>
      {rows.map((row) => (
        <div key={row.channel} className={`rounded border ${cardBorderClass} ${cardBgClass} p-3`}>
          {/* En-tête du canal : petit point de sa couleur + son nom, pour identifier chaque
              entonnoir de la grille sans avoir à se fier uniquement à la couleur. */}
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHANNEL_COLORS[row.channel] }}
            />
            <span className={`text-xs font-medium ${channelLabelClass}`}>{CHANNEL_LABELS[row.channel]}</span>
          </div>

          {row.clicks <= 0 ? (
            // Ce canal précis n'a pas de clic (budget ou coût par clic manquant) : on garde sa
            // case dans la grille (pour ne pas casser la comparaison entre les 4 canaux), avec un
            // message à la place d'un entonnoir vide plutôt qu'un entonnoir à 0 partout.
            <div
              style={{ height: CHART_HEIGHT }}
              className={`flex items-center justify-center text-center text-xs ${emptyTextClass}`}
            >
              Aucune donnée pour ce canal.
            </div>
          ) : (
            <FunnelForChannel channel={row.channel} row={row} labelFill={labelFill} animate={animate} />
          )}
        </div>
      ))}
    </div>
  );
}

// L'entonnoir d'un seul canal : 3 étages (clics, leads, clients), dans la couleur du canal avec une
// intensité croissante (voir FUNNEL_STAGES), étiquette à droite de chaque étage (nom + valeur,
// formatée comme le tableau de résultats juste en dessous dans SankeyFunnel.tsx).
function FunnelForChannel({
  channel,
  row,
  labelFill,
  animate,
}: {
  channel: Channel;
  row: Pick<FunnelRow, 'clicks' | 'leads' | 'customers'>;
  labelFill: string;
  /** false pour la version imprimable : voir l'explication sur "animate" dans FunnelCharts. */
  animate: boolean;
}) {
  const data = FUNNEL_STAGES.map((stage) => {
    const value = row[stage.key];
    return {
      name: stage.label,
      value,
      // La hauteur d'un segment est proportionnelle à sizeValue, pas à value : entre les clics et
      // les clients, l'écart passe souvent au-dessus de 1000 pour 1, donc en taille réelle les deux
      // derniers segments (Leads, Clients) deviendraient quelques pixels à peine, invisibles et
      // impossibles à survoler. Le logarithme tasse cet écart pour que les 3 étapes restent
      // visibles et cliquables, même sur un canal aux petits chiffres comme Public Relations. Le
      // "+1" évite un logarithme de 0 (qui vaudrait -Infini) quand une étape est à 0. La vraie
      // valeur reste intacte dans "value" (et dans "label" juste en dessous) : seule la hauteur
      // affichée est trafiquée, jamais le chiffre montré à l'utilisateur.
      sizeValue: Math.log10(value + 1),
      label: `${stage.label} : ${formatCount(value)}`,
      fill: hexToRgba(CHANNEL_COLORS[channel], stage.opacity),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      {/* left égal à right, même si les étiquettes ne sont que d'un côté : FunnelChart centre la
          forme dans la zone qui reste ENTRE les deux marges, pas dans la carte entière. Une marge
          gauche plus petite que la droite (pensée uniquement pour laisser de la place au texte)
          poussait donc tout l'entonnoir vers la gauche, pointe comprise, au lieu de le centrer. */}
      <FunnelChart margin={{ top: 8, right: 76, bottom: 8, left: 76 }}>
        {/* Le survol doit afficher la vraie valeur (value), pas sizeValue qui pilote la hauteur du
            segment : on va la rechercher dans item.payload, l'objet de donnée complet de ce point. */}
        <Tooltip formatter={(_value, _name, item) => formatCount(Number(item.payload.value))} />
        <Funnel dataKey="sizeValue" data={data} isAnimationActive={animate}>
          {/* content={FunnelStageLabel} : voir le commentaire sur cette fonction plus haut dans le
              fichier, elle explique pourquoi on ne laisse pas recharts positionner cette étiquette
              lui-même. */}
          <LabelList dataKey="label" content={FunnelStageLabel} fill={labelFill} />
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
