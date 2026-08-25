// La courbe "réel vs objectif" pour UNE métrique, extraite de KPITracker.tsx dans son propre
// composant pour pouvoir être réutilisée telle quelle par le PDF Export (qui affiche, lui, toutes
// les métriques les unes sous les autres plutôt qu'une seule à la fois — voir KpiMetricsCharts.tsx).
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface KpiLineChartProps {
  data: { week: string; actual: number; target: number }[];
  // recharts accepte un nombre de pixels ou un pourcentage ("100%", quand le parent a déjà une
  // hauteur fixée ailleurs, comme dans KPITracker.tsx avec sa classe "h-72").
  height?: number | `${number}%`;
}

export function KpiLineChart({ data, height = 260 }: KpiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#2c2c2a" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="week" stroke="#898781" tick={{ fill: '#898781', fontSize: 12 }} />
        <YAxis stroke="#898781" tick={{ fill: '#898781', fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#171717',
            border: '1px solid #404040',
            borderRadius: 8,
            color: '#fff',
          }}
          labelStyle={{ color: '#a3a3a3' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a3a3a3' }} />
        {/* Réel en trait plein emerald (couleur d'accent du projet). */}
        <Line type="monotone" dataKey="actual" name="Réel" stroke="#34d399" strokeWidth={2} dot={{ r: 4 }} />
        {/* Objectif en trait pointillé : le pointillé sert aussi à distinguer les deux courbes
            sans dépendre uniquement de la couleur (utile si daltonien). */}
        <Line
          type="monotone"
          dataKey="target"
          name="Objectif"
          stroke="#fbbf24"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
