// La liste "officielle" des 6 modules de LaunchOS : leur identifiant, leur nom affiché et leur description.
// Ça sert à construire la barre de navigation (Sidebar) et à savoir quel composant afficher selon le module choisi.
// Avoir cette liste à un seul endroit évite d'avoir à répéter les mêmes noms de modules partout dans le code.
export const MODULE_IDS = [
  'gtm-canvas',
  'budget-allocator',
  'kpi-tracker',
  'risk-scorer',
  'sankey-funnel',
  'pdf-export',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  description: string;
}

export const MODULES: ModuleMeta[] = [
  { id: 'gtm-canvas', label: 'GTM Canvas', description: 'Timeline drag & drop des phases de lancement' },
  { id: 'budget-allocator', label: 'Budget Allocator', description: 'Répartition du budget par canal' },
  { id: 'kpi-tracker', label: 'KPI Tracker', description: 'Courbes de progression hebdo vs objectifs' },
  { id: 'risk-scorer', label: 'Risk Scorer', description: 'Score de risque sur 10 critères' },
  { id: 'sankey-funnel', label: 'Sankey Funnel & ROAS', description: "Simulateur d'acquisition" },
  { id: 'pdf-export', label: 'PDF Export', description: 'Rapport consolidé de tous les modules' },
];
