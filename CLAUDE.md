# Conventions du projet LaunchOS

## Commentaires de code
Je dois présenter ce projet à l'oral devant un jury et je ne suis pas à l'aise en lecture de code. Donc pour TOUT le code que tu écris dans ce projet :

- Commente chaque fonction, composant et bloc de logique important
- Le commentaire explique à quoi ça sert et pourquoi c'est là, jamais juste une reformulation du nom de la variable
- Écris en français, dans un langage simple et oral, jamais académique. Exemples du ton attendu :
  - "Ça récupère le budget par canal et l'envoie au diagramme Sankey"
  - "Ici on évite que le graphique plante si le CSV est vide"
  - "On stocke les données dans le store partagé pour que tous les modules y aient accès"
- Évite le jargon technique quand un mot simple existe. Si un terme est incontournable (state, props, hook...), explique-le entre parenthèses la première fois qu'il apparaît dans le fichier
- Pas besoin de commenter chaque ligne. Commente seulement les blocs qui font quelque chose d'important ou qui ne sont pas évidents au premier regard

## Typographie
- Titres et libellés d'interface forts : Archivo Expanded
- Texte courant : IBM Plex Sans
- Chiffres, valeurs de KPI, tableaux, code : IBM Plex Mono
- Polices interdites : Inter, Space Grotesk, et toute pile de polices système par défaut
- Aucune nouvelle police ne doit être introduite sans validation explicite de ma part

## Règles visuelles
- La palette bleu-nuit en place fait référence. Ne pas introduire de nouvelle couleur d'accent sans validation.
- Interdits : emoji utilisés comme icônes, dégradés violet ou rose, glassmorphism, ombres portées décoratives, noir pur #000000 et blanc pur #ffffff, couleurs Tailwind par défaut hors palette du projet, animations décoratives sans fonction.
- Les graphiques Chart.js et le rapport PDF reprennent strictement la palette du projet.

## Règles de rédaction
S'appliquent à tout le texte que tu produis : commentaires de code, README, textes d'interface, contenu du rapport PDF, messages de commit. Elles se combinent avec la section "Commentaires de code" ci-dessus, qui reste prioritaire sur le ton à adopter dans les commentaires.

- Jamais de tiret cadratin ni de demi-cadratin comme ponctuation. Reformuler la phrase plutôt que de substituer un autre signe.
- Jamais d'emoji.
- Jamais de tournure "ce n'est pas X, c'est Y" ni ses variantes.
- Mots et expressions bannis : révolutionnaire, innovant, puissant, robuste, seamless, game-changer, plonger au cœur, dans un monde où, à l'ère de, il est important de noter, il convient de souligner, n'hésitez pas.
- Phrases courtes, ton direct, aucun superlatif marketing.