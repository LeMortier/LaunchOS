// Ceci est le "store" central de LaunchOS : un endroit unique où sont gardées toutes les données
// partagées entre les 6 modules (budget, tâches du calendrier, KPI, score de risque, etc.).
// On utilise la librairie Zustand pour ça. Un "hook" (une fonction spéciale de React qu'on appelle
// depuis un composant) nommé useLaunchStore permet à n'importe quel module de lire ou modifier ces données.
// Exemple concret : quand le Budget Allocator change le budget "Ads", le Sankey Funnel le voit
// immédiatement, sans qu'on ait besoin de faire passer l'info manuellement de composant en composant.
//
// On ajoute aussi la "persistance" (persist, un middleware = un plugin qui vient s'enrouler autour
// du store) : à chaque changement, les données sont sauvegardées dans le localStorage du navigateur
// (une mémoire qui survit à un rafraîchissement de page). Au chargement de l'app, le store se
// "réhydrate" (relit) automatiquement depuis cette sauvegarde. Aucun conflit possible avec l'import
// CSV : que la donnée vienne d'un slider, d'un formulaire ou d'un fichier CSV importé, elle passe
// TOUJOURS par une des fonctions "set..." ci-dessous, donc par le même unique chemin que persist
// surveille. Pour le store, une ligne importée par CSV n'a rien de spécial.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  CHANNELS,
  type Channel,
  type ChannelBudget,
  type ChannelFunnelConfig,
  type GTMTask,
  type KPIWeeklyEntry,
  type LaunchState,
  type ReportMeta,
  type RiskCriterion,
} from './types';

// La forme du store : les données elles-mêmes, plus les fonctions ("actions") pour les modifier.
interface LaunchStore {
  channelBudgets: ChannelBudget[];
  setChannelBudgets: (budgets: ChannelBudget[]) => void;
  setChannelBudget: (channel: Channel, amount: number) => void;

  gtmTasks: GTMTask[];
  setGtmTasks: (tasks: GTMTask[]) => void;
  upsertGtmTask: (task: GTMTask) => void;
  removeGtmTask: (id: string) => void;

  kpiEntries: KPIWeeklyEntry[];
  setKpiEntries: (entries: KPIWeeklyEntry[]) => void;
  upsertKpiEntry: (entry: KPIWeeklyEntry) => void;

  riskCriteria: RiskCriterion[];
  setRiskCriteria: (criteria: RiskCriterion[]) => void;
  updateRiskCriterionScore: (id: string, score: number) => void;

  funnelConfigs: ChannelFunnelConfig[];
  setFunnelConfigs: (configs: ChannelFunnelConfig[]) => void;
  setFunnelConfig: (config: ChannelFunnelConfig) => void;

  reportMeta: ReportMeta;
  setReportMeta: (meta: ReportMeta) => void;

  // Remplace TOUTES les données des 6 modules d'un coup (utilisé par le bouton "Charger le scénario
  // de démo" de la Sidebar), et remet tout à zéro (utilisé par le bouton "Réinitialiser" à côté).
  loadLaunchState: (data: LaunchState) => void;
  resetLaunchState: () => void;
}

// Les seuls champs qu'on sauvegarde réellement dans le localStorage : uniquement les données, jamais
// les fonctions "set..." (une fonction ne se sauvegarde pas dans du JSON, et ce n'est de toute façon
// pas son rôle : au rechargement, ces fonctions sont recréées normalement par "create" ci-dessous).
type PersistedLaunchState = Pick<
  LaunchStore,
  'channelBudgets' | 'gtmTasks' | 'kpiEntries' | 'riskCriteria' | 'funnelConfigs' | 'reportMeta'
>;

const defaultReportMeta: ReportMeta = {
  title: 'Rapport de lancement',
  subtitle: '',
  preparedBy: '',
};

// Budgets de départ : tous les canaux démarrent à 0€ tant que l'utilisateur n'a rien saisi.
const defaultChannelBudgets: ChannelBudget[] = CHANNELS.map((channel) => ({
  channel,
  amount: 0,
}));

// Pareil pour les hypothèses du Sankey Funnel : tout à 0 par défaut, en attendant une saisie ou un import CSV.
const defaultFunnelConfigs: ChannelFunnelConfig[] = CHANNELS.map((channel) => ({
  channel,
  costPerClick: 0,
  clickToLeadRate: 0,
  leadToCustomerRate: 0,
  avgRevenuePerCustomer: 0,
}));

// "create" fabrique le store. Chaque module qui appelle useLaunchStore() reçoit ces données à jour,
// et se met à jour automatiquement dès qu'une des fonctions ci-dessous change quelque chose.
// La syntaxe "create<LaunchStore>()(persist(...))" (avec les 2 parenthèses après le type) est celle
// demandée par Zustand dès qu'on ajoute un middleware comme persist, pour que TypeScript garde des
// types corrects de bout en bout.
export const useLaunchStore = create<LaunchStore>()(
  persist(
    (set) => ({
      channelBudgets: defaultChannelBudgets,
      // Remplace complètement la liste des budgets (utilisé notamment par l'import CSV).
      setChannelBudgets: (channelBudgets) => set({ channelBudgets }),
      // Met à jour le budget d'un seul canal (utilisé par les sliders du Budget Allocator).
      setChannelBudget: (channel, amount) =>
        set((state) => {
          const exists = state.channelBudgets.some((b) => b.channel === channel);
          return {
            channelBudgets: exists
              ? state.channelBudgets.map((b) => (b.channel === channel ? { ...b, amount } : b))
              : [...state.channelBudgets, { channel, amount }],
          };
        }),

      gtmTasks: [],
      setGtmTasks: (gtmTasks) => set({ gtmTasks }),
      // Ajoute une tâche si elle n'existe pas encore, ou la met à jour si elle existe déjà (même id).
      upsertGtmTask: (task) =>
        set((state) => {
          const exists = state.gtmTasks.some((t) => t.id === task.id);
          return {
            gtmTasks: exists
              ? state.gtmTasks.map((t) => (t.id === task.id ? task : t))
              : [...state.gtmTasks, task],
          };
        }),
      removeGtmTask: (id) => set((state) => ({ gtmTasks: state.gtmTasks.filter((t) => t.id !== id) })),

      kpiEntries: [],
      setKpiEntries: (kpiEntries) => set({ kpiEntries }),
      upsertKpiEntry: (entry) =>
        set((state) => {
          const exists = state.kpiEntries.some((e) => e.id === entry.id);
          return {
            kpiEntries: exists
              ? state.kpiEntries.map((e) => (e.id === entry.id ? entry : e))
              : [...state.kpiEntries, entry],
          };
        }),

      riskCriteria: [],
      setRiskCriteria: (riskCriteria) => set({ riskCriteria }),
      // Change juste la note d'un critère (utilisé quand l'utilisateur répond au questionnaire).
      updateRiskCriterionScore: (id, score) =>
        set((state) => ({
          riskCriteria: state.riskCriteria.map((c) => (c.id === id ? { ...c, score } : c)),
        })),

      funnelConfigs: defaultFunnelConfigs,
      setFunnelConfigs: (funnelConfigs) => set({ funnelConfigs }),
      setFunnelConfig: (config) =>
        set((state) => {
          const exists = state.funnelConfigs.some((c) => c.channel === config.channel);
          return {
            funnelConfigs: exists
              ? state.funnelConfigs.map((c) => (c.channel === config.channel ? config : c))
              : [...state.funnelConfigs, config],
          };
        }),

      reportMeta: defaultReportMeta,
      setReportMeta: (reportMeta) => set({ reportMeta }),

      // Un seul "set" pour les 6 modules à la fois : un seul re-rendu, une seule écriture dans le
      // localStorage, plutôt que 6 appels séparés.
      loadLaunchState: (data) => set(data),
      resetLaunchState: () =>
        set({
          channelBudgets: defaultChannelBudgets,
          gtmTasks: [],
          kpiEntries: [],
          riskCriteria: [],
          funnelConfigs: defaultFunnelConfigs,
          reportMeta: defaultReportMeta,
        }),
    }),
    {
      // Le nom de la clé utilisée dans le localStorage du navigateur.
      name: 'launchos-storage',
      storage: createJSONStorage(() => localStorage),
      // On ne garde que les données (voir PersistedLaunchState plus haut) : les fonctions "set..."
      // ne sont jamais écrites dans le localStorage, et sont de toute façon déjà recréées par
      // "create" à chaque chargement de l'app.
      partialize: (state): PersistedLaunchState => ({
        channelBudgets: state.channelBudgets,
        gtmTasks: state.gtmTasks,
        kpiEntries: state.kpiEntries,
        riskCriteria: state.riskCriteria,
        funnelConfigs: state.funnelConfigs,
        reportMeta: state.reportMeta,
      }),
    },
  ),
);
