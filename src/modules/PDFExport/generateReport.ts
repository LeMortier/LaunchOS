// La génération du rapport PDF consolidé : assemble en un seul fichier téléchargeable les données
// des 5 autres modules (GTM Canvas, Budget Allocator, KPI Tracker, Risk Scorer, Sankey Funnel).
// jsPDF construit le PDF page par page (texte, tableaux dessinés à la main, colonne par colonne).
// html-to-image prend une "capture d'écran" de chaque graphique (donut, courbes KPI, diagramme
// Sankey) pour l'incruster comme une image dans le PDF : un graphique SVG/recharts ne peut pas se
// transformer directement en instructions de dessin PDF, il faut d'abord le "photographier".
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  GTM_PHASES,
  GTM_PHASE_LABELS,
  type ChannelBudget,
  type GTMTask,
  type KPIWeeklyEntry,
  RISK_HIGH_THRESHOLD,
  type ReportMeta,
  type RiskCriterion,
} from '../../store/types';
import { formatCount, formatMoney, formatNumber } from '../../store/formatters';
import { buildTimestampedFilename } from '../../store/fileDownload';
import { computeFunnelTotals, type FunnelRow } from '../SankeyFunnel/funnelMath';

// Les 3 graphiques à "photographier" pour le rapport. PDFExport.tsx les rend hors écran, avec une
// version "claire" (fond blanc, texte foncé) de ces mêmes composants, et nous passe une référence
// vers chacun.
export interface ReportCaptureElements {
  budgetDonut: HTMLElement | null;
  kpiCharts: HTMLElement | null;
  sankeyDiagram: HTMLElement | null;
}

export interface GenerateReportParams {
  reportMeta: ReportMeta;
  channelBudgets: ChannelBudget[];
  gtmTasks: GTMTask[];
  kpiEntries: KPIWeeklyEntry[];
  riskCriteria: RiskCriterion[];
  funnelRows: FunnelRow[];
  captureElements: ReportCaptureElements;
}

const PAGE_MARGIN = 48;

// La compression des 3 images capturées (donut, courbes KPI, entonnoirs), passée à doc.addImage.
// Sans elle, jsPDF range chaque image en RGB brut, sans aucune compression : le rapport du scénario
// de démo pesait 16,8 Mo, dont 6,2 Mo pour la seule grille d'entonnoirs.
// C'est le 8e paramètre de addImage qui décide de ça (ImageCompression dans les types de jsPDF :
// "NONE", "FAST", "MEDIUM" ou "SLOW"), et surtout pas le format passé en 2e position : celui-là vaut
// déjà "PNG" et ne dit que comment lire la capture, pas comment la ranger dans le fichier.
// Chaque valeur choisit un couple filtre PNG + niveau de zlib. Mesuré sur le scénario de démo, avec
// des captures de graphiques (de grands aplats de couleur unie), taille du fichier et temps de
// génération dans le navigateur : NONE 16,8 Mo en 1,26 s, FAST 287 Ko en 1,25 s, MEDIUM 330 Ko en
// 1,28 s, SLOW 267 Ko en 2,06 s.
// FAST est donc à la fois le plus rapide et presque le plus petit, et il ne coûte rien par rapport à
// l'absence de compression. Les 20 Ko que SLOW ferait gagner ne valent pas ses 800 ms de calcul en
// plus. La compression PNG est sans perte : l'image du PDF reste identique au pixel près.
const IMAGE_COMPRESSION = 'FAST';

// Les couleurs de la palette du projet, réécrites ici en hexadécimal parce que jsPDF ne connaît ni les
// classes Tailwind ni les variables CSS de index.css : il ne sait recevoir qu'une couleur brute. Ce
// sont exactement les valeurs de --color-canvas, --color-ink, --color-muted, --color-accent et
// --color-alert. Même principe que CHANNEL_COLORS dans types.ts : si la palette bouge dans index.css,
// elle doit bouger ici aussi.
const PDF_COLORS = {
  canvas: '#0E1620',
  ink: '#E7EDF5',
  muted: '#8A9BB0',
  accent: '#F2A65A',
  alert: '#E5677E',
};

// Les nombres formatés en français (formatMoney/formatNumber) utilisent une espace fine insécable
// (caractère U+202F) comme séparateur de milliers. C'est la bonne typographie à l'écran, mais la
// police standard de jsPDF (Helvetica, encodage WinAnsi) ne sait pas l'afficher et la remplace par un "/".
// On la remplace ici par une espace normale, UNIQUEMENT pour ce qui part dans le PDF : l'affichage à
// l'écran (formatMoney/formatNumber eux-mêmes) garde la vraie espace fine, plus correcte.
function cleanPdfText(text: string): string {
  // U+202F = espace fine insecable (le separateur de milliers de toLocaleString('fr-FR')),
  // U+00A0 = espace insecable normale. Toutes deux non gerees par la police standard de jsPDF.
  return text.replace(new RegExp('[  ]', 'g'), ' ');
}

// Génère le rapport PDF consolidé et déclenche son téléchargement dans le navigateur. C'est la seule
// fonction que PDFExport.tsx appelle : tout le détail de mise en page du PDF reste dans ce fichier.
export async function generateLaunchReportPdf(params: GenerateReportParams): Promise<void> {
  const { reportMeta, channelBudgets, gtmTasks, kpiEntries, riskCriteria, funnelRows, captureElements } = params;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // Les 2 seuls points d'entrée où du texte part réellement vers jsPDF : on y passe systématiquement
  // par cleanPdfText, pour être sûr qu'aucun appel n'oublie de nettoyer les espaces fines.
  const pdfText = (text: string | string[], x: number, y: number) => {
    doc.text(Array.isArray(text) ? text.map(cleanPdfText) : cleanPdfText(text), x, y);
  };
  const pdfSplit = (text: string, maxWidth: number): string[] => doc.splitTextToSize(cleanPdfText(text), maxWidth);

  // "cursor" retient à quelle hauteur de la page courante on en est : toutes les fonctions
  // ci-dessous le lisent et l'avancent au fur et à mesure qu'elles dessinent du contenu.
  const cursor = { y: PAGE_MARGIN };

  // Passe à la page suivante si ce qu'on s'apprête à dessiner ne tient plus dans la page courante.
  // onPageBreak (optionnel) permet à l'appelant de redessiner quelque chose en haut de la nouvelle
  // page juste après le saut, avant de continuer : utilisé par drawTable ci-dessous pour répéter la
  // ligne d'en-tête des colonnes quand un tableau déborde sur une nouvelle page.
  const ensureSpace = (neededHeight: number, onPageBreak?: () => void) => {
    if (cursor.y + neededHeight > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      cursor.y = PAGE_MARGIN;
      onPageBreak?.();
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(23, 23, 23);
    pdfText(title, PAGE_MARGIN, cursor.y);
    cursor.y += 10;
    doc.setDrawColor(210);
    doc.line(PAGE_MARGIN, cursor.y, pageWidth - PAGE_MARGIN, cursor.y);
    cursor.y += 20;
  };

  // Affiché à la place d'une section quand le module correspondant n'a aucune donnée : mieux qu'une
  // page blanche silencieuse, ça confirme que le rapport a bien "vu" ce module.
  const drawEmptyState = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(140, 140, 140);
    pdfText('Aucune donnée renseignée.', PAGE_MARGIN, cursor.y);
    cursor.y += 28;
  };

  const drawSubheading = (text: string) => {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(196, 120, 30); // ambre foncé : version imprimable de l'accent #F2A65A, assez
    // sombre pour rester lisible sur fond blanc (l'ambre clair d'origine serait trop pâle à l'impression)
    pdfText(text, PAGE_MARGIN, cursor.y);
    cursor.y += 18;
  };

  // Dessine un texte qui passe à la ligne tout seul s'il est trop long pour la largeur disponible
  // (utile pour les titres de tâches GTM, dont la longueur n'est pas prévisible à l'avance).
  const drawWrappedText = (text: string, indent = 0) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(64, 64, 64);
    const lines = pdfSplit(text, contentWidth - indent);
    const lineHeight = 14;
    ensureSpace(lines.length * lineHeight);
    pdfText(lines, PAGE_MARGIN + indent, cursor.y);
    cursor.y += lines.length * lineHeight;
  };

  // Un tableau très simple, dessiné à la main (en-tête en gras + une ligne de séparation, puis
  // chaque ligne de données colonne par colonne) : pas besoin d'une librairie de tableau pour ça.
  // sectionTitle ne sert qu'au rappel "(suite)" plus bas, quand le tableau déborde sur une nouvelle page.
  // rowMarkers (optionnel) donne, ligne par ligne, la couleur d'une pastille à dessiner devant la
  // première colonne, ou null pour une ligne qui n'en a pas (la ligne "Total", qui n'appartient à
  // aucun canal). Les tableaux sans canal (KPI Tracker, Risk Scorer) ne passent tout simplement pas
  // ce paramètre et sont dessinés exactement comme avant.
  const drawTable = (
    sectionTitle: string,
    headers: string[],
    rows: string[][],
    columnWidths: number[],
    rowMarkers?: (string | null)[],
  ) => {
    const rowHeight = 16;
    const headerHeight = 20; // hauteur réellement utilisée par drawHeaderRow ci-dessous (6 + 14)
    // La place réservée aux pastilles, prise à l'intérieur de la première colonne. L'en-tête se décale
    // d'autant que les cellules, sinon le titre "Canal" ne serait plus aligné avec les noms en dessous.
    // Sans pastille, ce décalage vaut 0 : la mise en page ne change pas d'un point.
    const markerIndent = rowMarkers ? 12 : 0;

    // Dessine la ligne d'en-tête des colonnes. Appelée une première fois avant la première ligne de
    // données, puis rappelée en haut de chaque nouvelle page tant que le tableau continue : sans ça,
    // une page de continuation n'affiche que des chiffres sans dire à quelle colonne ils correspondent.
    const drawHeaderRow = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(120, 120, 120);
      let x = PAGE_MARGIN;
      headers.forEach((header, i) => {
        pdfText(header, i === 0 ? x + markerIndent : x, cursor.y);
        x += columnWidths[i];
      });
      cursor.y += 6;
      doc.setDrawColor(210);
      doc.line(PAGE_MARGIN, cursor.y, PAGE_MARGIN + columnWidths.reduce((a, b) => a + b, 0), cursor.y);
      cursor.y += 14;
    };

    // Rappel discret en haut d'une page de continuation ("KPI Tracker (suite)", par ex.) : même
    // police que les titres de section (drawSectionTitle plus haut), mais plus petite et plus pâle,
    // pour rester secondaire par rapport à un vrai titre de section. N'est appelé QUE depuis le
    // onPageBreak de la boucle ci-dessous, jamais avant la première ligne : il n'apparaît donc
    // jamais sur la première page d'un tableau, seulement sur celles qui suivent.
    const drawContinuationReminder = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(140, 140, 140);
      pdfText(`${sectionTitle} (suite)`, PAGE_MARGIN, cursor.y);
      cursor.y += 18;
    };

    // On réserve la place de l'en-tête ET d'au moins une ligne de données : sans le "+ rowHeight",
    // l'en-tête pourrait se retrouver seul en bas d'une page, avec toutes les lignes qui basculent
    // sur la suivante (où il serait certes redessiné, mais avec un en-tête orphelin juste au-dessus).
    ensureSpace(headerHeight + rowHeight);
    drawHeaderRow();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 45);
    rows.forEach((row, rowIndex) => {
      ensureSpace(rowHeight, () => {
        drawContinuationReminder();
        drawHeaderRow();
        // drawHeaderRow change la police/couleur pour l'en-tête : on revient au style des lignes de
        // données avant de dessiner la suite du tableau.
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(45, 45, 45);
      });
      // La pastille du canal, un petit disque plein dans la couleur de ce canal. On la remonte de 3
      // points au-dessus de la ligne de base du texte (la ligne sur laquelle les lettres reposent)
      // pour qu'elle tombe à la hauteur du milieu des lettres, et pas sous le mot.
      const markerColor = rowMarkers?.[rowIndex];
      if (markerColor) {
        doc.setFillColor(markerColor);
        doc.circle(PAGE_MARGIN + 3, cursor.y - 3, 2.5, 'F');
      }
      let x = PAGE_MARGIN;
      row.forEach((cell, i) => {
        pdfText(cell, i === 0 ? x + markerIndent : x, cursor.y);
        x += columnWidths[i];
      });
      cursor.y += rowHeight;
    });
    cursor.y += 12;
  };

  // Capture un élément du DOM (un graphique) en image et l'insère dans le PDF, mis à l'échelle pour
  // rester dans la largeur du contenu. Ne fait rien si l'élément n'existe pas encore : le rapport
  // reste utilisable (juste sans ce graphique) plutôt que de planter.
  // On utilise html-to-image (toCanvas) plutôt que html2canvas : html2canvas essaie de reparser
  // lui-même chaque couleur CSS, et ne sait pas lire le format oklch() que Tailwind v4 utilise par
  // défaut ("Attempting to parse an unsupported color function oklch"). html-to-image sérialise le
  // DOM en SVG (avec un <foreignObject>) et laisse le navigateur lui-même faire le rendu des
  // couleurs, donc il n'a pas ce problème.
  // "forceSize" fige la largeur/hauteur de capture avant la photo (au lieu de laisser le navigateur
  // les calculer tout seul) : utile pour le diagramme Sankey, dont la hauteur "auto" (dépendante du
  // viewBox SVG) pouvait être mal mesurée et couper la dernière ligne (PR) du diagramme.
  const drawCapturedImage = async (
    element: HTMLElement | null,
    maxHeight: number,
    forceSize?: { width: number; height: number },
  ) => {
    if (!element) return;
    const canvas = await toCanvas(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      ...(forceSize ?? {}),
    });
    const ratio = Math.min(contentWidth / canvas.width, maxHeight / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    ensureSpace(h + 16);
    // "undefined" est l'alias de l'image (jsPDF le calcule tout seul à partir du contenu) : il faut
    // le passer pour atteindre le paramètre suivant, la compression.
    doc.addImage(canvas, 'PNG', PAGE_MARGIN, cursor.y, w, h, undefined, IMAGE_COMPRESSION);
    cursor.y += h + 16;
  };

  // --- Page de garde ------------------------------------------------------------------------------
  // La seule page sombre du rapport, et c'est assumé : elle donne son identité au document. Tout le
  // reste est imprimé sur fond blanc, pour qu'imprimer le rapport ne vide pas une cartouche d'encre.
  doc.setFillColor(PDF_COLORS.canvas);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // La signature en haut à gauche. setCharSpace écarte les lettres les unes des autres : c'est ce qui
  // donne son air de logo à un mot écrit en majuscules. On remet l'écartement à 0 juste derrière,
  // sinon TOUT le texte du reste du document en hériterait.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(PDF_COLORS.accent);
  doc.setCharSpace(2);
  pdfText('LAUNCHOS', PAGE_MARGIN, PAGE_MARGIN + 12);
  doc.setCharSpace(0);

  // Le bloc titre + sous-titre est centré verticalement. On mesure d'abord sa hauteur totale, parce
  // qu'un titre long tient sur plusieurs lignes, puis on démarre à la moitié de la place restante.
  // Chaque ligne descend le curseur AVANT d'être écrite : jsPDF place le texte par sa ligne de base
  // (la ligne sur laquelle les lettres reposent), donc écrire à la hauteur du haut du bloc ferait
  // dépasser la première ligne vers le haut.
  const coverTitleLineHeight = 36;
  const coverSubtitleLineHeight = 20;
  const coverSubtitleGap = 14;
  doc.setFontSize(30);
  const titleLines = pdfSplit(reportMeta.title || 'Rapport de lancement', contentWidth);
  const subtitleLines = reportMeta.subtitle ? pdfSplit(reportMeta.subtitle, contentWidth) : [];
  const coverBlockHeight =
    titleLines.length * coverTitleLineHeight +
    (subtitleLines.length > 0 ? coverSubtitleGap + subtitleLines.length * coverSubtitleLineHeight : 0);
  let coverY = (pageHeight - coverBlockHeight) / 2;

  doc.setTextColor(PDF_COLORS.ink);
  for (const line of titleLines) {
    coverY += coverTitleLineHeight;
    pdfText(line, PAGE_MARGIN, coverY);
  }

  if (subtitleLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(PDF_COLORS.muted);
    coverY += coverSubtitleGap;
    for (const line of subtitleLines) {
      coverY += coverSubtitleLineHeight;
      pdfText(line, PAGE_MARGIN, coverY);
    }
  }

  // Les deux lignes du bas sont ancrées au bas de la page, pas à la suite du sous-titre : elles
  // restent à la même hauteur quelle que soit la longueur du titre au-dessus.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(PDF_COLORS.muted);
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (reportMeta.preparedBy) {
    pdfText(`Préparé par : ${reportMeta.preparedBy}`, PAGE_MARGIN, pageHeight - PAGE_MARGIN - 18);
  }
  pdfText(`Date : ${today}`, PAGE_MARGIN, pageHeight - PAGE_MARGIN);

  // --- GTM Canvas : les tâches groupées par phase --------------------------------------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle('GTM Canvas');
  if (gtmTasks.length === 0) {
    drawEmptyState();
  } else {
    for (const phaseKey of GTM_PHASES) {
      const tasks = gtmTasks.filter((task) => task.phase === phaseKey).sort((a, b) => a.startDay - b.startDay);
      if (tasks.length === 0) continue;
      drawSubheading(GTM_PHASE_LABELS[phaseKey]);
      for (const task of tasks) {
        drawWrappedText(`•  ${task.title}, jour ${task.startDay}, durée ${task.durationDays} jour(s)`, 8);
      }
      cursor.y += 8;
    }
  }

  // --- Budget Allocator : tableau des budgets + donut chart en image --------------------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle('Budget Allocator');
  const totalBudget = channelBudgets.reduce((sum, b) => sum + b.amount, 0);
  if (totalBudget <= 0) {
    drawEmptyState();
  } else {
    drawTable(
      'Budget Allocator',
      ['Canal', 'Budget'],
      [
        ...channelBudgets.map((b) => [CHANNEL_LABELS[b.channel], formatMoney(b.amount)]),
        ['Total', formatMoney(totalBudget)],
      ],
      [220, 200],
      // Une pastille de la couleur du canal devant chaque nom, la même que dans le donut juste en
      // dessous. La ligne "Total" n'appartient à aucun canal, elle n'en a donc pas.
      [...channelBudgets.map((b) => CHANNEL_COLORS[b.channel]), null],
    );
    await drawCapturedImage(captureElements.budgetDonut, 260);
  }

  // --- KPI Tracker : courbes réel vs objectif en image + tableau des entrées ------------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle('KPI Tracker');
  if (kpiEntries.length === 0) {
    drawEmptyState();
  } else {
    await drawCapturedImage(captureElements.kpiCharts, 420);
    drawTable(
      'KPI Tracker',
      ['Semaine', 'Métrique', 'Réel', 'Objectif'],
      kpiEntries.map((entry) => [entry.week, entry.metric, String(entry.actual), String(entry.target)]),
      [90, 200, 100, 100],
    );
  }

  // --- Risk Scorer : score global + détail des 10 critères -------------------------------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle('Risk Scorer');
  if (riskCriteria.length === 0) {
    drawEmptyState();
  } else {
    const globalScore = riskCriteria.reduce((total, c) => total + c.score * c.weight, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    // Même règle de lecture qu'à l'écran (voir RiskScorer.tsx et la barre de pilotage) : à partir du
    // seuil de risque élevé, le chiffre passe en couleur d'alerte. En dessous, il garde le gris très
    // foncé du reste du rapport.
    if (globalScore >= RISK_HIGH_THRESHOLD) {
      doc.setTextColor(PDF_COLORS.alert);
    } else {
      doc.setTextColor(23, 23, 23);
    }
    pdfText(`Score de risque global : ${formatNumber(globalScore)} / 10`, PAGE_MARGIN, cursor.y);
    cursor.y += 28;
    drawTable(
      'Risk Scorer',
      ['Critère', 'Score', 'Poids'],
      riskCriteria.map((c) => [c.label, `${c.score} / 10`, `${Math.round(c.weight * 100)}%`]),
      [260, 100, 100],
    );
  }

  // --- Sankey Funnel & ROAS : diagramme en image + tableau des résultats par canal --------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle("Funnel d'acquisition & ROAS");
  const hasFunnelData = funnelRows.some((row) => row.clicks > 0);
  if (!hasFunnelData) {
    drawEmptyState();
  } else {
    // Pas de forceSize ici (contrairement à l'ancien diagramme de Sankey fait main) : la grille
    // d'entonnoirs est en recharts + ResponsiveContainer, comme le donut et les courbes KPI plus
    // haut, qui n'en ont pas besoin non plus. Leur mesure "auto" est fiable.
    await drawCapturedImage(captureElements.sankeyDiagram, 620);
    const totals = computeFunnelTotals(funnelRows);
    drawTable(
      "Funnel d'acquisition & ROAS",
      ['Canal', 'Clics', 'Leads', 'Clients', 'Revenu', 'ROAS'],
      [
        ...funnelRows.map((row) => [
          CHANNEL_LABELS[row.channel],
          formatCount(row.clicks),
          formatCount(row.leads),
          formatCount(row.customers),
          formatMoney(row.revenue),
          `${formatNumber(row.roas)}x`,
        ]),
        [
          'Total',
          formatCount(totals.clicks),
          formatCount(totals.leads),
          formatCount(totals.customers),
          formatMoney(totals.revenue),
          `${formatNumber(totals.roas)}x`,
        ],
      ],
      [110, 80, 80, 80, 110, 70],
      // Mêmes pastilles que dans le tableau du Budget Allocator, et mêmes couleurs que les entonnoirs
      // de l'image juste au-dessus. La ligne "Total" n'en a pas.
      [...funnelRows.map((row) => CHANNEL_COLORS[row.channel]), null],
    );
  }

  doc.save(buildTimestampedFilename(reportMeta.title, 'pdf'));
}
