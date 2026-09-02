// Module "GTM Canvas" : la timeline des tâches de lancement, groupées par phase
// (pré-lancement, lancement, post-lancement). C'est ici qu'on prépare le plan d'action du go-to-market
// (GTM = "go-to-market", la stratégie pour lancer un produit sur le marché).
import { useMemo, useState } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import {
  GTM_PHASES,
  GTM_PHASE_COLORS,
  GTM_PHASE_LABELS,
  type GTMPhaseKey,
  type GTMTask,
} from '../../store/types';
import {
  clampToRange,
  GTM_DURATION_MAX,
  GTM_DURATION_MIN,
  GTM_START_DAY_MIN,
  parseCsvNumber,
} from '../../store/numberBounds';

// Quelques lignes d'exemple réalistes, affichées dans le template CSV téléchargeable pour montrer à
// l'utilisateur à quoi doit ressembler une ligne valide. Le jour 0 est le tout début du projet (pas
// la date de lancement) : t1 démarre donc à 0, t2 deux semaines plus tard.
const SAMPLE_ROWS: string[][] = [
  ['t1', 'Rédiger le brief produit', 'pre-launch', '0', '5'],
  ['t2', 'Teaser sur les réseaux sociaux', 'pre-launch', '14', '7'],
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

// mapRow du CSV : le jour de début et la durée doivent respecter les mêmes bornes que le formulaire
// manuel plus bas (voir handleStartDayBlur/handleDurationDaysBlur). En mode strict (voir
// CsvImportButton ci-dessous), la moindre ligne invalide annule tout l'import.
function mapGtmRow(row: Record<string, string>): GTMTask {
  return {
    id: row.id?.trim() || crypto.randomUUID(),
    title: row.title ?? '',
    phase: toPhase(row.phase ?? ''),
    startDay: parseCsvNumber(row.startDay, 'Le jour de début', GTM_START_DAY_MIN, Infinity),
    durationDays: parseCsvNumber(row.durationDays, 'La durée', GTM_DURATION_MIN, GTM_DURATION_MAX),
  };
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

  // Formulaire de modification : mêmes 4 champs que le formulaire d'ajout, mais pour une tâche déjà
  // existante. editingTaskId dit quelle tâche est en cours de modification (une seule à la fois, et
  // null quand aucune) ; c'est ce qui bascule cette tâche-là de l'affichage normal vers le formulaire
  // dans la liste plus bas.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPhase, setEditPhase] = useState<GTMPhaseKey>('pre-launch');
  const [editStartDay, setEditStartDay] = useState('0');
  const [editDurationDays, setEditDurationDays] = useState('1');

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

  // Le petit résumé affiché en haut de chaque colonne : combien de tâches, combien de jours de
  // travail au total, et quelle part ça pèse par rapport aux 3 phases réunies.
  // Attention à ne pas mal lire cette part : elle ne dit PAS combien de temps dure la phase dans le
  // calendrier (les tâches se chevauchent, deux tâches de 5 jours en parallèle ne font pas 10 jours
  // de calendrier), elle dit quelle portion du travail prévu tombe dans cette phase.
  // On repart de tasksByPhase, déjà groupé juste au-dessus, plutôt que de reparcourir gtmTasks une
  // deuxième fois. Et comme tasksByPhase se recalcule dès que les tâches du store changent, ce résumé
  // suit tout seul le moindre ajout, la moindre modification et la moindre suppression.
  const phaseSummary = useMemo(() => {
    const vide = () => ({ count: 0, days: 0, share: 0 });
    const summary: Record<GTMPhaseKey, { count: number; days: number; share: number }> = {
      'pre-launch': vide(),
      launch: vide(),
      'post-launch': vide(),
    };
    for (const key of GTM_PHASES) {
      summary[key].count = tasksByPhase[key].length;
      summary[key].days = tasksByPhase[key].reduce((total, task) => total + task.durationDays, 0);
    }
    // Le total sert de dénominateur à la barre. Sans tâche il vaut 0 : le garde-fou évite une
    // division par zéro, qui donnerait une largeur "NaN%" et une barre qui ne s'affiche pas.
    // On arrondit au dixième de pour cent, ça suffit largement pour une barre de quelques pixels et
    // ça évite d'écrire un nombre à quinze décimales dans le style de l'élément.
    const totalDays = GTM_PHASES.reduce((total, key) => total + summary[key].days, 0);
    for (const key of GTM_PHASES) {
      summary[key].share = totalDays > 0 ? Math.round((summary[key].days / totalDays) * 1000) / 10 : 0;
    }
    return summary;
  }, [tasksByPhase]);

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

  // Ouvre le formulaire de modification sur une tâche donnée, en pré-remplissant ses champs.
  // Rappeler cette fonction pendant qu'une autre tâche est déjà en cours de modification abandonne
  // silencieusement cette modification-là (pas de confirmation, comme demandé) et bascule sur la
  // nouvelle.
  const startEditingTask = (task: GTMTask) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditPhase(task.phase);
    setEditStartDay(String(task.startDay));
    setEditDurationDays(String(task.durationDays));
  };

  // Referme le formulaire de modification sans rien enregistrer.
  const cancelEditingTask = () => setEditingTaskId(null);

  // Enregistre la modification : upsertGtmTask remplace la tâche existante puisqu'on lui redonne le
  // même id (voir sa définition dans useLaunchStore.ts), donc pas besoin d'une action séparée.
  const handleSaveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTaskId || !editTitle.trim()) return;

    upsertGtmTask({
      id: editingTaskId,
      title: editTitle.trim(),
      phase: editPhase,
      startDay: Number(editStartDay) || 0,
      durationDays: Number(editDurationDays) || 1,
    });

    setEditingTaskId(null);
  };

  // Mêmes règles de correction que handleStartDayBlur/handleDurationDaysBlur ci-dessus, appliquées
  // cette fois aux champs du formulaire de modification.
  const handleEditStartDayBlur = () => {
    if (editStartDay.trim() === '') return;
    setEditStartDay(String(clampToRange(Number(editStartDay), GTM_START_DAY_MIN, Infinity)));
  };
  const handleEditDurationDaysBlur = () => {
    if (editDurationDays.trim() === '') return;
    setEditDurationDays(String(clampToRange(Number(editDurationDays), GTM_DURATION_MIN, GTM_DURATION_MAX)));
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
          mapRow={mapGtmRow}
          onImport={(rows) => setGtmTasks(rows)}
          strict
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
            {/* Titre de phase, précédé du point de couleur de cette phase (la même couleur que la
                bordure gauche de ses cartes, plus bas). Pas d'ambre ici : ce n'est ni une action ni
                LE chiffre clé du module, la couleur sert juste à repérer la phase d'un coup d'oeil. */}
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: GTM_PHASE_COLORS[phaseKey] }}
              />
              <h3 className="font-display text-sm font-semibold text-ink">
                {GTM_PHASE_LABELS[phaseKey]}
              </h3>
            </div>

            {/* Résumé de la colonne : le compte et les jours en toutes lettres, puis la même chose en
                barre juste en dessous. La barre n'ajoute aucune information, elle rend juste comparable
                d'un coup d'oeil ce que les 3 chiffres disent déjà. Chiffres en mono/tabular-nums comme
                partout ailleurs dans l'app. */}
            <div className="font-mono tabular-nums text-xs text-muted">
              {phaseSummary[phaseKey].count} tâche(s) · {phaseSummary[phaseKey].days} j
            </div>
            {/* La piste reprend bg-border, une couleur déjà de la palette. Seules la largeur (calculée)
                et la couleur de phase passent par un style en ligne : une classe Tailwind ne peut
                porter ni l'une ni l'autre. Même façon de faire que les points de canal du Sankey. */}
            <div className="mt-1 mb-3 h-[3px] overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${phaseSummary[phaseKey].share}%`,
                  backgroundColor: GTM_PHASE_COLORS[phaseKey],
                }}
              />
            </div>
            {tasksByPhase[phaseKey].length === 0 ? (
              <p className="text-xs text-muted">
                Ajoutez une tâche pour cette phase avec le formulaire ci-dessus.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tasksByPhase[phaseKey].map((task) =>
                  editingTaskId === task.id ? (
                    // Formulaire de modification : remplace l'affichage normal de CETTE tâche
                    // uniquement, directement dans la liste (pas de popup). Mêmes bornes et mêmes
                    // messages de correction que le formulaire d'ajout au-dessus.
                    <li key={task.id} className="rounded border border-accent bg-canvas p-2 text-sm">
                      <form onSubmit={handleSaveEdit} className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          placeholder="Titre de la tâche"
                          className="rounded border border-border bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted focus:border-accent"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={editPhase}
                            onChange={(event) => setEditPhase(event.target.value as GTMPhaseKey)}
                            className="rounded border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-accent"
                          >
                            {GTM_PHASES.map((key) => (
                              <option key={key} value={key}>
                                {GTM_PHASE_LABELS[key]}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={GTM_START_DAY_MIN}
                            value={editStartDay}
                            onChange={(event) => setEditStartDay(event.target.value)}
                            onBlur={handleEditStartDayBlur}
                            aria-label="Jour de début"
                            className="w-16 rounded border border-border bg-surface px-2 py-1 text-xs font-mono tabular-nums text-ink focus:border-accent"
                          />
                          <input
                            type="number"
                            min={GTM_DURATION_MIN}
                            max={GTM_DURATION_MAX}
                            value={editDurationDays}
                            onChange={(event) => setEditDurationDays(event.target.value)}
                            onBlur={handleEditDurationDaysBlur}
                            aria-label="Durée (jours)"
                            className="w-16 rounded border border-border bg-surface px-2 py-1 text-xs font-mono tabular-nums text-ink focus:border-accent"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="submit"
                            className="rounded bg-accent px-2 py-1 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingTask}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    // La bordure gauche de 3px reprend la couleur de la phase, comme le point à
                    // côté du titre de la colonne : on sait à quelle phase appartient une carte sans
                    // avoir à remonter en haut de la colonne. La carte en cours de modification, elle,
                    // garde sa bordure ambre : l'ambre y signale un état en cours, mélanger les deux
                    // signaux sur la même carte brouillerait les deux.
                    <li
                      key={task.id}
                      className="rounded border border-l-[3px] border-border bg-canvas p-2 text-sm"
                      style={{ borderLeftColor: GTM_PHASE_COLORS[task.phase] }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-ink">{task.title}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditingTask(task)}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGtmTask(task.id)}
                            className="text-xs text-muted hover:text-alert transition-colors"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                      {/* Donnée numérique (jour de début + durée) : chiffres en font-mono/tabular-nums
                          pour qu'ils s'alignent bien visuellement. */}
                      <div className="mt-1 font-mono tabular-nums text-muted text-xs">
                        Jour {task.startDay} · {task.durationDays} jour(s)
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
