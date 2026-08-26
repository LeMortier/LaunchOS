// La courbe "réel vs objectif" pour UNE métrique, extraite de KPITracker.tsx dans son propre
// composant pour pouvoir être réutilisée telle quelle par le PDF Export : il affiche, lui, toutes
// les métriques les unes sous les autres plutôt qu'une seule à la fois (voir KpiMetricsCharts.tsx).
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
  /** 'light' = version imprimable (fond blanc, texte foncé) utilisée hors écran pour le PDF Export. */
  variant?: 'dark' | 'light';
}

export function KpiLineChart({ data, height = 260, variant = 'dark' }: KpiLineChartProps) {
  // recharts prend ses couleurs par des props JS (pas des classes Tailwind), donc on fixe des
  // couleurs explicites selon la variante plutôt que de compter sur l'héritage CSS. Comme ça, c'est
  // sûr que ça reste lisible aussi bien à l'écran (fond sombre) que dans le PDF (fond blanc forcé).
  const isLight = variant === 'light';
  const gridStroke = isLight ? '#e5e5e5' : '#253449';
  const axisStroke = isLight ? '#737373' : '#8a9bb0';
  const legendColor = isLight ? '#262626' : 'var(--color-ink)';
  const tooltipBg = isLight ? '#ffffff' : '#172334';
  const tooltipBorder = isLight ? '#d4d4d4' : '#253449';
  const tooltipText = isLight ? '#171717' : '#e7edf5';
  const tooltipLabelColor = isLight ? '#525252' : '#8a9bb0';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="week" stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <YAxis stroke={axisStroke} tick={{ fill: axisStroke, fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: 4,
            color: tooltipText,
          }}
          labelStyle={{ color: tooltipLabelColor }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: legendColor }} />
        {/* "Réel" et "Objectif" utilisent 2 couleurs neutres de la palette (bleu canal SEO / gris
            muted) plutôt que l'ambre : l'ambre reste réservé aux actions et valeurs clés, pas à la
            décoration d'un graphique. Le pointillé sur "Objectif" aide aussi à distinguer les 2
            courbes sans dépendre uniquement de la couleur (utile si daltonien). */}
        <Line type="monotone" dataKey="actual" name="Réel" stroke="#5b8def" strokeWidth={2} dot={{ r: 4 }} />
        <Line
          type="monotone"
          dataKey="target"
          name="Objectif"
          stroke="#8a9bb0"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
