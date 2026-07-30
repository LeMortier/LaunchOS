// Module 2 : le Budget Allocator. Il sert à répartir le budget marketing entre les 4 canaux
// (SEO, Ads, Influence, PR) avec des sliders (curseurs), et à visualiser la répartition avec
// un donut chart (un graphique en anneau : un camembert avec un trou au milieu).
// Ce module lit et écrit directement dans le store partagé (Zustand, notre "mémoire commune"
// entre tous les modules) : dès qu'on bouge un slider, le budget est à jour partout ailleurs
// dans l'app, par exemple pour le Sankey Funnel qui part de ces mêmes budgets.
import { CHANNELS, CHANNEL_COLORS, CHANNEL_LABELS, type Channel, type ChannelBudget } from '../../store/types';
import { useLaunchStore } from '../../store/useLaunchStore';
import { CsvImportButton } from '../../components/CsvImportButton';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

// Bornes du slider : on part du principe qu'un seul canal ne recevra jamais plus de 50 000€
// d'un coup. On pourra rendre ça configurable plus tard si besoin.
const BUDGET_MIN = 0;
const BUDGET_MAX = 50000;
const BUDGET_STEP = 500;

// Transforme une ligne brute du CSV (juste du texte) en ChannelBudget typé.
// Si le canal n'existe pas dans CHANNELS, ou si le montant n'est pas un nombre valide, on lève
// une erreur : parseCsvFile (dans csvImport.ts) l'attrape et ignore juste cette ligne-là, sans
// faire planter tout l'import.
function mapBudgetRow(row: Record<string, string>): ChannelBudget {
  const channelValue = (row.channel ?? '').trim().toLowerCase();
  if (!(CHANNELS as readonly string[]).includes(channelValue)) {
    throw new Error(`Canal inconnu dans le CSV : "${channelValue}"`);
  }
  const amount = Number(row.amount);
  if (Number.isNaN(amount)) {
    throw new Error(`Montant invalide dans le CSV : "${row.amount}"`);
  }
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

  // Petit raccourci pour retrouver le montant d'un canal donné (0 si rien n'a encore été saisi).
  const getAmount = (channel: Channel): number =>
    channelBudgets.find((budget) => budget.channel === channel)?.amount ?? 0;

  const total = channelBudgets.reduce((sum, budget) => sum + budget.amount, 0);

  // Les données du donut chart : un point par canal, avec son libellé et sa couleur.
  const chartData = CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    amount: getAmount(channel),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Budget Allocator</h2>
        <p className="text-sm text-neutral-400">Répartition du budget marketing par canal</p>
      </div>

      {/* Import/export CSV, branché directement sur setChannelBudgets pour remplacer toute la
          liste des budgets d'un coup avec le contenu du fichier. */}
      <CsvImportButton<ChannelBudget>
        label="Importer un budget CSV"
        templateFilename="budget-template.csv"
        templateHeaders={['channel', 'amount']}
        templateSampleRows={SAMPLE_ROWS}
        mapRow={mapBudgetRow}
        onImport={setChannelBudgets}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Colonne de gauche : un slider par canal pour ajuster le budget à la main. */}
        <div className="flex flex-col gap-4 rounded-lg border border-neutral-800 p-4">
          {CHANNELS.map((channel) => {
            const amount = getAmount(channel);
            return (
              <div key={channel} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={`slider-${channel}`} className="text-neutral-300">
                    {CHANNEL_LABELS[channel]}
                  </label>
                  <span className="font-medium text-emerald-400">
                    {amount.toLocaleString('fr-FR')} €
                  </span>
                </div>
                <input
                  id={`slider-${channel}`}
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={amount}
                  onChange={(event) => setChannelBudget(channel, Number(event.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            );
          })}
          <div className="mt-2 flex items-center justify-between border-t border-neutral-800 pt-3 text-sm">
            <span className="text-neutral-400">Total alloué</span>
            <span className="text-base font-semibold text-white">
              {total.toLocaleString('fr-FR')} €
            </span>
          </div>
        </div>

        {/* Colonne de droite : le donut chart. Il se met à jour tout seul dès qu'un slider bouge
            ou qu'un CSV est importé, puisqu'il lit exactement les mêmes données du store. */}
        <div className="rounded-lg border border-neutral-800 p-4">
          {total > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="amount"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value).toLocaleString('fr-FR')} €`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            // Tant qu'aucun budget n'est saisi, un donut vide n'a aucun intérêt (et recharts
            // n'affiche rien de propre dans ce cas) : on montre juste un message à la place.
            <div className="flex h-[260px] items-center justify-center text-center text-sm text-neutral-500">
              Ajustez les sliders ou importez un CSV pour voir la répartition
            </div>
          )}
        </div>
      </div>

      {/* TODO : ajouter des réglages plus fins (ex: saisie du montant au clavier en plus du
          slider, verrouillage d'un canal, répartition automatique du reste du budget entre les
          autres canaux). Pas nécessaire pour ce shell : l'essentiel ici, c'est que les sliders,
          le donut chart et l'import CSV soient tous les 3 branchés sur le vrai store partagé. */}
    </div>
  );
}
