// Petits formatteurs de nombres réutilisés à plusieurs endroits (Sankey Funnel, PDF Export...).
// Regroupés ici pour être sûr d'afficher les euros et les chiffres toujours de la même façon partout.
export const formatMoney = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const formatNumber = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// Pour des comptages qui n'ont pas de sens en fraction (des clics, des leads, des clients : on ne
// compte pas "44 444,4 clics" ou "106,7 clients", ce sont des personnes/actions entières). On arrondit
// à l'entier le plus proche avant d'afficher, contrairement à formatNumber qui garde une décimale.
export const formatCount = (n: number): string => Math.round(n).toLocaleString('fr-FR');

// Ces deux-là sont différents des formatteurs au-dessus : ceux du haut ne servent qu'à AFFICHER un
// nombre en lecture seule. formatEditableNumber/parseEditableNumber forment une paire "aller-retour"
// pour un champ de saisie modifiable : on affiche le nombre en français (virgule), et on relit
// ensuite ce que la personne a tapé, virgule ou point acceptés.
// Pourquoi ne pas juste utiliser <input type="number"> et laisser le navigateur gérer la virgule ?
// Parce qu'un vrai input number est obligé, par la norme HTML, de garder un point comme séparateur
// en interne. L'affichage en virgule qu'on peut voir vient juste d'un habillage du navigateur selon
// la langue du système, et cet habillage disparaît dès qu'on interagit une fois avec le champ, sans
// jamais revenir : c'est ce qui causait la régression du point qui remplaçait la virgule après le
// clamp au blur. En repassant par un champ texte et ces deux fonctions, l'affichage en virgule est
// garanti, quoi qu'il arrive.
export const formatEditableNumber = (n: number): string =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: 10, useGrouping: false });

// Number.NaN si le texte n'est pas (encore) un nombre valide, ex: "0," en train d'être tapé.
export const parseEditableNumber = (text: string): number => Number(text.trim().replace(',', '.'));
