// Le composant racine de l'application : il affiche la barre de navigation (Sidebar) à gauche
// et le module actuellement sélectionné à droite. C'est lui qui décide quel module est actif
// et qui bascule de l'un à l'autre quand on clique dans la Sidebar.
import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { CockpitBar } from './components/CockpitBar';
import { MODULE_IDS, type ModuleId } from './modules/registry';
import GTMCanvas from './modules/GTMCanvas/GTMCanvas';
import BudgetAllocator from './modules/BudgetAllocator/BudgetAllocator';
import KPITracker from './modules/KPITracker/KPITracker';
import RiskScorer from './modules/RiskScorer/RiskScorer';
import SankeyFunnel from './modules/SankeyFunnel/SankeyFunnel';
import PDFExport from './modules/PDFExport/PDFExport';

// Table de correspondance entre l'identifiant d'un module (string, ex: 'gtm-canvas') et le composant
// React à afficher pour ce module. Ça évite d'écrire un gros if/else : on va juste chercher le bon
// composant dans cet objet selon le module actif.
const MODULE_COMPONENTS: Record<ModuleId, React.ComponentType> = {
  'gtm-canvas': GTMCanvas,
  'budget-allocator': BudgetAllocator,
  'kpi-tracker': KPITracker,
  'risk-scorer': RiskScorer,
  'sankey-funnel': SankeyFunnel,
  'pdf-export': PDFExport,
};

function App() {
  // L'état (state, une donnée qui déclenche un ré-affichage quand elle change) qui garde en mémoire
  // quel module est actuellement affiché à droite. Par défaut on ouvre le GTM Canvas.
  const [activeModule, setActiveModule] = useState<ModuleId>(MODULE_IDS[0]);

  // On récupère le composant à afficher en fonction du module actif, grâce à la table définie plus haut.
  const ActiveModuleComponent = MODULE_COMPONENTS[activeModule];

  return (
    <div className="flex h-screen bg-canvas text-ink">
      <Sidebar activeModule={activeModule} onSelectModule={setActiveModule} />
      {/* La zone de contenu à droite : elle scrolle toute seule si le module affiché est plus grand
          que l'écran, sans faire bouger la Sidebar. La CockpitBar reste collée en haut de cette zone
          (position sticky) pendant qu'on scrolle : les 4 constantes vitales du lancement restent
          toujours sous les yeux, peu importe le module ouvert. */}
      <main className="flex-1 overflow-y-auto p-6">
        <CockpitBar />
        <ActiveModuleComponent />
      </main>
    </div>
  );
}

export default App;
