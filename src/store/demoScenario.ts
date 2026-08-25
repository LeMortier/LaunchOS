// Le "scénario de démo" : un jeu de données complet et cohérent pour les 6 modules de LaunchOS,
// écrit en dur ici (pas de fichier CSV externe à charger) pour que le bouton "Charger le scénario
// de démo" marche à coup sûr pendant une soutenance, même sans connexion ni fichier à portée de main.
// C'est le scénario fictif d'une gamme de produits éco-responsables qui se lance.
import type { ChannelBudget, ChannelFunnelConfig, GTMTask, KPIWeeklyEntry, LaunchState, RiskCriterion } from './types';

// Budgets par canal (Budget Allocator).
const channelBudgets: ChannelBudget[] = [
  { channel: 'seo', amount: 15000 },
  { channel: 'ads', amount: 30000 },
  { channel: 'influence', amount: 20000 },
  { channel: 'pr', amount: 10000 },
];

// Hypothèses de conversion par canal (Sankey Funnel & ROAS).
const funnelConfigs: ChannelFunnelConfig[] = [
  { channel: 'seo', costPerClick: 0.8, clickToLeadRate: 0.06, leadToCustomerRate: 0.12, avgRevenuePerCustomer: 220 },
  { channel: 'ads', costPerClick: 1.6, clickToLeadRate: 0.04, leadToCustomerRate: 0.1, avgRevenuePerCustomer: 220 },
  { channel: 'influence', costPerClick: 0.45, clickToLeadRate: 0.03, leadToCustomerRate: 0.08, avgRevenuePerCustomer: 220 },
  { channel: 'pr', costPerClick: 2.5, clickToLeadRate: 0.05, leadToCustomerRate: 0.15, avgRevenuePerCustomer: 220 },
];

// Les 10 critères du questionnaire de risque, notés sur 10 (Risk Scorer). Poids égal (0.1 chacun,
// soit 10 x 0.1 = 1) puisque le scénario de démo n'a pas de pondération particulière à mettre en avant.
const riskCriteria: RiskCriterion[] = [
  { id: 'demo-risk-concurrence', label: 'Concurrence', score: 7, weight: 0.1 },
  { id: 'demo-risk-time-to-market', label: 'Time-to-market', score: 6, weight: 0.1 },
  { id: 'demo-risk-budget-marketing', label: 'Budget marketing', score: 5, weight: 0.1 },
  { id: 'demo-risk-adequation-produit-marche', label: 'Adéquation produit-marché', score: 3, weight: 0.1 },
  { id: 'demo-risk-dependance-fournisseurs', label: 'Dépendance fournisseurs', score: 4, weight: 0.1 },
  { id: 'demo-risk-complexite-technique', label: 'Complexité technique', score: 8, weight: 0.1 },
  { id: 'demo-risk-reglementaire', label: 'Risque réglementaire', score: 3, weight: 0.1 },
  { id: 'demo-risk-solidite-equipe', label: 'Solidité équipe', score: 2, weight: 0.1 },
  { id: 'demo-risk-tresorerie', label: 'Risque trésorerie', score: 6, weight: 0.1 },
  { id: 'demo-risk-reputation-marque', label: 'Réputation marque', score: 4, weight: 0.1 },
];

// 3 indicateurs suivis sur 8 semaines, réel vs objectif (KPI Tracker).
function buildKpiEntries(): KPIWeeklyEntry[] {
  const series: { metric: string; slug: string; values: [number, number][] }[] = [
    {
      metric: 'Visiteurs',
      slug: 'visiteurs',
      values: [
        [4200, 5000], [6800, 6000], [9500, 8000], [11200, 10000],
        [10400, 12000], [13800, 14000], [16500, 15000], [18900, 16000],
      ],
    },
    {
      metric: 'Inscriptions',
      slug: 'inscriptions',
      values: [
        [180, 250], [340, 320], [510, 420], [620, 550],
        [580, 650], [790, 720], [960, 800], [1150, 900],
      ],
    },
    {
      metric: 'Ventes',
      slug: 'ventes',
      values: [
        [12, 20], [28, 30], [45, 40], [52, 55],
        [48, 65], [71, 75], [94, 85], [118, 95],
      ],
    },
  ];

  return series.flatMap(({ metric, slug, values }) =>
    values.map(([actual, target], i) => ({
      id: `demo-kpi-${slug}-s${i + 1}`,
      week: `S${i + 1}`,
      metric,
      actual,
      target,
    })),
  );
}
const kpiEntries: KPIWeeklyEntry[] = buildKpiEntries();

// Les tâches de la timeline (GTM Canvas), réparties sur les 3 phases de lancement.
const gtmTasks: GTMTask[] = [
  { id: 'demo-gtm-1', title: 'Étude de marché et personas', phase: 'pre-launch', startDay: 0, durationDays: 10 },
  { id: 'demo-gtm-2', title: 'Positionnement et messages clés', phase: 'pre-launch', startDay: 8, durationDays: 7 },
  { id: 'demo-gtm-3', title: 'Production des contenus SEO', phase: 'pre-launch', startDay: 12, durationDays: 15 },
  { id: 'demo-gtm-4', title: 'Création des visuels publicitaires', phase: 'pre-launch', startDay: 20, durationDays: 8 },
  { id: 'demo-gtm-5', title: 'Brief des influenceurs partenaires', phase: 'pre-launch', startDay: 24, durationDays: 5 },
  { id: 'demo-gtm-6', title: 'Préparation du dossier de presse', phase: 'pre-launch', startDay: 26, durationDays: 6 },
  { id: 'demo-gtm-7', title: 'Mise en ligne du site vitrine', phase: 'launch', startDay: 32, durationDays: 3 },
  { id: 'demo-gtm-8', title: 'Ouverture des campagnes Ads', phase: 'launch', startDay: 34, durationDays: 1 },
  { id: 'demo-gtm-9', title: 'Publication des posts influenceurs', phase: 'launch', startDay: 35, durationDays: 4 },
  { id: 'demo-gtm-10', title: 'Envoi du communiqué de presse', phase: 'launch', startDay: 35, durationDays: 2 },
  { id: 'demo-gtm-11', title: 'Webinaire de lancement produit', phase: 'launch', startDay: 38, durationDays: 1 },
  { id: 'demo-gtm-12', title: 'Campagne emailing base clients', phase: 'launch', startDay: 39, durationDays: 3 },
  { id: 'demo-gtm-13', title: 'Analyse des premiers résultats', phase: 'post-launch', startDay: 45, durationDays: 5 },
  { id: 'demo-gtm-14', title: 'Optimisation des enchères Ads', phase: 'post-launch', startDay: 48, durationDays: 10 },
  { id: 'demo-gtm-15', title: 'Collecte des témoignages clients', phase: 'post-launch', startDay: 50, durationDays: 12 },
  { id: 'demo-gtm-16', title: 'Rapport de bilan et recommandations', phase: 'post-launch', startDay: 60, durationDays: 7 },
];

// L'ensemble du scénario, prêt à être injecté d'un coup dans le store via loadLaunchState().
// NOTE : "preparedBy" a été déduit de l'adresse email du compte (matthieumortier@gmail.com ->
// "Matthieu Mortier") faute de nom fourni explicitement dans la demande ; à corriger si besoin.
export const DEMO_SCENARIO: LaunchState = {
  channelBudgets,
  funnelConfigs,
  riskCriteria,
  kpiEntries,
  gtmTasks,
  reportMeta: {
    title: 'Rapport de lancement — Gamme éco-responsable',
    subtitle: 'Bilan go-to-market T1 2026',
    preparedBy: 'Matthieu Mortier',
  },
};

// Sert à savoir si l'utilisateur a déjà commencé à remplir des données à la main, pour proposer une
// confirmation avant de tout écraser avec le scénario de démo (ou avant une réinitialisation).
export function hasExistingLaunchData(state: LaunchState): boolean {
  return (
    state.channelBudgets.some((b) => b.amount > 0) ||
    state.gtmTasks.length > 0 ||
    state.kpiEntries.length > 0 ||
    state.riskCriteria.length > 0 ||
    state.funnelConfigs.some(
      (c) => c.costPerClick > 0 || c.clickToLeadRate > 0 || c.leadToCustomerRate > 0 || c.avgRevenuePerCustomer > 0,
    )
  );
}
