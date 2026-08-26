// La "barre de pilotage" : l'élément qui justifie le mot "cockpit" dans LaunchOS. Un bandeau collé en
// haut de la zone de contenu (il reste visible même quand on scrolle un module long), visible depuis
// les 6 modules, qui affiche en permanence 4 constantes vitales du lancement : le budget total, le
// ROAS global, le score de risque et l'avancement du calendrier GTM.
// Toutes ces valeurs sont recalculées en direct depuis le store partagé : ce composant ne fait que
// LIRE (aucune action, aucune écriture), donc il ne peut jamais désynchroniser un module.
import { useMemo } from 'react';
import { useLaunchStore } from '../store/useLaunchStore';
import { GTM_PHASES } from '../store/types';
import { formatMoney, formatNumber } from '../store/formatters';
import { computeFunnelRows, computeFunnelTotals } from '../modules/SankeyFunnel/funnelMath';

export function CockpitBar() {
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  const funnelConfigs = useLaunchStore((state) => state.funnelConfigs);
  const riskCriteria = useLaunchStore((state) => state.riskCriteria);
  const gtmTasks = useLaunchStore((state) => state.gtmTasks);

  const totalBudget = channelBudgets.reduce((sum, b) => sum + b.amount, 0);

  // Même calcul que le module Sankey Funnel (funnelMath.ts), pour obtenir un ROAS global cohérent
  // avec ce qu'affiche ce module — null tant qu'aucun budget n'est réparti (pas de "0x" trompeur).
  const globalRoas = useMemo(() => {
    const rows = computeFunnelRows(channelBudgets, funnelConfigs);
    const totals = computeFunnelTotals(rows);
    return totals.amount > 0 ? totals.roas : null;
  }, [channelBudgets, funnelConfigs]);

  // null tant que le questionnaire n'a pas été rempli au moins une fois (le store est vide avant la
  // première visite du module Risk Scorer, qui l'initialise à son propre montage).
  const riskScore =
    riskCriteria.length > 0
      ? riskCriteria.reduce((total, criterion) => total + criterion.score * criterion.weight, 0)
      : null;

  // Combien des 3 phases (pré-lancement, lancement, post-lancement) ont au moins une tâche.
  const coveredPhases = new Set(gtmTasks.map((task) => task.phase)).size;

  // Couleur du score de risque : neutre si c'est bas (rien à signaler), ambre si ça mérite attention,
  // rouge/rose (alerte) si c'est franchement élevé. Les seuils reprennent ceux du module Risk Scorer.
  const riskValueClass =
    riskScore === null ? 'text-ink' : riskScore >= 7 ? 'text-alert' : riskScore >= 4 ? 'text-accent' : 'text-ink';

  return (
    <div className="sticky top-0 z-10 mb-8 rounded-lg border border-border bg-surface px-6 py-4">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <Indicator label="Budget total alloué" value={totalBudget > 0 ? formatMoney(totalBudget) : '—'} />
        <Indicator label="ROAS global" value={globalRoas !== null ? `${formatNumber(globalRoas)}x` : '—'} />
        <Indicator
          label="Score de risque"
          value={riskScore !== null ? `${formatNumber(riskScore)} / 10` : '—'}
          valueClassName={riskValueClass}
        />
        <Indicator
          label="Avancement GTM"
          value={
            gtmTasks.length > 0
              ? `${gtmTasks.length} tâche(s) · ${coveredPhases}/${GTM_PHASES.length} phases`
              : '—'
          }
        />
      </div>
    </div>
  );
}

// Un indicateur : un petit label gris au-dessus d'une grande valeur en mono. Si une donnée n'a pas
// encore été renseignée, on affiche "—" plutôt que "0" : un zéro est une information fausse (ça
// laisserait croire que le budget vaut vraiment 0€), un tiret dit honnêtement "pas encore rempli".
function Indicator({
  label,
  value,
  valueClassName = 'text-ink',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={`font-mono text-2xl font-medium tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
