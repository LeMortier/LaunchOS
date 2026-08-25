// Module 3 — KPI Tracker : ça compare, semaine après semaine, ce qu'on visait (objectif) à ce qu'on
// a vraiment obtenu (réel), pour suivre la progression du lancement sous forme de courbes.
import { useMemo, useState } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import type { KPIWeeklyEntry } from '../../store/types';
import { KpiLineChart } from './KpiLineChart';

// Fabrique un identifiant unique pour une nouvelle ligne. Utilisé par le formulaire manuel,
// et par l'import CSV quand la colonne "id" du fichier est vide ou absente.
function generateId(): string {
  return `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Forme du petit formulaire d'ajout manuel : tout reste en texte tant que l'utilisateur tape,
// on convertit en nombre seulement au moment de l'envoi vers le store.
interface FormState {
  week: string;
  metric: string;
  actual: string;
  target: string;
}

const emptyForm: FormState = { week: '', metric: '', actual: '', target: '' };

export default function KPITracker() {
  // On lit les entrées KPI directement dans le store partagé (zustand), et on récupère les actions
  // pour les modifier. C'est ce qui prouve que ce module est vraiment branché, pas juste une maquette.
  const kpiEntries = useLaunchStore((state) => state.kpiEntries);
  const setKpiEntries = useLaunchStore((state) => state.setKpiEntries);
  const upsertKpiEntry = useLaunchStore((state) => state.upsertKpiEntry);

  // "state" (donnée locale au composant, qui redessine l'écran quand elle change) pour le formulaire
  // d'ajout manuel et pour la métrique choisie dans le graphique.
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  // La liste des métriques différentes présentes dans les entrées (ex: "Inscriptions", "MRR"...),
  // sans doublons, pour remplir le menu déroulant du graphique.
  const metrics = useMemo(() => {
    const unique = new Set(kpiEntries.map((entry) => entry.metric));
    return Array.from(unique);
  }, [kpiEntries]);

  // La métrique réellement affichée : celle choisie dans le select, ou la première disponible par défaut.
  const activeMetric = selectedMetric || metrics[0] || '';

  // Les points du graphique : seulement les entrées de la métrique active, triées par semaine
  // (sinon la courbe part dans tous les sens si les semaines ne sont pas dans l'ordre du CSV).
  const chartData = useMemo(() => {
    return kpiEntries
      .filter((entry) => entry.metric === activeMetric)
      .slice()
      .sort((a, b) => a.week.localeCompare(b.week));
  }, [kpiEntries, activeMetric]);

  // Appelée à la soumission du formulaire manuel : construit une entrée KPI et l'envoie dans le store
  // via upsertKpiEntry (qui l'ajoute si l'id est nouveau, ou la remplace si elle existe déjà).
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.week.trim() || !form.metric.trim()) return; // on évite d'ajouter une ligne vide
    const entry: KPIWeeklyEntry = {
      id: generateId(),
      week: form.week.trim(),
      metric: form.metric.trim(),
      actual: Number(form.actual) || 0,
      target: Number(form.target) || 0,
    };
    upsertKpiEntry(entry);
    setForm(emptyForm); // on vide le formulaire pour la prochaine saisie
  };

  // Transforme une ligne brute du CSV (que du texte) en vraie entrée KPI typée.
  // Number() sur une case vide ou invalide renvoie NaN, donc on retombe sur 0 plutôt que planter.
  const mapCsvRow = (row: Record<string, string>): KPIWeeklyEntry => ({
    id: row.id?.trim() || generateId(),
    week: row.week ?? '',
    metric: row.metric ?? '',
    actual: Number(row.actual) || 0,
    target: Number(row.target) || 0,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-white">KPI Tracker</h2>
        <p className="text-sm text-neutral-400">
          Suivi hebdo des indicateurs clés : ce qu'on a vraiment obtenu (réel) comparé à l'objectif fixé.
        </p>
      </div>

      {/* Import/export CSV : branché directement sur setKpiEntries, tout le fichier remplace la liste actuelle. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <CsvImportButton<KPIWeeklyEntry>
          label="Importer les KPI (CSV)"
          templateFilename="kpi-template.csv"
          templateHeaders={['id', 'week', 'metric', 'actual', 'target']}
          templateSampleRows={[
            ['kpi-1', 'S1', 'Inscriptions', '120', '150'],
            ['kpi-2', 'S2', 'Inscriptions', '210', '300'],
            ['kpi-3', 'S3', 'Inscriptions', '340', '450'],
            ['kpi-4', 'S4', 'Inscriptions', '480', '600'],
            ['kpi-5', 'S1', 'MRR', '800', '1000'],
            ['kpi-6', 'S2', 'MRR', '1450', '2000'],
          ]}
          mapRow={mapCsvRow}
          onImport={(rows) => setKpiEntries(rows)}
        />
      </div>

      {/* Graphique : deux courbes (réel / objectif) pour la métrique choisie dans le select. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-medium text-neutral-200">Progression</h3>
          {/* Le select n'apparaît que s'il y a plusieurs métriques à comparer, pas besoin sinon. */}
          {metrics.length > 1 && (
            <select
              value={activeMetric}
              onChange={(event) => setSelectedMetric(event.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
            >
              {metrics.map((metric) => (
                <option key={metric} value={metric}>
                  {metric}
                </option>
              ))}
            </select>
          )}
        </div>

        {chartData.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Aucune donnée pour l'instant : importe un CSV ou ajoute une entrée avec le formulaire ci-dessous.
          </p>
        ) : (
          <div className="h-72 w-full">
            <KpiLineChart data={chartData} height="100%" />
          </div>
        )}
      </div>

      {/* Formulaire manuel : ajoute (ou met à jour) une entrée directement dans le store, sans passer par un CSV. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-medium text-neutral-200 mb-3">Ajouter une entrée</h3>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Semaine
            <input
              value={form.week}
              onChange={(event) => setForm({ ...form, week: event.target.value })}
              placeholder="S1"
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 w-24"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Métrique
            <input
              value={form.metric}
              onChange={(event) => setForm({ ...form, metric: event.target.value })}
              placeholder="Inscriptions"
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 w-36"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Réel
            <input
              type="number"
              value={form.actual}
              onChange={(event) => setForm({ ...form, actual: event.target.value })}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 w-24"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Objectif
            <input
              type="number"
              value={form.target}
              onChange={(event) => setForm({ ...form, target: event.target.value })}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 w-24"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-emerald-400 transition-colors"
          >
            Ajouter
          </button>
        </form>
      </div>

      {/* Tableau brut : toutes les entrées KPI du store, sans filtre, pour vérifier ce qui est vraiment stocké. */}
      <div className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-medium text-neutral-200 mb-3">Toutes les entrées</h3>
        {kpiEntries.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune entrée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-800">
                  <th className="py-1.5 pr-4 font-medium">Semaine</th>
                  <th className="py-1.5 pr-4 font-medium">Métrique</th>
                  <th className="py-1.5 pr-4 font-medium">Réel</th>
                  <th className="py-1.5 pr-4 font-medium">Objectif</th>
                </tr>
              </thead>
              <tbody>
                {kpiEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-neutral-900 text-neutral-300">
                    <td className="py-1.5 pr-4">{entry.week}</td>
                    <td className="py-1.5 pr-4">{entry.metric}</td>
                    <td className="py-1.5 pr-4">{entry.actual}</td>
                    <td className="py-1.5 pr-4">{entry.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TODO : calculer et afficher l'écart (réel - objectif) coloré en vert/rouge par ligne,
          et éventuellement une petite projection de tendance pour anticiper la fin du mois. */}
    </div>
  );
}
