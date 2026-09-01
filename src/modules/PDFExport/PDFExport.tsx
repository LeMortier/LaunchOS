// Module 6 : PDF Export, le rapport consolidé qui résume tout ce qui a été fait dans les 5 autres modules.
// Le formulaire et le résumé chiffré écrivent/lisent le store partagé comme les autres modules. Le
// bouton "Générer le PDF" appelle generateReport.ts (jsPDF + html-to-image) pour assembler un vrai
// fichier PDF téléchargeable à partir de ces mêmes données.
import { useRef, useState, type ChangeEvent } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import type { ReportMeta } from '../../store/types';
import { BudgetDonutChart } from '../BudgetAllocator/BudgetDonutChart';
import { KpiMetricsCharts } from '../KPITracker/KpiMetricsCharts';
import { FunnelCharts } from '../SankeyFunnel/SankeyDiagram';
import { computeFunnelRows } from '../SankeyFunnel/funnelMath';
import { generateLaunchReportPdf } from './generateReport';

export default function PDFExport() {
  // Les infos d'en-tête du rapport (titre, sous-titre, préparé par) + l'action pour les modifier.
  const reportMeta = useLaunchStore((state) => state.reportMeta);
  const setReportMeta = useLaunchStore((state) => state.setReportMeta);

  // On lit aussi les données des 5 autres modules : à la fois pour le résumé chiffré affiché ici,
  // et pour les donner telles quelles à generateReport.ts au moment de fabriquer le PDF.
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  const gtmTasks = useLaunchStore((state) => state.gtmTasks);
  const kpiEntries = useLaunchStore((state) => state.kpiEntries);
  const riskCriteria = useLaunchStore((state) => state.riskCriteria);
  const funnelConfigs = useLaunchStore((state) => state.funnelConfigs);
  // Sert uniquement de "key" sur CsvImportButton plus bas (voir sa définition dans useLaunchStore.ts).
  const resetGeneration = useLaunchStore((state) => state.resetGeneration);

  // Le budget total, tous canaux confondus (Budget Allocator).
  const totalBudget = channelBudgets.reduce((sum, budget) => sum + budget.amount, 0);
  // Combien de canaux ont vraiment des hypothèses de conversion saisies (pas juste la valeur par défaut à 0).
  const configuredFunnelChannels = funnelConfigs.filter((config) => config.costPerClick > 0).length;
  // Le même calcul de funnel que le module Sankey Funnel (budget -> clics -> leads -> clients -> revenu),
  // réutilisé ici tel quel via funnelMath.ts pour remplir le tableau du rapport avec les mêmes chiffres.
  const funnelRows = computeFunnelRows(channelBudgets, funnelConfigs);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Références vers les 3 graphiques rendus hors écran tout en bas de ce fichier : c'est ce que
  // html-to-image va "photographier" pour les incruster comme images dans le PDF.
  const budgetDonutRef = useRef<HTMLDivElement>(null);
  const kpiChartsRef = useRef<HTMLDivElement>(null);
  const sankeyDiagramRef = useRef<HTMLDivElement>(null);

  // Met à jour un seul champ du formulaire sans perdre les autres : on repart de reportMeta actuel
  // et on écrase juste le champ concerné avant de renvoyer le tout au store.
  const handleFieldChange =
    (field: keyof ReportMeta) => (event: ChangeEvent<HTMLInputElement>) => {
      setReportMeta({ ...reportMeta, [field]: event.target.value });
    };

  // Construit un ReportMeta à partir d'une ligne brute du CSV importé.
  const mapRow = (row: Record<string, string>): ReportMeta => ({
    title: row.title ?? '',
    subtitle: row.subtitle ?? '',
    preparedBy: row.preparedBy ?? '',
  });

  // Appelée au clic sur "Générer le PDF" : rassemble les données des 5 autres modules et les 3
  // graphiques hors écran, puis laisse generateReport.ts assembler le fichier et le télécharger.
  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      await generateLaunchReportPdf({
        reportMeta,
        channelBudgets,
        gtmTasks,
        kpiEntries,
        riskCriteria,
        funnelRows,
        captureElements: {
          budgetDonut: budgetDonutRef.current,
          kpiCharts: kpiChartsRef.current,
          sankeyDiagram: sankeyDiagramRef.current,
        },
      });
    } catch (error) {
      console.error(error);
      // On affiche le message d'erreur réel (pas un texte générique) : ça évite d'avoir à rouvrir
      // la console à chaque fois pour comprendre pourquoi la génération a échoué.
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Échec de la génération du PDF : ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">PDF Export</h2>
        <p className="mt-2 text-sm text-muted">Rapport consolidé de tous les modules</p>
      </div>

      {/* Formulaire manuel : chaque champ écrit directement dans le store partagé via setReportMeta. */}
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <h3 className="text-sm font-medium text-ink">Informations du rapport</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Titre
            <input
              type="text"
              value={reportMeta.title}
              onChange={handleFieldChange('title')}
              className="rounded border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Sous-titre
            <input
              type="text"
              value={reportMeta.subtitle}
              onChange={handleFieldChange('subtitle')}
              className="rounded border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Préparé par
            <input
              type="text"
              value={reportMeta.preparedBy}
              onChange={handleFieldChange('preparedBy')}
              className="rounded border border-border bg-canvas px-2 py-1.5 text-sm text-ink focus:border-accent"
            />
          </label>
        </div>

        {/* Import CSV alternatif au formulaire : une seule ligne dans le fichier suffit, elle remplace tout reportMeta. */}
        <CsvImportButton<ReportMeta>
          key={resetGeneration}
          label="Importer les infos du rapport (CSV)"
          templateFilename="report-meta-template.csv"
          templateHeaders={['title', 'subtitle', 'preparedBy']}
          templateSampleRows={[['Lancement produit X', 'Bilan du trimestre', 'Matthieu Mortier']]}
          mapRow={mapRow}
          onImport={(rows) => {
            // Le CSV ne décrit qu'un seul rapport donc on ne garde que la première ligne trouvée.
            if (rows.length > 0) {
              setReportMeta(rows[0]);
            }
          }}
        />
      </section>

      {/* Résumé chiffré : un chiffre clé par module, tiré en direct du store partagé. */}
      <section className="rounded-lg border border-border bg-surface p-6">
        <h3 className="mb-4 text-sm font-medium text-ink">Résumé des modules</h3>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Budget total" value={`${totalBudget}€`} />
          <SummaryCard label="Tâches GTM" value={`${gtmTasks.length}`} />
          <SummaryCard label="Entrées KPI" value={`${kpiEntries.length}`} />
          <SummaryCard label="Critères de risque notés" value={`${riskCriteria.length}`} />
          <SummaryCard
            label="Canaux funnel configurés"
            value={`${configuredFunnelChannels}/${funnelConfigs.length}`}
          />
        </div>
      </section>

      {/* Bouton de génération du PDF : appelle generateLaunchReportPdf, qui construit le fichier et
          déclenche son téléchargement. Désactivé pendant la génération pour éviter un double-clic.
          C'est LA vraie action de ce module, donc en ambre (accent). */}
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6">
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={isGenerating}
          className="self-start rounded bg-accent px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Génération en cours…' : 'Générer le PDF'}
        </button>
        <p className="text-xs text-muted">
          Le PDF reprend la page de couverture ci-dessus, puis une section par module (GTM Canvas,
          Budget Allocator, KPI Tracker, Risk Scorer, Sankey Funnel), avec leurs graphiques et tableaux.
          Un module sans donnée affiche simplement "Aucune donnée renseignée" plutôt qu'une page blanche.
        </p>
        {generationError && <p className="text-xs text-alert">{generationError}</p>}
      </section>

      {/* Copies hors écran des 3 graphiques (donut budget, courbes KPI, diagramme Sankey), en variant
          "light" (fond blanc, texte foncé) : c'est la version imprimable, différente de celle affichée
          à l'écran (fond sombre). Elles ne sont jamais visibles pour l'utilisateur (position fixe très
          à gauche de l'écran) : elles servent uniquement de "photo" pour html-to-image au moment de
          générer le PDF, puisqu'un graphique SVG ne peut pas se transformer directement en
          instructions de dessin PDF. */}
      <div aria-hidden style={{ position: 'fixed', top: 0, left: '-10000px', width: 820 }}>
        <div ref={budgetDonutRef} style={{ backgroundColor: '#ffffff', padding: 16 }}>
          <BudgetDonutChart channelBudgets={channelBudgets} height={260} variant="light" />
        </div>
        <div ref={kpiChartsRef} style={{ backgroundColor: '#ffffff', padding: 16 }}>
          <KpiMetricsCharts kpiEntries={kpiEntries} height={220} variant="light" />
        </div>
        <div ref={sankeyDiagramRef} style={{ backgroundColor: '#ffffff', padding: 16 }}>
          <FunnelCharts rows={funnelRows} variant="light" />
        </div>
      </div>
    </div>
  );
}

// Petite carte réutilisable pour afficher un chiffre avec son étiquette, dans le résumé des modules.
// En texte neutre (pas ambre) : ce sont 5 chiffres secondaires côte à côte, pas LA valeur clé du
// module (celle-là, l'ambre la réserve à la CockpitBar et au score du Risk Scorer).
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-canvas p-3">
      <div className="font-mono text-lg font-medium tabular-nums text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
