// Les deux boutons "Exporter le projet" et "Ouvrir un projet", affichés dans la barre latérale sous
// "Charger le scénario de démo" et "Réinitialiser". Ils travaillent sur le projet ENTIER (les 6
// modules d'un coup), contrairement aux imports CSV qui ne remplissent qu'un module chacun.
// Ce composant ne fait que l'interface : lire le fichier et le vérifier, c'est le travail de
// store/projectFile.ts.
import { useRef, useState } from 'react';
import { exportProjectFile, parseProjectFile } from '../store/projectFile';
import { hasExistingLaunchData } from '../store/demoScenario';
import { useLaunchStore } from '../store/useLaunchStore';

// Le message affiché sous les boutons après une action. On retient la "génération" du store au moment
// où le message a été écrit : voir plus bas pourquoi.
interface Feedback {
  text: string;
  isError: boolean;
  generation: number;
}

export function ProjectFileButtons() {
  const loadLaunchState = useLaunchStore((state) => state.loadLaunchState);
  // resetGeneration est un compteur du store, incrémenté à chaque fois que TOUT le lancement est
  // écrasé d'un coup (scénario de démo, réinitialisation, ouverture d'un projet). Voir sa définition
  // dans useLaunchStore.ts.
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // Référence vers l'input fichier caché, pour pouvoir "cliquer" dessus depuis notre propre bouton stylé.
  const inputRef = useRef<HTMLInputElement>(null);
  // "state" = une donnée qui, quand elle change, fait automatiquement redessiner le composant à l'écran.
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Les autres boutons de la barre latérale (démo, réinitialisation) écrasent les données sans rien
  // savoir de notre message. On masque donc le nôtre dès que le compteur du store a bougé depuis qu'on
  // l'a écrit : sinon on lirait "Projet ouvert : ..." à côté de données qui n'ont plus rien à voir.
  // Les CsvImportButton des modules règlent le même problème autrement, avec une "key" React, ce qui
  // n'est pas possible ici : c'est nous qui déclenchons l'écrasement, on serait effacés dans la foulée.
  const visibleFeedback = feedback?.generation === resetGeneration ? feedback : null;

  // Exporte l'état complet des 6 modules dans un fichier JSON téléchargé par le navigateur. On lit
  // l'état avec getState() (plutôt que de s'abonner) car on n'en a besoin qu'au moment du clic.
  const handleExport = () => {
    const state = useLaunchStore.getState();
    const filename = exportProjectFile({
      channelBudgets: state.channelBudgets,
      gtmTasks: state.gtmTasks,
      kpiEntries: state.kpiEntries,
      riskCriteria: state.riskCriteria,
      funnelConfigs: state.funnelConfigs,
      reportMeta: state.reportMeta,
    });
    setFeedback({ text: `Fichier exporté : ${filename}`, isError: false, generation: resetGeneration });
  };

  // Appelée quand l'utilisateur a choisi un fichier dans la fenêtre de sélection.
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de rouvrir le même fichier deux fois de suite si besoin
    if (!file) return;

    try {
      // On vérifie TOUT le fichier avant de toucher au store. Si parseProjectFile lève une erreur,
      // on n'a rien reçu, donc il n'y a rien à annuler : l'état courant n'a pas bougé.
      const state = parseProjectFile(await file.text());

      // La confirmation arrive après la vérification, et pas avant d'ouvrir le sélecteur : inutile de
      // faire confirmer un écrasement qui n'aura pas lieu parce que le fichier est refusé.
      if (
        hasExistingLaunchData(useLaunchStore.getState()) &&
        !window.confirm('Des données existent déjà dans les modules. Les remplacer par ce projet ?')
      ) {
        return;
      }

      // Le même chemin que le bouton du scénario de démo : un seul appel qui remplace les 6 modules.
      loadLaunchState(state);
      // On relit le compteur APRÈS le chargement, puisque loadLaunchState vient de l'incrémenter.
      const generation = useLaunchStore.getState().resetGeneration;
      // Afficher le titre du rapport du fichier, plutôt qu'un simple "Projet ouvert", permet de voir
      // tout de suite qu'on a bien ouvert le bon fichier.
      const title = state.reportMeta.title.trim();
      setFeedback({
        text: title ? `Projet ouvert : ${title}` : "Projet ouvert (le rapport n'a pas de titre).",
        isError: false,
        generation,
      });
    } catch (error) {
      // Les erreurs de projectFile.ts ont déjà un message précis (quelle section, quel élément, quelle
      // borne) : on l'affiche tel quel plutôt qu'un message générique.
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : "Échec de l'ouverture du projet. Vérifiez le format du fichier.",
        isError: true,
        generation: useLaunchStore.getState().resetGeneration,
      });
    }
  };

  return (
    <>
      {/* Mêmes classes que le bouton "Réinitialiser" juste au-dessus : l'ambre reste réservé à
          "Charger le scénario de démo", la seule action mise en avant de ce bloc. */}
      <button
        type="button"
        onClick={handleExport}
        className="w-full rounded border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-muted hover:text-ink"
      >
        Exporter le projet
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-muted hover:text-ink"
      >
        Ouvrir un projet
      </button>
      {/* L'input fichier réel est caché : on préfère afficher nos propres boutons stylés au-dessus. */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Même code couleur que les imports CSV : ambre pour une confirmation, alerte quand ça a raté.
          "break-words" évite qu'un nom de fichier ou un identifiant un peu long déborde de la barre. */}
      {visibleFeedback && (
        <p className={`break-words text-xs ${visibleFeedback.isError ? 'text-alert' : 'text-accent'}`}>
          {visibleFeedback.text}
        </p>
      )}
    </>
  );
}
