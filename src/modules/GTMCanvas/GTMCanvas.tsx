// Module "GTM Canvas" : la timeline des tâches de lancement, groupées par phase
// (pré-lancement, lancement, post-lancement). C'est ici qu'on prépare le plan d'action du go-to-market
// (GTM = "go-to-market", la stratégie pour lancer un produit sur le marché).
import { useMemo, useState } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import { GTM_PHASES, GTM_PHASE_LABELS, type GTMPhaseKey, type GTMTask } from '../../store/types';
import { clampToRange, GTM_DURATION_MAX, GTM_DURATION_MIN, GTM_START_DAY_MIN } from '../../store/numberBounds';

// Quelques lignes d'exemple réalistes, affichées dans le template CSV téléchargeable
// pour montrer à l'utilisateur à quoi doit ressembler une ligne valide.
const SAMPLE_ROWS: string[][] = [
  ['t1', 'Rédiger le brief produit', 'pre-launch', '-21', '5'],
  ['t2', 'Teaser sur les réseaux sociaux', 'pre-launch', '-7', '7'],
  ['t3', "Ouverture des inscriptions", 'launch', '0', '1'],
  ['t4', 'Campagne Ads de lancement', 'launch', '0', '3'],
  ['t5', 'Envoi email de suivi clients', 'post-launch', '7', '2'],
];

// Vérifie qu'une valeur texte lue dans le CSV correspond bien à une phase connue.
// Si le CSV contient une valeur bizarre (faute de frappe, colonne vide...), on retombe sur 'pre-launch'
// plutôt que de planter tout l'import.
function toPhase(value: string): GTMPhaseKey {
  return (GTM_PHASES as readonly string[]).includes(value) ? (value as GTMPhaseKey) : 'pre-launch';
}

export default function GTMCanvas() {
  // On lit les tâches partagées et les 3 actions du store dont on a besoin ici :
  // remplacer toute la liste (import CSV), ajouter/modifier une tâche (formulaire), en supprimer une.
  const gtmTasks = useLaunchStore((state) => state.gtmTasks);
  const setGtmTasks = useLaunchStore((state) => state.setGtmTasks);
  const upsertGtmTask = useLaunchStore((state) => state.upsertGtmTask);
  const removeGtmTask = useLaunchStore((state) => state.removeGtmTask);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // "state" local (une donnée propre à ce composant, qui redessine l'écran quand elle change)
  // pour le petit formulaire d'ajout manuel de tâche.
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<GTMPhaseKey>('pre-launch');
  const [startDay, setStartDay] = useState('0');
  const [durationDays, setDurationDays] = useState('1');

  // Regroupe les tâches par phase et les trie par jour de début, pour affichage en 3 colonnes.
  // useMemo évite de refaire ce tri à chaque rendu si les tâches n'ont pas changé.
  const tasksByPhase = useMemo(() => {
    const grouped: Record<GTMPhaseKey, GTMTask[]> = {
      'pre-launch': [],
      launch: [],
      'post-launch': [],
    };
    for (const task of gtmTasks) {
      grouped[task.phase].push(task);
    }
    for (const key of GTM_PHASES) {
      grouped[key].sort((a, b) => a.startDay - b.startDay);
    }
    return grouped;
  }, [gtmTasks]);

  // Envoie la tâche du formulaire dans le store. On génère un id unique avec crypto.randomUUID
  // (une fonction du navigateur qui fabrique un identifiant aléatoire quasi-impossible à dupliquer).
  const handleAddTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    upsertGtmTask({
      id: crypto.randomUUID(),
      title: title.trim(),
      phase,
      startDay: Number(startDay) || 0,
      durationDays: Number(durationDays) || 1,
    });

    // On vide le formulaire pour être prêt à saisir la tâche suivante.
    setTitle('');
    setStartDay('0');
    setDurationDays('1');
  };

  // À la sortie du champ (onBlur), on ramène une valeur hors limites à la limite la plus proche,
  // sans message d'erreur (voir clampToRange dans store/numberBounds.ts). Un champ vidé reste vide :
  // c'est handleAddTask qui retombe sur une valeur par défaut au moment d'ajouter, pas ce blur-là,
  // sinon impossible de vider le champ le temps de retaper autre chose.
  const handleStartDayBlur = () => {
    if (startDay.trim() === '') return;
    setStartDay(String(clampToRange(Number(startDay), GTM_START_DAY_MIN, Infinity)));
  };
  const handleDurationDaysBlur = () => {
    if (durationDays.trim() === '') return;
    setDurationDays(String(clampToRange(Number(durationDays), GTM_DURATION_MIN, GTM_DURATION_MAX)));
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">GTM Canvas</h2>
        <p className="text-sm text-muted mt-2">
          La timeline du lancement, organisée en 3 phases. Ajoute des tâches à la main ou importe-les
          en masse via un CSV.
        </p>
      </div>

      {/* Bouton d'import CSV branché directement sur le store : chaque ligne du fichier devient une GTMTask,
          et l'ensemble remplace la liste actuelle des tâches (setGtmTasks). */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <CsvImportButton<GTMTask>
          key={resetGeneration}
          label="Importer les tâches (CSV)"
          templateFilename="gtm-tasks-template.csv"
          templateHeaders={['id', 'title', 'phase', 'startDay', 'durationDays']}
          templateSampleRows={SAMPLE_ROWS}
          mapRow={(row) => ({
            id: row.id || crypto.randomUUID(),
            title: row.title,
            phase: toPhase(row.phase),
            startDay: Number(row.startDay) || 0,
            durationDays: Number(row.durationDays) || 1,
          })}
          onImport={(rows) => setGtmTasks(rows)}
        />
      </div>

      {/* Petit formulaire manuel pour ajouter une tâche sans passer par un CSV. */}
      <form
        onSubmit={handleAddTask}
        className="flex flex-wrap items-end gap-3 bg-surface border border-border rounded-lg p-6"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Titre de la tâche</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Envoi de la newsletter"
            className="rounded border border-border bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Phase</label>
          <select
            value={phase}
            onChange={(event) => setPhase(event.target.value as GTMPhaseKey)}
            className="rounded border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent"
          >
            {GTM_PHASES.map((key) => (
              <option key={key} value={key}>
                {GTM_PHASE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Jour de début</label>
          <input
            type="number"
            min={GTM_START_DAY_MIN}
            value={startDay}
            onChange={(event) => setStartDay(event.target.value)}
            onBlur={handleStartDayBlur}
            className="w-24 rounded border border-border bg-canvas px-2 py-1.5 text-sm font-mono tabular-nums text-ink focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Durée (jours)</label>
          <input
            type="number"
            min={GTM_DURATION_MIN}
            max={GTM_DURATION_MAX}
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            onBlur={handleDurationDaysBlur}
            className="w-24 rounded border border-border bg-canvas px-2 py-1.5 text-sm font-mono tabular-nums text-ink focus:border-accent"
          />
        </div>
        {/* Bouton d'action principale de ce bloc (la seule chose ambre ici, comme demandé
            par la charte : un seul accent, sur l'action la plus importante). */}
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
        >
          Ajouter la tâche
        </button>
        {/* Rappel discret des plages acceptées : utile puisque la correction se fait sans message
            d'erreur, juste en ramenant la valeur à la limite la plus proche à la sortie du champ.
            "w-full" pour prendre sa propre ligne dans ce formulaire qui wrap (flex-wrap). */}
        <p className="w-full text-xs text-muted">
          Jour de début : à partir de 0. Durée : entre 1 et 365 jours. Une valeur hors limites est
          ramenée automatiquement à la limite la plus proche.
        </p>
      </form>

      {/* TODO: brancher ici le vrai drag & drop avec @dnd-kit/core + @dnd-kit/sortable, pour pouvoir
          glisser une tâche d'une phase à l'autre ou changer son ordre directement à la souris.
          Pour l'instant l'affichage est en lecture/écriture via le formulaire et l'import CSV seulement. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {GTM_PHASES.map((phaseKey) => (
          <div key={phaseKey} className="bg-surface border border-border rounded-lg p-6">
            {/* Titre de phase : juste un repère visuel net, pas d'ambre ici (ce n'est ni une
                action ni LE chiffre clé du module). */}
            <h3 className="mb-3 font-display text-sm font-semibold text-ink">
              {GTM_PHASE_LABELS[phaseKey]}
            </h3>
            {tasksByPhase[phaseKey].length === 0 ? (
              <p className="text-xs text-muted">
                Ajoutez une tâche pour cette phase avec le formulaire ci-dessus.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tasksByPhase[phaseKey].map((task) => (
                  <li key={task.id} className="rounded border border-border bg-canvas p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-ink">{task.title}</span>
                      <button
                        type="button"
                        onClick={() => removeGtmTask(task.id)}
                        className="text-xs text-muted hover:text-alert transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                    {/* Donnée numérique (jour de début + durée) : chiffres en font-mono/tabular-nums
                        pour qu'ils s'alignent bien visuellement. */}
                    <div className="mt-1 font-mono tabular-nums text-muted text-xs">
                      Jour {task.startDay} · {task.durationDays} jour(s)
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
