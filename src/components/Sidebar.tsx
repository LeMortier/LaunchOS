// La barre de navigation à gauche de l'écran : elle liste les 6 modules et permet de cliquer
// pour passer de l'un à l'autre. Elle ne connaît pas le détail de chaque module, juste leur nom
// (grâce à la liste MODULES définie dans modules/registry.ts).
// Elle porte aussi les 2 boutons globaux "Charger le scénario de démo" et "Réinitialiser", puisque
// ce sont les seuls éléments visibles depuis tous les modules en même temps.
import { MODULES, type ModuleId } from '../modules/registry';
import { DEMO_SCENARIO, hasExistingLaunchData } from '../store/demoScenario';
import { useLaunchStore } from '../store/useLaunchStore';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
}

export function Sidebar({ activeModule, onSelectModule }: SidebarProps) {
  const loadLaunchState = useLaunchStore((state) => state.loadLaunchState);
  const resetLaunchState = useLaunchStore((state) => state.resetLaunchState);

  // Charge le scénario de démo écrit en dur dans store/demoScenario.ts. On lit l'état actuel avec
  // getState() (plutôt que de s'abonner avec useLaunchStore(...)) car on n'a besoin de le connaître
  // qu'au moment du clic, pas de re-rendre la Sidebar à chaque changement ailleurs dans l'app.
  const handleLoadDemo = () => {
    const current = useLaunchStore.getState();
    if (
      hasExistingLaunchData(current) &&
      !window.confirm(
        'Des données existent déjà dans les modules. Les remplacer par le scénario de démo ?',
      )
    ) {
      return;
    }
    loadLaunchState(DEMO_SCENARIO);
  };

  // Remet les 6 modules à zéro (et donc aussi le localStorage, mis à jour automatiquement par persist).
  const handleReset = () => {
    const current = useLaunchStore.getState();
    if (
      hasExistingLaunchData(current) &&
      !window.confirm('Réinitialiser tous les modules et effacer les données actuelles ?')
    ) {
      return;
    }
    resetLaunchState();
  };

  return (
    <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-1">
      <div className="px-2 pb-4">
        <h1 className="text-xl font-bold text-white">LaunchOS</h1>
        <p className="text-xs text-neutral-500">Cockpit go-to-market</p>
      </div>

      {/* Boutons globaux, visibles depuis n'importe quel module : pratique pour une démo ou une
          soutenance, pas besoin d'aller module par module pour tout remplir ou tout effacer. */}
      <div className="flex flex-col gap-2 px-2 pb-4">
        <button
          type="button"
          onClick={handleLoadDemo}
          className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          Charger le scénario de démo
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="w-full rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
        >
          Réinitialiser
        </button>
      </div>

      {/* On affiche un bouton par module ; celui qui est actif est mis en évidence visuellement. */}
      {MODULES.map((module) => {
        const isActive = module.id === activeModule;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => onSelectModule(module.id)}
            className={`text-left rounded-lg px-3 py-2 transition-colors ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'text-neutral-300 hover:bg-neutral-800 border border-transparent'
            }`}
          >
            <div className="text-sm font-medium">{module.label}</div>
            <div className="text-xs text-neutral-500">{module.description}</div>
          </button>
        );
      })}
    </aside>
  );
}
