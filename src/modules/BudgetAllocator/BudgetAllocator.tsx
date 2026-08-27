// Module 2 : le Budget Allocator. Il sert à répartir le budget marketing entre les 4 canaux
// (SEO, Ads, Influence, PR) avec des sliders (curseurs), et à visualiser la répartition avec
// un donut chart (un graphique en anneau : un camembert avec un trou au milieu).
// Ce module lit et écrit directement dans le store partagé (Zustand, notre "mémoire commune"
// entre tous les modules) : dès qu'on bouge un slider, le budget est à jour partout ailleurs
// dans l'app, par exemple pour le Sankey Funnel qui part de ces mêmes budgets.
import { CHANNELS, CHANNEL_LABELS, type Channel, type ChannelBudget } from '../../store/types';
import { useLaunchStore } from '../../store/useLaunchStore';
import { CsvImportButton } from '../../components/CsvImportButton';
import { BUDGET_AMOUNT_MIN, parseCsvNumber } from '../../store/numberBounds';
import { BudgetDonutChart } from './BudgetDonutChart';

// Bornes du slider. Le minimum vient de numberBounds.ts (même règle que l'import CSV plus bas) ;
// le plafond et le pas restent propres à ce curseur, c'est juste une limite d'ergonomie (on part du
// principe qu'un seul canal ne recevra jamais plus de 50 000€ d'un coup), pas une règle métier.
const BUDGET_MAX = 50000;
const BUDGET_STEP = 500;

// Transforme une ligne brute du CSV (juste du texte) en ChannelBudget typé. Si le canal n'existe pas
// dans CHANNELS, ou si le montant n'est pas un nombre valide ou négatif, on lève une erreur :
// parseCsvFileStrict (mode strict, voir plus bas) annule alors tout l'import avec ce message,
// plutôt que de laisser passer un budget cassé.
function mapBudgetRow(row: Record<string, string>): ChannelBudget {
  const channelValue = (row.channel ?? '').trim().toLowerCase();
  if (!(CHANNELS as readonly string[]).includes(channelValue)) {
    throw new Error(`Canal inconnu dans le CSV : "${channelValue}"`);
  }
  const amount = parseCsvNumber(row.amount, 'Le montant', BUDGET_AMOUNT_MIN, Infinity);
  return { channel: channelValue as Channel, amount };
}

// Lignes d'exemple pour le template CSV téléchargeable, une par canal avec des montants réalistes.
const SAMPLE_ROWS: string[][] = [
  ['seo', '8000'],
  ['ads', '15000'],
  ['influence', '6000'],
  ['pr', '2500'],
];

export default function BudgetAllocator() {
  // On lit les budgets actuels depuis le store partagé, et on récupère les 2 actions qui
  // permettent de les modifier : une pour un seul canal (utilisée par les sliders), une pour
  // remplacer toute la liste d'un coup (utilisée par l'import CSV).
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  const setChannelBudget = useLaunchStore((state) => state.setChannelBudget);
  const setChannelBudgets = useLaunchStore((state) => state.setChannelBudgets);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // Petit raccourci pour retrouver le montant d'un canal donné (0 si rien n'a encore été saisi).
  const getAmount = (channel: Channel): number =>
    channelBudgets.find((budget) => budget.channel === channel)?.amount ?? 0;

  const total = channelBudgets.reduce((sum, budget) => sum + budget.amount, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Budget Allocator</h2>
        <p className="text-sm text-muted mt-2">Répartition du budget marketing par canal</p>
      </div>

      {/* Import/export CSV, branché directement sur setChannelBudgets pour remplacer toute la
          liste des budgets d'un coup avec le contenu du fichier. */}
      <CsvImportButton<ChannelBudget>
        key={resetGeneration}
        label="Importer un budget CSV"
        templateFilename="budget-template.csv"
        templateHeaders={['channel', 'amount']}
        templateSampleRows={SAMPLE_ROWS}
        mapRow={mapBudgetRow}
        onImport={setChannelBudgets}
        strict
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colonne de gauche : un slider par canal pour ajuster le budget à la main. */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          {CHANNELS.map((channel) => {
            const amount = getAmount(channel);
            return (
              <div key={channel} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={`slider-${channel}`} className="text-muted">
                    {CHANNEL_LABELS[channel]}
                  </label>
                  <span className="font-mono tabular-nums text-ink">
                    {amount.toLocaleString('fr-FR')} €
                  </span>
                </div>
                <input
                  id={`slider-${channel}`}
                  type="range"
                  min={BUDGET_AMOUNT_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={amount}
                  onChange={(event) => setChannelBudget(channel, Number(event.target.value))}
                  className="w-full accent-accent"
                />
              </div>
            );
          })}
          {/* Le total alloué, c'est LE chiffre qui résume le module : c'est le seul en ambre ici. */}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted">Total alloué</span>
            <span className="font-mono tabular-nums text-base font-semibold text-accent">
              {total.toLocaleString('fr-FR')} €
            </span>
          </div>
        </div>

        {/* Colonne de droite : le donut chart. Il se met à jour tout seul dès qu'un slider bouge
            ou qu'un CSV est importé, puisqu'il lit exactement les mêmes données du store. */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <BudgetDonutChart channelBudgets={channelBudgets} />
        </div>
      </div>

      {/* TODO : ajouter des réglages plus fins (ex: saisie du montant au clavier en plus du
          slider, verrouillage d'un canal, répartition automatique du reste du budget entre les
          autres canaux). Pas nécessaire pour ce shell : l'essentiel ici, c'est que les sliders,
          le donut chart et l'import CSV soient tous les 3 branchés sur le vrai store partagé. */}
    </div>
  );
}
