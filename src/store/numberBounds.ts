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
