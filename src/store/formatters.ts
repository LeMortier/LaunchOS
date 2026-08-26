// Petits formatteurs de nombres réutilisés à plusieurs endroits (Sankey Funnel, PDF Export...).
// Regroupés ici pour être sûr d'afficher les euros et les chiffres toujours de la même façon partout.
export const formatMoney = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const formatNumber = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// Pour des comptages qui n'ont pas de sens en fraction (des clics, des leads, des clients : on ne
// compte pas "44 444,4 clics" ou "106,7 clients", ce sont des personnes/actions entières). On arrondit
// à l'entier le plus proche avant d'afficher, contrairement à formatNumber qui garde une décimale.
export const formatCount = (n: number): string => Math.round(n).toLocaleString('fr-FR');
