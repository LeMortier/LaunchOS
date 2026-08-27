// KPI Tracker (module 3) : ça compare, semaine après semaine, ce qu'on visait (objectif) à ce qu'on
// a vraiment obtenu (réel), pour suivre la progression du lancement sous forme de courbes.
import { useMemo, useState } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import type { KPIWeeklyEntry } from '../../store/types';
import { clampToRange, KPI_VALUE_MIN, parseCsvNumber } from '../../store/numberBounds';
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
  const removeKpiEntry = useLaunchStore((state) => state.removeKpiEntry);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // "state" (donnée locale au composant, qui redessine l'écran quand elle change) pour le formulaire
  // d'ajout manuel et pour la métrique choisie dans le graphique.
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedMetric, setSelectedMetric] = useState<string>('');

  // Formulaire de modification : mêmes 4 champs que le formulaire d'ajout, mais pour une entrée déjà
  // existante. editingEntryId dit quelle entrée est en cours de modification (une seule à la fois),
  // et bascule cette ligne-là du tableau vers des champs de saisie plus bas.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);

  // La liste des métriques différentes présentes dans les entrées (ex: "Inscriptions", "MRR"...),
  // sans doublons, pour remplir le menu déroulant du graphique.
  const metrics = useMemo(() => {
    const unique = new Set(kpiEntries.map((entry) => entry.metric));
    return Array.from(unique);
  }, [kpiEntries]);

  // La métrique réellement affichée : celle choisie dans le select si elle existe encore parmi les
  // entrées, sinon la première disponible. Le "si elle existe encore" compte : si on supprime (ou on
  // renomme via modification) la dernière entrée de la métrique actuellement choisie, metrics ne la
  // contient plus, et sans cette vérification le graphique resterait bloqué sur une métrique qui n'a
  // plus aucune donnée au lieu de retomber sur une métrique qui en a.
  const activeMetric = selectedMetric && metrics.includes(selectedMetric) ? selectedMetric : (metrics[0] ?? '');

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

  // À la sortie du champ (onBlur), on ramène une valeur négative à 0, sans message d'erreur (voir
  // clampToRange dans store/numberBounds.ts). Un champ vidé reste vide : c'est handleSubmit qui
  // retombe sur 0 au moment d'ajouter, pas ce blur-là, sinon impossible de le laisser vide le temps
  // de finir de remplir le reste du formulaire.
  const handleActualBlur = () => {
    if (form.actual.trim() === '') return;
    setForm({ ...form, actual: String(clampToRange(Number(form.actual), KPI_VALUE_MIN, Infinity)) });
  };
  const handleTargetBlur = () => {
    if (form.target.trim() === '') return;
    setForm({ ...form, target: String(clampToRange(Number(form.target), KPI_VALUE_MIN, Infinity)) });
  };

  // Ouvre le formulaire de modification sur une entrée donnée, en pré-remplissant ses champs.
  // Rappeler cette fonction pendant qu'une autre entrée est déjà en cours de modification abandonne
  // silencieusement cette modification-là (pas de confirmation, comme demandé) et bascule sur la
  // nouvelle.
  const startEditingEntry = (entry: KPIWeeklyEntry) => {
    setEditingEntryId(entry.id);
    setEditForm({
      week: entry.week,
      metric: entry.metric,
      actual: String(entry.actual),
      target: String(entry.target),
    });
  };

  // Referme le formulaire de modification sans rien enregistrer.
  const cancelEditingEntry = () => setEditingEntryId(null);

  // Enregistre la modification : upsertKpiEntry remplace l'entrée existante puisqu'on lui redonne le
  // même id (voir sa définition dans useLaunchStore.ts), donc pas besoin d'une action séparée. Pas de
  // <form>/onSubmit ici (contrairement au formulaire d'ajout) : une ligne de tableau (tr) ne peut pas
  // être enveloppée dans un form sans casser le tableau, donc ce bouton appelle directement cette
  // fonction au clic.
  const handleSaveEditEntry = () => {
    if (!editingEntryId || !editForm.week.trim() || !editForm.metric.trim()) return;

    upsertKpiEntry({
      id: editingEntryId,
      week: editForm.week.trim(),
      metric: editForm.metric.trim(),
      actual: Number(editForm.actual) || 0,
      target: Number(editForm.target) || 0,
    });

    setEditingEntryId(null);
  };

  // Mêmes règles de correction que handleActualBlur/handleTargetBlur ci-dessus, appliquées cette
  // fois aux champs du formulaire de modification.
  const handleEditActualBlur = () => {
    if (editForm.actual.trim() === '') return;
    setEditForm({ ...editForm, actual: String(clampToRange(Number(editForm.actual), KPI_VALUE_MIN, Infinity)) });
  };
  const handleEditTargetBlur = () => {
    if (editForm.target.trim() === '') return;
    setEditForm({ ...editForm, target: String(clampToRange(Number(editForm.target), KPI_VALUE_MIN, Infinity)) });
  };

  // Supprime une entrée directement, sans confirmation (même comportement que le bouton Supprimer
  // du GTM Canvas). Le tableau, la liste de métriques et le graphique se recalculent tout seuls,
  // puisqu'ils sont tous dérivés de kpiEntries (voir metrics/activeMetric/chartData plus haut) : pas
  // de code particulier à écrire ici pour ça, y compris quand il ne reste plus aucune entrée
  // (chartData et kpiEntries tombent alors à 0, déjà géré par les écrans vides existants plus bas).
  const handleDeleteEntry = (id: string) => {
    removeKpiEntry(id);
    if (editingEntryId === id) setEditingEntryId(null);
  };

  // Transforme une ligne brute du CSV (que du texte) en vraie entrée KPI typée. Réel et Objectif
  // doivent respecter la même borne que le formulaire manuel plus bas (jamais négatifs). En mode
  // strict (voir CsvImportButton ci-dessous), la moindre ligne invalide annule tout l'import.
  const mapCsvRow = (row: Record<string, string>): KPIWeeklyEntry => ({
    id: row.id?.trim() || generateId(),
    week: row.week ?? '',
    metric: row.metric ?? '',
    actual: parseCsvNumber(row.actual, 'La valeur réelle', KPI_VALUE_MIN, Infinity),
    target: parseCsvNumber(row.target, "L'objectif", KPI_VALUE_MIN, Infinity),
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">KPI Tracker</h2>
        <p className="text-sm text-muted mt-2">
          Suivi hebdo des indicateurs clés : ce qu'on a vraiment obtenu (réel) comparé à l'objectif fixé.
        </p>
      </div>

      {/* Import/export CSV : branché directement sur setKpiEntries, tout le fichier remplace la liste actuelle. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <CsvImportButton<KPIWeeklyEntry>
          key={resetGeneration}
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
          strict
        />
      </div>

      {/* Graphique : deux courbes (réel / objectif) pour la métrique choisie dans le select. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-medium text-ink">Progression</h3>
          {/* Le select n'apparaît que s'il y a plusieurs métriques à comparer, pas besoin sinon. */}
          {metrics.length > 1 && (
            <select
              value={activeMetric}
              onChange={(event) => setSelectedMetric(event.target.value)}
              className="rounded border border-border bg-canvas px-2 py-1 text-sm text-ink"
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
          // Un écran vide doit dire quoi faire, pas juste constater qu'il n'y a rien : on guide
          // vers les deux façons d'ajouter des données (CSV ou formulaire juste en dessous).
          <p className="text-sm text-muted">
            Importez un CSV ou ajoutez une première semaine pour voir la courbe.
          </p>
        ) : (
          <div className="h-72 w-full">
            <KpiLineChart data={chartData} height="100%" />
          </div>
        )}
      </div>

      {/* Formulaire manuel : ajoute (ou met à jour) une entrée directement dans le store, sans passer par un CSV. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-ink mb-3">Ajouter une entrée</h3>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Semaine
            <input
              value={form.week}
              onChange={(event) => setForm({ ...form, week: event.target.value })}
              placeholder="S1"
              className="rounded border border-border bg-canvas px-2 py-1 text-sm text-ink w-24"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Métrique
            <input
              value={form.metric}
              onChange={(event) => setForm({ ...form, metric: event.target.value })}
              placeholder="Inscriptions"
              className="rounded border border-border bg-canvas px-2 py-1 text-sm text-ink w-36"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Réel
            <input
              type="number"
              min={KPI_VALUE_MIN}
              value={form.actual}
              onChange={(event) => setForm({ ...form, actual: event.target.value })}
              onBlur={handleActualBlur}
              className="rounded border border-border bg-canvas px-2 py-1 text-sm font-mono tabular-nums text-ink w-24"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Objectif
            <input
              type="number"
              min={KPI_VALUE_MIN}
              value={form.target}
              onChange={(event) => setForm({ ...form, target: event.target.value })}
              onBlur={handleTargetBlur}
              className="rounded border border-border bg-canvas px-2 py-1 text-sm font-mono tabular-nums text-ink w-24"
            />
          </label>
          {/* "Ajouter" est la seule action de ce bloc, donc c'est elle qui porte l'ambre.
              Pas de couleur décorative ailleurs dans le formulaire. */}
          <button
            type="submit"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas hover:bg-accent/90 transition-colors"
          >
            Ajouter
          </button>
          {/* Rappel discret des plages acceptées : utile puisque la correction se fait sans message
              d'erreur, juste en ramenant la valeur à la limite la plus proche à la sortie du champ.
              "w-full" pour prendre sa propre ligne dans ce formulaire qui wrap (flex-wrap). */}
          <p className="w-full text-xs text-muted">
            Réel et Objectif : jamais négatifs. Une valeur hors limites est ramenée automatiquement
            à la limite la plus proche.
          </p>
        </form>
      </div>

      {/* Tableau brut : toutes les entrées KPI du store, sans filtre, pour vérifier ce qui est vraiment stocké. */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-ink mb-3">Toutes les entrées</h3>
        {kpiEntries.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune entrée pour le moment : importez un CSV ou utilisez le formulaire ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="py-1.5 pr-4 font-medium">Semaine</th>
                  <th className="py-1.5 pr-4 font-medium">Métrique</th>
                  <th className="py-1.5 pr-4 font-medium">Réel</th>
                  <th className="py-1.5 pr-4 font-medium">Objectif</th>
                  <th className="py-1.5 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {kpiEntries.map((entry) =>
                  editingEntryId === entry.id ? (
                    // Ligne de modification : les 4 cellules deviennent des champs de saisie, avec
                    // les mêmes bornes et le même clamp au blur que le formulaire d'ajout au-dessus.
                    <tr key={entry.id} className="border-b border-accent text-ink">
                      <td className="py-1.5 pr-4">
                        <input
                          value={editForm.week}
                          onChange={(event) => setEditForm({ ...editForm, week: event.target.value })}
                          className="w-16 rounded border border-border bg-canvas px-2 py-1 text-sm text-ink focus:border-accent"
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          value={editForm.metric}
                          onChange={(event) => setEditForm({ ...editForm, metric: event.target.value })}
                          className="w-32 rounded border border-border bg-canvas px-2 py-1 text-sm text-ink focus:border-accent"
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          type="number"
                          min={KPI_VALUE_MIN}
                          value={editForm.actual}
                          onChange={(event) => setEditForm({ ...editForm, actual: event.target.value })}
                          onBlur={handleEditActualBlur}
                          className="w-20 rounded border border-border bg-canvas px-2 py-1 text-sm font-mono tabular-nums text-ink focus:border-accent"
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <input
                          type="number"
                          min={KPI_VALUE_MIN}
                          value={editForm.target}
                          onChange={(event) => setEditForm({ ...editForm, target: event.target.value })}
                          onBlur={handleEditTargetBlur}
                          className="w-20 rounded border border-border bg-canvas px-2 py-1 text-sm font-mono tabular-nums text-ink focus:border-accent"
                        />
                      </td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSaveEditEntry}
                            className="rounded bg-accent px-2 py-1 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingEntry}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="border-b border-border text-ink">
                      <td className="py-1.5 pr-4">{entry.week}</td>
                      <td className="py-1.5 pr-4">{entry.metric}</td>
                      {/* Réel / Objectif sont des nombres : la police mono + tabular-nums garde les
                          chiffres alignés en colonne, plus facile à comparer d'un coup d'œil. */}
                      <td className="py-1.5 pr-4 font-mono tabular-nums">{entry.actual}</td>
                      <td className="py-1.5 pr-4 font-mono tabular-nums">{entry.target}</td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEditingEntry(entry)}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="text-xs text-muted hover:text-alert transition-colors"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TODO : calculer et afficher l'écart (réel - objectif) par ligne, coloré en text-alert
          quand l'objectif n'est pas atteint, et éventuellement une petite projection de tendance
          pour anticiper la fin du mois. */}
    </div>
  );
}
