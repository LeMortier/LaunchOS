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
- Pas besoin de commenter chaque ligne — seulement les blocs qui font quelque chose d'important ou qui ne sont pas évidents au premier regard
