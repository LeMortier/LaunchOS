// Ce fichier gère la sauvegarde et la réouverture d'un projet LaunchOS complet, sous forme d'un seul
// fichier JSON qui contient les données des 6 modules d'un coup. Ça répond à trois besoins que les
// imports CSV ne couvrent pas : garder son travail ailleurs que dans le navigateur (un nettoyage du
// cache efface le localStorage), reprendre un projet sur une autre machine, et transmettre un plan de
// lancement à quelqu'un d'autre en un seul fichier au lieu de cinq CSV séparés.
//
// Le principe de vérification est le même que celui des imports CSV en mode strict (voir
// parseCsvFileStrict dans csvImport.ts) : tout est vérifié AVANT de toucher au store. Le moindre
// problème annule l'ouverture entière, avec un message qui dit précisément ce qui coince et où.
// Jamais de chargement à moitié : soit tout le projet arrive, soit rien ne bouge.
import { buildTimestampedFilename, downloadTextFile } from './fileDownload';
import {
  BUDGET_AMOUNT_MIN,
  CONVERSION_RATE_MAX,
  CONVERSION_RATE_MIN,
  COST_PER_CLICK_MIN,
  GTM_DURATION_MAX,
  GTM_DURATION_MIN,
  GTM_START_DAY_MIN,
  KPI_VALUE_MIN,
  parseJsonNumber,
  REVENUE_PER_CUSTOMER_MIN,
  RISK_SCORE_MAX,
  RISK_SCORE_MIN,
  RISK_WEIGHT_MIN,
} from './numberBounds';
import {
  CHANNELS,
  GTM_PHASES,
  type Channel,
  type ChannelBudget,
  type ChannelFunnelConfig,
  type GTMPhaseKey,
  type GTMTask,
  type KPIWeeklyEntry,
  type LaunchState,
  type ReportMeta,
  type RiskCriterion,
} from './types';

// Une étiquette écrite dans le fichier pour reconnaître un projet LaunchOS au premier coup d'oeil.
// Sans elle, un JSON quelconque tombé dans le sélecteur de fichier serait disséqué champ par champ
// pour finir sur un message technique incompréhensible. Là, on le refuse tout de suite, clairement.
const PROJECT_FILE_FORMAT = 'launchos-project';

// Le numéro de version du FORMAT du fichier (pas de l'application). Il sert à refuser proprement un
// fichier écrit par une version future de LaunchOS, qui contiendrait des données qu'on ne saurait pas
// lire. À incrémenter le jour où la forme du fichier change vraiment (un champ ajouté ou renommé).
const PROJECT_FILE_VERSION = 1;

// La forme du fichier exporté. "state" a exactement la forme de LaunchState (les 6 clés du store),
// pour pouvoir être renvoyé tel quel à loadLaunchState() sans transformation intermédiaire.
interface ProjectFile {
  format: string;
  formatVersion: number;
  exportedAt: string;
  state: LaunchState;
}

// Télécharge l'état complet des 6 modules dans un fichier JSON, et renvoie le nom du fichier produit
// pour que l'interface puisse l'afficher. Le nom reprend le titre du rapport et la date, exactement
// comme l'export PDF (même fonction partagée), pour que les deux fichiers d'un même lancement se
// retrouvent côte à côte dans le dossier de téléchargements.
// "exportedAt" est purement informatif, pour quelqu'un qui ouvrirait le fichier dans un éditeur de
// texte : il n'est jamais relu à la réouverture.
export function exportProjectFile(state: LaunchState): string {
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    formatVersion: PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  const filename = buildTimestampedFilename(state.reportMeta.title, 'json');
  // Le "2" en dernier argument indente le JSON : le fichier reste lisible si on l'ouvre à la main.
  downloadTextFile(filename, JSON.stringify(file, null, 2), 'application/json;charset=utf-8;');
  return filename;
}

/**
 * Lit le contenu texte d'un fichier de projet et renvoie l'état complet des 6 modules, prêt à être
 * donné à loadLaunchState(). Lève une erreur avec un message en français dès le premier problème
 * rencontré : l'appelant n'a alors rien reçu, donc il n'a rien à annuler.
 */
export function parseProjectFile(text: string): LaunchState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide : il est peut-être abîmé ou incomplet.");
  }

  const file = asObject(parsed, 'Le fichier');

  // On vérifie l'étiquette avant tout le reste : ça distingue "ce n'est pas le bon type de fichier"
  // de "c'est bien un projet LaunchOS, mais il a un problème à tel endroit".
  if (file.format !== PROJECT_FILE_FORMAT) {
    throw new Error("Ce fichier n'est pas un projet LaunchOS exporté depuis l'application.");
  }

  const version = file.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Le numéro de version du fichier est absent ou invalide.');
  }
  if (version > PROJECT_FILE_VERSION) {
    throw new Error(
      `Ce fichier a été créé avec une version plus récente de LaunchOS (format ${version}, cette version lit jusqu'au format ${PROJECT_FILE_VERSION}). Mettez l'application à jour pour l'ouvrir.`,
    );
  }

  const state = asObject(file.state, 'La section "state"');

  // Chaque section est vérifiée séparément et rangée dans une variable locale. Le résultat n'est
  // assemblé qu'à la toute fin : si la 5e section coince, les 4 premières sont simplement jetées.
  const channelBudgets = parseChannelBudgets(state.channelBudgets);
  const funnelConfigs = parseFunnelConfigs(state.funnelConfigs);
  const gtmTasks = parseGtmTasks(state.gtmTasks);
  const kpiEntries = parseKpiEntries(state.kpiEntries);
  const riskCriteria = parseRiskCriteria(state.riskCriteria);
  const reportMeta = parseReportMeta(state.reportMeta);

  return { channelBudgets, funnelConfigs, gtmTasks, kpiEntries, riskCriteria, reportMeta };
}

// ---------------------------------------------------------------------------
// Les petits vérificateurs de base, réutilisés par toutes les sections.
// ---------------------------------------------------------------------------

// Vérifie qu'une valeur est bien un objet JSON (et pas un tableau, ni null, ni un nombre...).
// "label" doit commencer une phrase, comme pour parseCsvNumber, pour que le message se lise bien.
function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} n'est pas un objet JSON.`);
  }
  return value as Record<string, unknown>;
}

// Vérifie qu'une section du fichier est bien une liste. Une section absente tombe ici aussi, avec le
// même message : dans les deux cas, il n'y a rien d'exploitable à lire.
function asArray(value: unknown, sectionName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`La section "${sectionName}" est absente ou n'est pas une liste.`);
  }
  return value;
}

// Un champ texte qui a le droit d'être vide (un sous-titre de rapport, le nom d'une semaine...).
function asText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} doit être du texte.`);
  }
  return value;
}

// Un champ texte obligatoire : les identifiants et les intitulés, sans lesquels l'élément ne peut pas
// être affiché correctement. On renvoie la version sans espaces autour, comme le font les imports CSV.
function asRequiredText(value: unknown, label: string): string {
  const text = asText(value, label).trim();
  if (text === '') {
    throw new Error(`${label} est vide.`);
  }
  return text;
}

// Vérifie qu'un canal fait bien partie des 4 canaux connus de l'application (voir CHANNELS).
function asChannel(value: unknown): Channel {
  const text = asText(value, 'Le canal');
  if (!(CHANNELS as readonly string[]).includes(text)) {
    throw new Error(`Le canal "${text}" est inconnu : attendus ${CHANNELS.join(', ')}.`);
  }
  return text as Channel;
}

/**
 * Parcourt une section du fichier et transforme chaque élément avec parseItem. Si un élément coince,
 * on arrête tout et on remet devant le message la position de l'élément fautif, exactement comme les
 * imports CSV citent un numéro de ligne : la personne sait tout de suite quoi corriger dans son fichier.
 * On compte à partir de 1 (le 1er élément est le n°1), pas à partir de 0 comme le fait le code.
 */
function parseList<T>(
  value: unknown,
  sectionName: string,
  itemLabel: string,
  parseItem: (raw: Record<string, unknown>) => T,
): T[] {
  return asArray(value, sectionName).map((raw, index) => {
    try {
      return parseItem(asObject(raw, 'cet élément'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${itemLabel} n°${index + 1} : ${message}`);
    }
  });
}

// Les identifiants servent de "key" React dans les listes affichées (timeline GTM, tableau KPI,
// questionnaire de risque). Deux éléments avec le même identifiant cassent l'affichage et rendent la
// modification imprévisible (on en modifierait un et l'autre bougerait), d'où ce refus.
function checkUniqueIds(items: { id: string }[], itemLabel: string): void {
  const firstPositionById = new Map<string, number>();
  items.forEach((item, index) => {
    const firstPosition = firstPositionById.get(item.id);
    if (firstPosition !== undefined) {
      throw new Error(
        `L'identifiant "${item.id}" est utilisé deux fois (${itemLabel} n°${firstPosition} et n°${index + 1}) : chaque identifiant doit être unique.`,
      );
    }
    firstPositionById.set(item.id, index + 1);
  });
}

// Même idée que checkUniqueIds, mais pour les sections rangées par canal : un canal ne peut apparaître
// qu'une fois, sinon on ne saurait pas laquelle des deux valeurs fait foi.
function checkUniqueChannels(items: { channel: Channel }[], sectionLabel: string): void {
  const seen = new Set<Channel>();
  for (const item of items) {
    if (seen.has(item.channel)) {
      throw new Error(
        `Le canal "${item.channel}" apparaît deux fois dans les ${sectionLabel} : gardez une seule ligne par canal.`,
      );
    }
    seen.add(item.channel);
  }
}

// ---------------------------------------------------------------------------
// Les 6 sections, une fonction chacune. Les bornes numériques viennent toutes de numberBounds.ts,
// donc un fichier JSON est jugé avec exactement les mêmes règles qu'un CSV importé ou qu'une saisie
// manuelle : une seule source de vérité pour ce qu'est une valeur acceptable.
// ---------------------------------------------------------------------------

// Les budgets par canal (Budget Allocator). On n'exige PAS les 4 canaux : le reste de l'application
// gère déjà une liste incomplète (le Budget Allocator affiche 0 pour un canal absent, computeFunnelRows
// se rabat sur une config vide), et les imports CSV ne l'exigent pas non plus.
function parseChannelBudgets(value: unknown): ChannelBudget[] {
  const budgets = parseList<ChannelBudget>(value, 'channelBudgets', 'Budget', (raw) => ({
    channel: asChannel(raw.channel),
    amount: parseJsonNumber(raw.amount, 'Le montant', BUDGET_AMOUNT_MIN, Infinity),
  }));
  checkUniqueChannels(budgets, 'budgets');
  return budgets;
}

// Les hypothèses de conversion par canal (Sankey Funnel).
function parseFunnelConfigs(value: unknown): ChannelFunnelConfig[] {
  const configs = parseList<ChannelFunnelConfig>(value, 'funnelConfigs', 'Hypothèse de canal', (raw) => ({
    channel: asChannel(raw.channel),
    costPerClick: parseCostPerClick(raw.costPerClick),
    clickToLeadRate: parseJsonNumber(raw.clickToLeadRate, 'Le taux clic → lead', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX),
    leadToCustomerRate: parseJsonNumber(raw.leadToCustomerRate, 'Le taux lead → client', CONVERSION_RATE_MIN, CONVERSION_RATE_MAX),
    avgRevenuePerCustomer: parseJsonNumber(raw.avgRevenuePerCustomer, 'Le revenu par client', REVENUE_PER_CUSTOMER_MIN, Infinity),
  }));
  checkUniqueChannels(configs, 'hypothèses de canal');
  return configs;
}

// Le coût par clic est le seul champ qui a une règle un peu à part, et elle mérite une explication.
// L'import CSV exige au moins COST_PER_CLICK_MIN (1 centime) : à 0€, on "achèterait" un nombre infini
// de clics. Mais 0 est justement la valeur de départ des 4 canaux dans le store, celle d'un projet
// neuf ou fraîchement réinitialisé. Appliquer la règle du CSV telle quelle ferait qu'un projet vide,
// exporté puis rouvert, serait refusé par sa propre application.
// D'où la règle ici : 0 est accepté, il veut dire "canal pas encore renseigné" et ne prétend rien
// (computeFunnelRows le reconnaît et laisse le canal à zéro clic, sans jamais diviser par zéro). Une
// valeur vraiment saisie, elle, doit valoir au moins 1 centime. C'est l'entre-deux, au-dessus de 0 et
// en dessous d'un centime, qui est refusé : ce n'est plus un coût par clic plausible.
function parseCostPerClick(value: unknown): number {
  const costPerClick = parseJsonNumber(value, 'Le coût par clic', 0, Infinity);
  if (costPerClick > 0 && costPerClick < COST_PER_CLICK_MIN) {
    throw new Error(
      `Le coût par clic est hors limites : "${costPerClick}" doit valoir 0 (canal pas encore renseigné) ou être au moins ${COST_PER_CLICK_MIN}.`,
    );
  }
  return costPerClick;
}

// Les tâches de la timeline (GTM Canvas).
function parseGtmTasks(value: unknown): GTMTask[] {
  const tasks = parseList<GTMTask>(value, 'gtmTasks', 'Tâche GTM', (raw) => ({
    id: asRequiredText(raw.id, "L'identifiant"),
    title: asText(raw.title, 'Le titre'),
    phase: asPhase(raw.phase),
    startDay: parseJsonNumber(raw.startDay, 'Le jour de début', GTM_START_DAY_MIN, Infinity),
    durationDays: parseJsonNumber(raw.durationDays, 'La durée', GTM_DURATION_MIN, GTM_DURATION_MAX),
  }));
  checkUniqueIds(tasks, 'Tâche GTM');
  return tasks;
}

// La phase d'une tâche doit être une des 3 colonnes de la timeline, sinon la tâche serait invisible.
function asPhase(value: unknown): GTMPhaseKey {
  const text = asText(value, 'La phase');
  if (!(GTM_PHASES as readonly string[]).includes(text)) {
    throw new Error(`La phase "${text}" est inconnue : attendues ${GTM_PHASES.join(', ')}.`);
  }
  return text as GTMPhaseKey;
}

// Les mesures hebdomadaires (KPI Tracker).
function parseKpiEntries(value: unknown): KPIWeeklyEntry[] {
  const entries = parseList<KPIWeeklyEntry>(value, 'kpiEntries', 'Entrée KPI', (raw) => ({
    id: asRequiredText(raw.id, "L'identifiant"),
    week: asText(raw.week, 'La semaine'),
    metric: asText(raw.metric, "Le nom de l'indicateur"),
    actual: parseJsonNumber(raw.actual, 'La valeur réelle', KPI_VALUE_MIN, Infinity),
    target: parseJsonNumber(raw.target, "L'objectif", KPI_VALUE_MIN, Infinity),
  }));
  checkUniqueIds(entries, 'Entrée KPI');
  return entries;
}

// Le questionnaire de risque (Risk Scorer). Une liste vide est acceptée : c'est l'état d'un projet
// neuf, et le module réinjecte alors tout seul ses 10 critères par défaut.
function parseRiskCriteria(value: unknown): RiskCriterion[] {
  const criteria = parseList<RiskCriterion>(value, 'riskCriteria', 'Critère de risque', (raw) => ({
    id: asRequiredText(raw.id, "L'identifiant"),
    label: asRequiredText(raw.label, "L'intitulé"),
    score: parseJsonNumber(raw.score, 'La note', RISK_SCORE_MIN, RISK_SCORE_MAX),
    weight: parseRiskWeight(raw.weight),
  }));
  checkUniqueIds(criteria, 'Critère de risque');
  return criteria;
}

// Le poids d'un critère doit être strictement au-dessus de 0 (voir RISK_WEIGHT_MIN dans
// numberBounds.ts). parseJsonNumber ne sait vérifier que des bornes qui acceptent leur propre valeur,
// donc on le laisse d'abord écarter tout ce qui est négatif, puis on refuse le 0 nous-mêmes.
// Le total des poids n'est volontairement pas vérifié : un total différent de 1 est déjà signalé à
// l'écran par le Risk Scorer, et ça n'a jamais empêché un import CSV de passer non plus.
function parseRiskWeight(value: unknown): number {
  const weight = parseJsonNumber(value, 'Le poids', RISK_WEIGHT_MIN, Infinity);
  if (weight === RISK_WEIGHT_MIN) {
    throw new Error(
      `Le poids est hors limites : "${weight}" doit être strictement supérieur à ${RISK_WEIGHT_MIN}.`,
    );
  }
  return weight;
}

// L'en-tête du rapport (PDF Export). Les 3 champs ont le droit d'être vides, c'est l'état d'un projet
// neuf, mais ils doivent bien être du texte.
function parseReportMeta(value: unknown): ReportMeta {
  const meta = asObject(value, 'La section "reportMeta"');
  return {
    title: asText(meta.title, 'Le titre du rapport'),
    subtitle: asText(meta.subtitle, 'Le sous-titre du rapport'),
    preparedBy: asText(meta.preparedBy, 'Le nom de la personne qui a préparé le rapport'),
  };
}
