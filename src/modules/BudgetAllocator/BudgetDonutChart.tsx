// Le donut chart (graphique en anneau) du budget par canal, extrait de BudgetAllocator.tsx dans son
// propre composant pour pouvoir être réutilisé tel quel par le PDF Export (qui a besoin d'afficher
// exactement le même graphique, hors écran, pour le capturer en image avec html2canvas).
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHANNELS, CHANNEL_COLORS, CHANNEL_LABELS, type Channel, type ChannelBudget } from '../../store/types';

interface BudgetDonutChartProps {
  channelBudgets: ChannelBudget[];
  height?: number;
}

export function BudgetDonutChart({ channelBudgets, height = 260 }: BudgetDonutChartProps) {
  const getAmount = (channel: Channel): number =>
    channelBudgets.find((budget) => budget.channel === channel)?.amount ?? 0;
  const total = channelBudgets.reduce((sum, budget) => sum + budget.amount, 0);

  // Les données du donut chart : un point par canal, avec son libellé et sa couleur.
  const chartData = CHANNELS.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    amount: getAmount(channel),
  }));

  if (total <= 0) {
    // Tant qu'aucun budget n'est saisi, un donut vide n'a aucun intérêt (et recharts n'affiche
    // rien de propre dans ce cas) : on montre juste un message à la place.
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-center text-sm text-neutral-500"
      >
        Ajustez les sliders ou importez un CSV pour voir la répartition
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
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
  );
}
