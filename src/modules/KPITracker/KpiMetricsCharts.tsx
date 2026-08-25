// Empile une courbe KpiLineChart par métrique présente dans les entrées (Visiteurs, Inscriptions...).
// Sert au PDF Export : contrairement à l'écran du KPI Tracker (qui affiche une métrique à la fois via
// un menu déroulant), le rapport imprimé doit montrer toutes les métriques d'un coup, sans sélection.
import { useMemo } from 'react';
import type { KPIWeeklyEntry } from '../../store/types';
import { KpiLineChart } from './KpiLineChart';

interface KpiMetricsChartsProps {
  kpiEntries: KPIWeeklyEntry[];
  height?: number;
}

export function KpiMetricsCharts({ kpiEntries, height = 220 }: KpiMetricsChartsProps) {
  // Regroupe les entrées par métrique, chacune triée par semaine (sinon la courbe part dans tous
  // les sens si les semaines ne sont pas dans l'ordre du store).
  const series = useMemo(() => {
    const byMetric = new Map<string, KPIWeeklyEntry[]>();
    for (const entry of kpiEntries) {
      const list = byMetric.get(entry.metric) ?? [];
      list.push(entry);
      byMetric.set(entry.metric, list);
    }
    return Array.from(byMetric.entries()).map(([metric, entries]) => ({
      metric,
      data: entries.slice().sort((a, b) => a.week.localeCompare(b.week)),
    }));
  }, [kpiEntries]);

  return (
    <div className="flex flex-col gap-4">
      {series.map(({ metric, data }) => (
        <div key={metric}>
          <h4 className="mb-1 text-xs font-medium text-neutral-400">{metric}</h4>
          <KpiLineChart data={data} height={height} />
        </div>
      ))}
    </div>
  );
}
