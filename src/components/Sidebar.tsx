// La barre de navigation à gauche de l'écran : elle liste les 6 modules et permet de cliquer
// pour passer de l'un à l'autre. Elle ne connaît pas le détail de chaque module, juste leur nom
// (grâce à la liste MODULES définie dans modules/registry.ts).
// Elle porte aussi les 4 boutons globaux (scénario de démo, réinitialisation, export et ouverture
// d'un projet), puisque ce sont les seuls éléments visibles depuis tous les modules en même temps.
import { MODULES, type ModuleId } from '../modules/registry';
import { ProjectFileButtons } from './ProjectFileButtons';
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
    <aside className="flex w-64 shrink-0 flex-col gap-1 border-r border-border bg-canvas p-4">
      <div className="px-2 pb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">LaunchOS</h1>
        <p className="mt-1 text-xs text-muted">Cockpit go-to-market</p>
      </div>

      {/* Boutons globaux, visibles depuis n'importe quel module : pratique pour une démo ou une
          soutenance, pas besoin d'aller module par module pour tout remplir ou tout effacer.
          "Charger le scénario de démo" est LA vraie action ici, donc en ambre (accent). Les trois
          autres restent neutres, ce sont des actions de service. */}
      <div className="flex flex-col gap-2 px-2 pb-6">
        <button
          type="button"
          onClick={handleLoadDemo}
          className="w-full rounded bg-accent px-3 py-2 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
        >
          Charger le scénario de démo
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="w-full rounded border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-muted hover:text-ink"
        >
          Réinitialiser
        </button>
        {/* Sauvegarder le projet dans un fichier et le rouvrir plus tard, ou sur une autre machine.
            Le composant porte aussi son propre message de confirmation ou d'erreur. */}
        <ProjectFileButtons />
      </div>

      {/* On affiche un bouton par module. Le module actif se distingue par une barre verticale ambre
          à gauche (border-l), pas par un fond coloré : l'ambre reste réservé aux vraies actions et
          valeurs clés, ici il sert juste de repère de position, discret. */}
      {MODULES.map((module) => {
        const isActive = module.id === activeModule;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => onSelectModule(module.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded border-l-2 px-3 py-2 text-left transition-colors ${
              isActive
                ? 'border-accent bg-surface text-ink'
                : 'border-transparent text-muted hover:bg-surface/60 hover:text-ink'
            }`}
          >
            <div className="text-sm font-medium">{module.label}</div>
            <div className="text-xs text-muted">{module.description}</div>
          </button>
        );
      })}
    </aside>
  );
}
