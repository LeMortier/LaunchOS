// La génération du rapport PDF consolidé : assemble en un seul fichier téléchargeable les données
// des 5 autres modules (GTM Canvas, Budget Allocator, KPI Tracker, Risk Scorer, Sankey Funnel).
// jsPDF construit le PDF page par page (texte, tableaux dessinés à la main, colonne par colonne).
// html-to-image prend une "capture d'écran" de chaque graphique (donut, courbes KPI, diagramme
// Sankey) pour l'incruster comme une image dans le PDF : un graphique SVG/recharts ne peut pas se
// transformer directement en instructions de dessin PDF, il faut d'abord le "photographier".
import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import {
  CHANNEL_LABELS,
  GTM_PHASES,
  GTM_PHASE_LABELS,
  type ChannelBudget,
  type GTMTask,
  type KPIWeeklyEntry,
  type ReportMeta,
  type RiskCriterion,
} from '../../store/types';
import { formatCount, formatMoney, formatNumber } from '../../store/formatters';
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

// Fabrique un nom de fichier propre (sans accents ni caractères spéciaux, sinon certains systèmes
// d'exploitation ou navigateurs peuvent mal le gérer) à partir du titre du rapport, suivi de la date
// du jour. Si le titre est vide, on retombe sur un nom générique plutôt que de produire un nom bizarre.
function buildFilename(title: string): string {
  const dateStr = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ : se trie bien, pas d'ambiguïté
  const slug = title
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // enlève les accents (é -> e, è -> e...)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || 'rapport-de-lancement'}-${dateStr}.pdf`;
}

// Les nombres formatés en français (formatMoney/formatNumber) utilisent une espace fine insécable
// (caractère U+202F) comme séparateur de milliers — la bonne typographie à l'écran, mais la police
// standard de jsPDF (Helvetica, encodage WinAnsi) ne sait pas l'afficher et la remplace par un "/".
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
  const ensureSpace = (neededHeight: number) => {
    if (cursor.y + neededHeight > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      cursor.y = PAGE_MARGIN;
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
    doc.setTextColor(16, 145, 105); // le vert "emerald" utilisé comme accent dans le reste de l'app
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
  const drawTable = (headers: string[], rows: string[][], columnWidths: number[]) => {
    const rowHeight = 16;
    ensureSpace(rowHeight * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    let x = PAGE_MARGIN;
    headers.forEach((header, i) => {
      pdfText(header, x, cursor.y);
      x += columnWidths[i];
    });
    cursor.y += 6;
    doc.setDrawColor(210);
    doc.line(PAGE_MARGIN, cursor.y, PAGE_MARGIN + columnWidths.reduce((a, b) => a + b, 0), cursor.y);
    cursor.y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 45);
    for (const row of rows) {
      ensureSpace(rowHeight);
      x = PAGE_MARGIN;
      row.forEach((cell, i) => {
        pdfText(cell, x, cursor.y);
        x += columnWidths[i];
      });
      cursor.y += rowHeight;
    }
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
    doc.addImage(canvas, 'PNG', PAGE_MARGIN, cursor.y, w, h);
    cursor.y += h + 16;
  };

  // --- Page de couverture : titre, sous-titre, préparé par, date du jour ---------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(23, 23, 23);
  const titleLines = pdfSplit(reportMeta.title || 'Rapport de lancement', contentWidth);
  pdfText(titleLines, PAGE_MARGIN, 140);
  let coverY = 140 + titleLines.length * 32 + 16;

  if (reportMeta.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    const subtitleLines = pdfSplit(reportMeta.subtitle, contentWidth);
    pdfText(subtitleLines, PAGE_MARGIN, coverY);
    coverY += subtitleLines.length * 20 + 24;
  } else {
    coverY += 24;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 120);
  if (reportMeta.preparedBy) {
    pdfText(`Préparé par : ${reportMeta.preparedBy}`, PAGE_MARGIN, coverY);
    coverY += 18;
  }
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  pdfText(`Date : ${today}`, PAGE_MARGIN, coverY);

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
        drawWrappedText(`•  ${task.title} — jour ${task.startDay}, durée ${task.durationDays} jour(s)`, 8);
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
      ['Canal', 'Budget'],
      [
        ...channelBudgets.map((b) => [CHANNEL_LABELS[b.channel], formatMoney(b.amount)]),
        ['Total', formatMoney(totalBudget)],
      ],
      [220, 200],
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
    doc.setTextColor(23, 23, 23);
    pdfText(`Score de risque global : ${globalScore.toFixed(1)} / 10`, PAGE_MARGIN, cursor.y);
    cursor.y += 28;
    drawTable(
      ['Critère', 'Score', 'Poids'],
      riskCriteria.map((c) => [c.label, `${c.score} / 10`, `${Math.round(c.weight * 100)}%`]),
      [260, 100, 100],
    );
  }

  // --- Sankey Funnel & ROAS : diagramme en image + tableau des résultats par canal --------------------
  doc.addPage();
  cursor.y = PAGE_MARGIN;
  drawSectionTitle('Sankey Funnel & ROAS');
  const hasFunnelData = funnelRows.some((row) => row.clicks > 0);
  if (!hasFunnelData) {
    drawEmptyState();
  } else {
    // Largeur/hauteur de capture figées volontairement plus grandes que le rendu naturel du
    // diagramme (voir le commentaire sur drawCapturedImage) pour être sûr qu'aucune voie de canal
    // (notamment la dernière, PR) ne soit rognée par une mesure "auto" imprécise.
    await drawCapturedImage(captureElements.sankeyDiagram, 320, { width: 820, height: 460 });
    const totals = computeFunnelTotals(funnelRows);
    drawTable(
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
    );
  }

  doc.save(buildFilename(reportMeta.title));
}
