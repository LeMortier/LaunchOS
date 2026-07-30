// La barre de navigation à gauche de l'écran : elle liste les 6 modules et permet de cliquer
// pour passer de l'un à l'autre. Elle ne connaît pas le détail de chaque module, juste leur nom
// (grâce à la liste MODULES définie dans modules/registry.ts).
import { MODULES, type ModuleId } from '../modules/registry';

interface SidebarProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
}

export function Sidebar({ activeModule, onSelectModule }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-1">
      <div className="px-2 pb-4">
        <h1 className="text-xl font-bold text-white">LaunchOS</h1>
        <p className="text-xs text-neutral-500">Cockpit go-to-market</p>
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
