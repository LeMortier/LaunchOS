// Module "Risk Scorer" : un questionnaire de 10 critères pour évaluer le risque global d'un lancement produit.
// Chaque critère a une note (score, de 0 à 10) et un poids (weight, son importance dans le calcul final).
// Le score global affiché est la moyenne pondérée des 10 critères, animée pour bien voir quand ça bouge.
import { useEffect, useMemo } from 'react';
import { useLaunchStore } from '../../store/useLaunchStore';
import type { RiskCriterion } from '../../store/types';
import { CsvImportButton } from '../../components/CsvImportButton';
import { formatNumber } from '../../store/formatters';

// Les 10 critères de départ, avec une note neutre (5/10) et un poids égal pour chacun (0.1 x 10 = 1).
// On les met ici plutôt que dans le store partagé (types.ts) car ce sont juste des valeurs de démarrage
// propres à ce module, pas une donnée que les autres modules ont besoin de connaître.
const DEFAULT_CRITERIA: RiskCriterion[] = [
  { id: 'concurrence', label: 'Concurrence', score: 5, weight: 0.1 },
  { id: 'time-to-market', label: 'Time-to-market', score: 5, weight: 0.1 },
  { id: 'budget-marketing', label: "Risque de sous-financement de l'acquisition", score: 5, weight: 0.1 },
  { id: 'adequation-produit-marche', label: 'Risque de rejet par le marché', score: 5, weight: 0.1 },
  { id: 'dependance-fournisseurs', label: "Risque de défaillance de la chaîne d'approvisionnement", score: 5, weight: 0.1 },
  { id: 'complexite-technique', label: 'Complexité technique', score: 5, weight: 0.1 },
  { id: 'risque-reglementaire', label: 'Risque réglementaire / légal', score: 5, weight: 0.1 },
  { id: 'solidite-equipe', label: 'Risque de déficit de compétences', score: 5, weight: 0.1 },
  { id: 'tresorerie', label: "Risque d'épuisement de la trésorerie", score: 5, weight: 0.1 },
  { id: 'reputation-marque', label: "Risque d'atteinte à l'image de marque", score: 5, weight: 0.1 },
];

// Les colonnes attendues dans le CSV importé/exporté pour ce module.
const CSV_HEADERS = ['id', 'label', 'score', 'weight'];

// Quelques lignes d'exemple pour montrer le format attendu dans le template téléchargeable.
const CSV_SAMPLE_ROWS = [
  ['concurrence', 'Concurrence', '7', '0.15'],
  ['time-to-market', 'Time-to-market', '4', '0.1'],
  ['budget-marketing', "Risque de sous-financement de l'acquisition", '3', '0.1'],
  ['adequation-produit-marche', 'Risque de rejet par le marché', '6', '0.2'],
];

export default function RiskScorer() {
  // On lit directement dans le store partagé (Zustand, la librairie qui garde les données communes
  // aux 6 modules) : ça garantit que ce module affiche toujours les données à jour, et que les
  // modifications faites ici sont immédiatement visibles ailleurs (ex: dans le PDF Export).
  const riskCriteria = useLaunchStore((state) => state.riskCriteria);
  const setRiskCriteria = useLaunchStore((state) => state.setRiskCriteria);
  const updateRiskCriterionScore = useLaunchStore((state) => state.updateRiskCriterionScore);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // Au tout premier affichage, si personne n'a encore rempli le questionnaire (store vide),
  // on initialise avec nos 10 critères par défaut, notés à 5/10 chacun (position neutre).
  // Une fois que le store contient des critères, la condition devient fausse et ça ne re-déclenche plus rien.
  useEffect(() => {
    if (riskCriteria.length === 0) {
      setRiskCriteria(DEFAULT_CRITERIA);
    }
  }, [riskCriteria.length, setRiskCriteria]);

  // Le score global = somme de (note x poids) pour chaque critère. Comme les poids sont sur une
  // échelle de 0 à 1 et les notes sur une échelle de 0 à 10, le résultat tombe directement sur 0-10.
  // "useMemo" (mémorisation) évite de refaire le calcul à chaque rendu si les critères n'ont pas bougé.
  const globalScore = useMemo(
    () => riskCriteria.reduce((total, criterion) => total + criterion.score * criterion.weight, 0),
    [riskCriteria],
  );

  // Couleur du score selon son niveau, avec le même barème que la barre de pilotage (CockpitBar) en
  // haut de l'app, pour que le risque se lise pareil partout dans LaunchOS :
  // en dessous de 4 rien à signaler (couleur neutre), entre 4 et 7 ça mérite attention (ambre),
  // à partir de 7 c'est un risque élevé (rose/rouge d'alerte). La barre en dessous reprend les mêmes 3 niveaux.
  const scoreColorClass = globalScore >= 7 ? 'text-alert' : globalScore >= 4 ? 'text-accent' : 'text-ink';
  const barColorClass = globalScore >= 7 ? 'bg-alert' : globalScore >= 4 ? 'bg-accent' : 'bg-muted';

  // Le total des poids doit valoir 1 pour que le score global reste vraiment sur une échelle de 0 à
  // 10 (voir le calcul de globalScore plus haut : somme de score x weight). On le recalcule à chaque
  // rendu à partir de ce qu'il y a VRAIMENT dans le store, pas juste au moment d'un import CSV :
  // l'avertissement en dessous reste donc affiché tant que ces données-là sont affichées, que le
  // déséquilibre vienne d'un CSV importé, du scénario de démo ou d'autre chose.
  const totalWeight = useMemo(
    () => riskCriteria.reduce((total, criterion) => total + criterion.weight, 0),
    [riskCriteria],
  );
  const hasWeightImbalance = riskCriteria.length > 0 && Math.abs(totalWeight - 1) > 0.001;

  // Transforme une ligne du CSV en critère de risque typé, en vérifiant que tout est exploitable :
  // colonnes remplies, score entre 0 et 10, poids strictement positif. Si quoi que ce soit cloche,
  // on lève une erreur avec un message clair : en mode strict (CsvImportButton juste en dessous),
  // ça annule tout l'import plutôt que de laisser passer une ligne cassée qui fausserait le score
  // sans que personne ne le remarque.
  const mapRow = (row: Record<string, string>): RiskCriterion => {
    const id = row.id?.trim();
    if (!id) throw new Error('la colonne "id" est vide : chaque critère doit avoir un identifiant.');

    const label = row.label?.trim();
    if (!label) throw new Error('la colonne "label" est vide : ajoutez un intitulé pour ce critère.');

    const scoreText = row.score?.trim();
    const score = Number(scoreText);
    if (!scoreText || Number.isNaN(score) || score < 0 || score > 10) {
      throw new Error(`le score "${row.score ?? ''}" doit être un nombre entre 0 et 10.`);
    }

    const weightText = row.weight?.trim();
    const weight = Number(weightText);
    if (!weightText || Number.isNaN(weight) || weight <= 0) {
      throw new Error(`le poids "${row.weight ?? ''}" doit être un nombre strictement supérieur à 0.`);
    }

    return { id, label, score, weight };
  };

  // Vérifie le fichier dans son ensemble, une fois que chaque ligne a déjà été validée
  // individuellement : il doit y avoir au moins une ligne, et chaque identifiant doit être unique.
  // Le total des poids n'est volontairement PAS vérifié ici : un total différent de 1 n'empêche pas
  // l'import (voir la consigne), c'est juste signalé ensuite via hasWeightImbalance ci-dessus.
  const validateBatch = (
    rows: { line: number; data: RiskCriterion }[],
  ): { ok: true } | { ok: false; error: string } => {
    if (rows.length === 0) {
      return { ok: false, error: 'Le fichier ne contient aucune ligne de données à importer.' };
    }
    const firstLineById = new Map<string, number>();
    for (const { line, data } of rows) {
      const firstLine = firstLineById.get(data.id);
      if (firstLine !== undefined) {
        return {
          ok: false,
          error: `L'identifiant "${data.id}" est utilisé aux lignes ${firstLine} et ${line} : donnez un identifiant unique à chaque critère.`,
        };
      }
      firstLineById.set(data.id, line);
    }
    return { ok: true };
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Risk Scorer</h2>
        <p className="text-sm text-muted mt-2">
          Notez chaque critère de 0 (aucun risque) à 10 (risque maximal) pour obtenir un score de
          risque global pondéré.
        </p>
      </div>

      {/* Import CSV : remplace tout le questionnaire d'un coup avec un fichier externe (colonnes
          id, label, score, weight). Le composant est partagé par tous les modules de LaunchOS. */}
      <CsvImportButton<RiskCriterion>
        key={resetGeneration}
        label="Importer le questionnaire (CSV)"
        templateFilename="risk-scorer-template.csv"
        templateHeaders={CSV_HEADERS}
        templateSampleRows={CSV_SAMPLE_ROWS}
        mapRow={mapRow}
        onImport={(rows) => setRiskCriteria(rows)}
        strict
        validateBatch={validateBatch}
      />

      {/* Carte du score global : LE chiffre clé de ce module, donc c'est le seul endroit du fichier
          où l'ambre (ou l'alerte) peut apparaître pour de vrai. La barre en dessous s'anime en
          douceur dès qu'une note change. */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Score de risque global</span>
          <span className={`font-mono text-3xl font-semibold tabular-nums transition-all duration-500 ${scoreColorClass}`}>
            {formatNumber(globalScore)} <span className="text-base text-muted">/ 10</span>
          </span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barColorClass}`}
            style={{ width: `${Math.min(100, Math.max(0, (globalScore / 10) * 100))}%` }}
          />
        </div>
        {/* Avertissement persistant : recalculé à chaque rendu depuis riskCriteria (pas juste
            au moment d'un import), donc il reste affiché tant que ces données sont là, même après
            avoir changé de module et être revenu ici. */}
        {hasWeightImbalance && (
          <p className="mt-3 rounded border border-accent bg-accent/10 px-3 py-2 text-xs text-ink">
            Les poids des critères totalisent {formatNumber(totalWeight)} au lieu de 1 : le score
            ci-dessus n'est plus ramené sur une échelle de 10.
          </p>
        )}
      </div>

      {/* La liste des 10 critères, chacun avec son slider relié directement à l'action du store
          updateRiskCriterionScore : dès qu'on bouge le curseur, le store est mis à jour et le
          score global recalculé automatiquement au-dessus. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {riskCriteria.map((criterion) => (
          <div key={criterion.id} className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{criterion.label}</span>
              <span className="font-mono text-sm text-muted tabular-nums">
                poids {Math.round(criterion.weight * 100)}%
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={criterion.score}
                onChange={(event) =>
                  updateRiskCriterionScore(criterion.id, Number(event.target.value))
                }
                className="w-full accent-accent"
              />
              <span className="w-8 text-right font-mono text-sm font-semibold tabular-nums text-ink transition-all duration-300">
                {criterion.score}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* TODO : remplacer la barre de progression simple par une vraie jauge animée (par ex. un
          demi-cercle façon compteur de vitesse) une fois que le design final du module sera arrêté. */}
    </div>
  );
}
