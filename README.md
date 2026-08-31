# LaunchOS

Cockpit de pilotage go-to-market. Un seul écran pour planifier un lancement produit, répartir le budget, suivre les KPI, évaluer le risque et sortir un rapport présentable.

Démonstration en ligne : https://launch-os-sable.vercel.app

## Le problème

Piloter un lancement produit suppose de tenir cinq choses en même temps : un calendrier, un budget par canal, des indicateurs de performance, une évaluation du risque et une projection du funnel. Ces éléments vivent en général dans quatre fichiers séparés, souvent des tableurs, mis à jour à des rythmes différents. Personne ne voit l'ensemble, et le chiffre présenté en comité de lancement est déjà périmé.

LaunchOS rassemble ces cinq dimensions dans un outil unique. Chaque saisie se répercute immédiatement sur les indicateurs globaux, et le rapport exporté reflète toujours l'état réel du projet.

## Les six modules

**GTM Canvas.** Le plan de lancement, découpé en trois phases : pré-lancement, lancement, post-lancement. Chaque tâche porte un jour de début et une durée.

**Budget Allocator.** La répartition de l'enveloppe entre les canaux d'acquisition, avec un code couleur repris dans tous les autres modules.

**Funnel Simulator.** La projection du tunnel de conversion, représentée par un diagramme de Sankey. C'est ce module qui calcule le ROAS à partir du budget alloué et des taux de conversion saisis.

**KPI Tracker.** Le suivi des indicateurs semaine après semaine, avec import CSV pour repartir d'un export existant.

**Risk Scorer.** Une grille de critères pondérés qui produit un score de risque sur 10.

**PDF Export.** Le rapport consolidé, graphiques compris, à remettre en comité ou à archiver en fin de lancement.

## Sauvegarder un projet

Deux boutons dans la barre latérale complètent les imports CSV faits module par module. "Exporter le projet" télécharge l'état complet des six modules dans un fichier JSON, nommé d'après le titre du rapport et la date, comme le rapport PDF. "Ouvrir un projet" relit un de ces fichiers et remplace les données courantes, de quoi reprendre un lancement sur une autre machine ou le transmettre à quelqu'un. Le fichier est vérifié en entier avant le moindre remplacement, avec les mêmes bornes numériques que les imports CSV : au premier problème, l'ouverture est refusée avec un message qui cite l'élément en cause, et rien n'est modifié.

## La barre de pilotage

En haut de l'écran, une barre reste visible quel que soit le module ouvert. Elle affiche quatre constantes vitales : le budget total alloué, le ROAS global, le score de risque et l'avancement du calendrier GTM.

Elle est en lecture seule. Elle recalcule ses valeurs à partir du même magasin de données que les modules, ce qui rend toute désynchronisation impossible. Quand une donnée n'a pas encore été renseignée, elle affiche un tiret plutôt qu'un zéro, un zéro étant une information fausse.

## Stack technique

- React 19 et TypeScript
- Vite pour le build et le serveur de développement
- Tailwind CSS 4 pour les styles
- Zustand pour le magasin de données partagé entre les modules
- Recharts pour les graphiques, d3-sankey pour le diagramme du funnel
- PapaParse pour la lecture des fichiers CSV
- jsPDF et html-to-image pour la génération du rapport
- Oxlint pour le lint

L'application est entièrement côté client. Les données sont conservées dans le navigateur, sans backend ni compte utilisateur.

## Démarrer en local

Node.js 20 ou supérieur est requis.

```bash
git clone https://github.com/LeMortier/LaunchOS.git
cd LaunchOS
npm install
npm run dev
```

L'application est alors disponible sur `http://localhost:5173`.

Autres commandes :

```bash
npm run build    # build de production
npm run lint     # vérification du code
```

## Structure du projet

```
src/
  components/    Éléments d'interface partagés, dont la barre de pilotage
  modules/       Un dossier par module fonctionnel
    BudgetAllocator/
    GTMCanvas/
    KPITracker/
    PDFExport/
    RiskScorer/
    SankeyFunnel/
  store/         Magasin de données partagé, types et formatteurs
```

## Partis pris

**Un magasin unique.** Tous les modules lisent et écrivent dans le même état partagé. Aucun module ne détient sa propre copie des données, ce qui garantit que le chiffre affiché dans la barre de pilotage est celui du module qui l'a produit.

**Aucun backend.** L'outil vise le pilotage d'un lancement par une petite équipe. Une application locale supprime la question de l'hébergement, des comptes et de la confidentialité des données budgétaires, pour un usage qui reste individuel.

**Un scénario de démonstration intégré.** Le projet embarque un jeu de données complet, ce qui permet d'évaluer l'outil sans avoir à saisir trente valeurs au préalable.

**Des commentaires rédigés en français.** Le code est commenté pour être lu et expliqué, pas seulement exécuté.

## Contexte

Projet de fin de Bachelor réalisé dans le cadre du MSc Business and Technology Management à Epitech Digital School.

Conception, spécification et développement : Matthieu Mortier.