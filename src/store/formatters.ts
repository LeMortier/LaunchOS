// Petits formatteurs de nombres réutilisés à plusieurs endroits (Sankey Funnel, PDF Export...).
// Regroupés ici pour être sûr d'afficher les euros et les chiffres toujours de la même façon partout.
export const formatMoney = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const formatNumber = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
