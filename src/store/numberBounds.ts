// Les bornes numériques utilisées dans plusieurs modules, pour ramener automatiquement une valeur
// saisie hors limites à la limite la plus proche (ex: un taux de conversion tapé à 5 redevient 1).
// La correction se fait à la sortie du champ (onBlur, quand on quitte le champ), jamais pendant la
// frappe : sinon impossible de taper une valeur intermédiaire comme "0," en train de devenir "0,5".
// Centralisées ici pour que chaque champ du même type utilise toujours la même règle.

// Ramène une valeur dans l'intervalle [min, max]. Une valeur qui n'est pas un vrai nombre (NaN,
// par exemple un champ vidé) retombe sur le minimum plutôt que de laisser passer une donnée cassée.
export function clampToRange(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Le coût par clic doit être strictement positif : à 0€, on "achète" un nombre infini de clics, ce
// qui fait exploser le calcul du funnel (division par zéro dans funnelMath.ts). Comme il n'existe
// pas de "plus petit nombre juste au-dessus de zéro", on retombe sur le pas (step) du champ, 1 centime.
export const COST_PER_CLICK_MIN = 0.01;

// Un taux de conversion (clic vers lead, lead vers client) est une proportion : jamais en dessous de
// 0% ni au-dessus de 100%.
export const CONVERSION_RATE_MIN = 0;
export const CONVERSION_RATE_MAX = 1;

// Un revenu par client ne peut pas être négatif.
export const REVENUE_PER_CUSTOMER_MIN = 0;

// Le jour de début d'une tâche GTM : jamais avant le jour 0.
export const GTM_START_DAY_MIN = 0;

// La durée d'une tâche GTM : au moins 1 jour, et pas plus d'un an (365 jours) - au-delà, ce n'est
// plus un plan de lancement.
export const GTM_DURATION_MIN = 1;
export const GTM_DURATION_MAX = 365;

// Les indicateurs suivis par le KPI Tracker (réel, objectif) sont des comptages : jamais négatifs.
export const KPI_VALUE_MIN = 0;

// Le budget alloué à un canal ne peut pas être négatif.
export const BUDGET_AMOUNT_MIN = 0;

// Une note du questionnaire du Risk Scorer va de 0 (aucun risque) à 10 (risque maximal).
export const RISK_SCORE_MIN = 0;
export const RISK_SCORE_MAX = 10;

// Le poids d'un critère de risque. Attention, c'est la seule borne de ce fichier qui REFUSE sa propre
// valeur : un poids doit être strictement au-dessus de 0, jamais égal à 0. Un critère qui pèse 0 ne
// change rien au score global (le calcul fait note x poids), autant le retirer du questionnaire.
// Comme il n'existe pas de "plus petit nombre juste au-dessus de zéro", on ne peut pas l'écrire comme
// un minimum normal : c'est la comparaison qui doit être stricte partout où cette borne est utilisée.
export const RISK_WEIGHT_MIN = 0;

// Vérifie qu'une valeur texte lue dans un CSV importé est un nombre dans les bornes attendues. Sert
// au mode strict des imports (voir CsvImportButton et parseCsvFileStrict) : contrairement à
// clampToRange ci-dessus, qui corrige silencieusement une valeur hors bornes pendant la saisie
// manuelle, celle-ci ne corrige jamais rien : elle refuse la ligne (et donc tout le fichier, en mode
// strict) avec un message qui dit quel champ pose problème et quelle plage était attendue. "label"
// doit être le début d'une phrase (ex: "Le coût par clic"), pour que le message se lise bien une fois
// complété.
export function parseCsvNumber(rawText: string | undefined, label: string, min: number, max: number): number {
  const text = (rawText ?? '').trim();
  const value = Number(text);
  if (text === '' || Number.isNaN(value)) {
    throw new Error(`${label} est invalide : "${rawText ?? ''}" n'est pas un nombre.`);
  }
  if (value < min || value > max) {
    const range = max === Infinity ? `être au moins ${min}` : `être compris entre ${min} et ${max}`;
    throw new Error(`${label} est hors limites : "${value}" doit ${range}.`);
  }
  return value;
}

// La cousine de parseCsvNumber ci-dessus, pour les valeurs qui arrivent d'un fichier JSON (l'ouverture
// d'un projet complet, voir projectFile.ts) plutôt que d'un CSV. Les deux partagent les mêmes bornes
// et le même style de message ; seule la façon de lire la valeur change. Dans un CSV tout est du
// texte, donc "1000" doit être converti en nombre. Dans un JSON, un nombre s'écrit déjà comme un
// nombre : recevoir "1000" entre guillemets est une erreur de format du fichier, pas une valeur à
// convertir, donc on la refuse. On refuse aussi NaN et l'infini, qui feraient des calculs cassés
// dans les modules sans que rien ne le signale à l'écran.
export function parseJsonNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} est invalide : ${describeJsonValue(value)} n'est pas un nombre.`);
  }
  if (value < min || value > max) {
    const range = max === Infinity ? `être au moins ${min}` : `être compris entre ${min} et ${max}`;
    throw new Error(`${label} est hors limites : "${value}" doit ${range}.`);
  }
  return value;
}

// Réaffiche la valeur fautive telle qu'elle était écrite dans le fichier, pour que le message d'erreur
// aide vraiment à la retrouver. JSON.stringify garde les guillemets d'une chaîne (on voit donc bien la
// différence entre 1000 et "1000"), mais renvoie undefined pour une valeur absente, d'où le repli.
function describeJsonValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}
