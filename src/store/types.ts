// Ce fichier regroupe toutes les "formes" de données utilisées dans LaunchOS.
// On appelle ça des "types" : ça décrit à quoi ressemble chaque donnée (quels champs, quel genre de valeur)
// pour que tous les modules parlent le même langage entre eux.

// La liste des canaux marketing qu'on retrouve dans le Budget Allocator ET dans le Sankey Funnel.
// "as const" fige la liste pour que TypeScript sache exactement quelles valeurs sont possibles.
export const CHANNELS = ['seo', 'ads', 'influence', 'pr'] as const;
export type Channel = (typeof CHANNELS)[number];

// Les jolis noms affichés à l'écran pour chaque canal (au lieu du code technique "seo", "ads"...).
export const CHANNEL_LABELS: Record<Channel, string> = {
  seo: 'SEO',
  ads: 'Ads',
  influence: 'Influence',
  pr: 'PR',
};

// Une couleur par canal, utilisée PARTOUT où un canal est affiché visuellement (le donut chart du
// Budget Allocator, les flux du diagramme Sankey...). En la gardant à un seul endroit, on est sûr que
// "Ads" a toujours la même couleur peu importe le graphique dans lequel on le regarde.
export const CHANNEL_COLORS: Record<Channel, string> = {
  seo: '#5B8DEF', // bleu
  ads: '#E5677E', // rose
  influence: '#B48AF0', // violet
  pr: '#F2A65A', // ambre
};

// Les 3 grandes phases du GTM Canvas (le calendrier de lancement).
export const GTM_PHASES = ['pre-launch', 'launch', 'post-launch'] as const;
export type GTMPhaseKey = (typeof GTM_PHASES)[number];

export const GTM_PHASE_LABELS: Record<GTMPhaseKey, string> = {
  'pre-launch': 'Pré-lancement',
  launch: 'Lancement',
  'post-launch': 'Post-lancement',
};

// Une ligne du Budget Allocator : combien d'argent est mis sur tel canal.
// C'est aussi le point de départ du Sankey Funnel : le budget par canal alimente le simulateur d'acquisition.
export interface ChannelBudget {
  channel: Channel;
  amount: number;
}

// Une tâche affichée comme une barre sur la timeline du GTM Canvas.
export interface GTMTask {
  id: string;
  title: string;
  phase: GTMPhaseKey;
  startDay: number; // décalage en jours par rapport au jour du lancement (jour 0)
  durationDays: number;
}

// Une mesure hebdomadaire dans le KPI Tracker : ce qu'on visait vs ce qu'on a vraiment obtenu.
export interface KPIWeeklyEntry {
  id: string;
  week: string;
  metric: string; // le nom de l'indicateur suivi, ex: "Inscriptions"
  actual: number;
  target: number;
}

// Un critère noté dans le questionnaire du Risk Scorer (le calcul de score de risque).
export interface RiskCriterion {
  id: string;
  label: string;
  score: number; // note donnée par l'utilisateur, de 0 à 10
  weight: number; // importance du critère dans le score final, entre 0 et 1 (la somme des poids doit faire ~1)
}

// Les hypothèses de conversion et de ROAS (retour sur les dépenses publicitaires) pour un canal.
// C'est ce qui permet au Sankey Funnel de transformer un budget en entonnoir de conversion.
export interface ChannelFunnelConfig {
  channel: Channel;
  costPerClick: number;
  clickToLeadRate: number; // part des clics qui deviennent des leads (prospects), entre 0 et 1
  leadToCustomerRate: number; // part des leads qui deviennent des clients, entre 0 et 1
  avgRevenuePerCustomer: number;
}

// Les infos d'en-tête du rapport PDF consolidé (module PDF Export).
export interface ReportMeta {
  title: string;
  subtitle: string;
  preparedBy: string;
}

// La forme complète de toutes les données partagées entre les 6 modules.
export interface LaunchState {
  channelBudgets: ChannelBudget[];
  gtmTasks: GTMTask[];
  kpiEntries: KPIWeeklyEntry[];
  riskCriteria: RiskCriterion[];
  funnelConfigs: ChannelFunnelConfig[];
  reportMeta: ReportMeta;
}
