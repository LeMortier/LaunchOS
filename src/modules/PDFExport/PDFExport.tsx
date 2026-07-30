// Module 6 : PDF Export — le rapport consolidé qui résume tout ce qui a été fait dans les 5 autres modules.
// Ce fichier est une "coquille" (shell) : le formulaire et le résumé chiffré sont branchés en vrai sur le
// store partagé, mais la génération réelle du fichier PDF reste un TODO pour une prochaine version.
import type { ChangeEvent } from 'react';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useLaunchStore } from '../../store/useLaunchStore';
import type { ReportMeta } from '../../store/types';

export default function PDFExport() {
  // Les infos d'en-tête du rapport (titre, sous-titre, préparé par) + l'action pour les modifier.
  const reportMeta = useLaunchStore((state) => state.reportMeta);
  const setReportMeta = useLaunchStore((state) => state.setReportMeta);

  // On lit aussi les données des 5 autres modules, en lecture seule, juste pour prouver qu'on peut
  // agréger tout le monde dans un seul résumé (c'est le rôle du rapport consolidé).
  const channelBudgets = useLaunchStore((state) => state.channelBudgets);
  const gtmTasks = useLaunchStore((state) => state.gtmTasks);
  const kpiEntries = useLaunchStore((state) => state.kpiEntries);
  const riskCriteria = useLaunchStore((state) => state.riskCriteria);
  const funnelConfigs = useLaunchStore((state) => state.funnelConfigs);

  // Le budget total, tous canaux confondus (Budget Allocator).
  const totalBudget = channelBudgets.reduce((sum, budget) => sum + budget.amount, 0);
  // Combien de canaux ont vraiment des hypothèses de conversion saisies (pas juste la valeur par défaut à 0).
  const configuredFunnelChannels = funnelConfigs.filter((config) => config.costPerClick > 0).length;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-white">PDF Export</h2>
        <p className="text-sm text-neutral-400">Rapport consolidé de tous les modules</p>
      </div>

      {/* Formulaire manuel : chaque champ écrit directement dans le store partagé via setReportMeta. */}
      <section className="rounded-lg border border-neutral-800 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-200">Informations du rapport</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Titre
            <input
              type="text"
              value={reportMeta.title}
              onChange={handleFieldChange('title')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Sous-titre
            <input
              type="text"
              value={reportMeta.subtitle}
              onChange={handleFieldChange('subtitle')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            Préparé par
            <input
              type="text"
              value={reportMeta.preparedBy}
              onChange={handleFieldChange('preparedBy')}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        {/* Import CSV alternatif au formulaire : une seule ligne dans le fichier suffit, elle remplace tout reportMeta. */}
        <CsvImportButton<ReportMeta>
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
      <section className="rounded-lg border border-neutral-800 p-4">
        <h3 className="text-sm font-medium text-neutral-200 mb-3">Résumé des modules</h3>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Budget total" value={`${totalBudget}€`} />
          <SummaryCard label="Tâches GTM" value={`${gtmTasks.length}`} />
          <SummaryCard label="Entrées KPI" value={`${kpiEntries.length}`} />
          <SummaryCard label="Critères de risque notés" value={`${riskCriteria.length}`} />
          <SummaryCard
            label="Canaux Sankey configurés"
            value={`${configuredFunnelChannels}/${funnelConfigs.length}`}
          />
        </div>
      </section>

      {/* Bouton de génération du PDF, désactivé pour l'instant. */}
      <section className="rounded-lg border border-neutral-800 p-4 flex flex-col gap-2">
        {/* TODO : brancher jsPDF + html2canvas (déjà installées) ici. L'idée : html2canvas prend une
            "photo" (capture du DOM en image) de chaque module un par un, puis jsPDF assemble ces images
            dans un vrai fichier PDF téléchargeable. Tant que ce n'est pas fait, le bouton reste désactivé. */}
        <button
          type="button"
          disabled
          className="self-start rounded-md border border-emerald-500/20 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400/50 cursor-not-allowed"
        >
          Générer le PDF
        </button>
        <p className="text-xs text-neutral-500">
          La génération réelle du rapport (capture de chaque module + assemblage en PDF) arrive dans une
          prochaine version.
        </p>
      </section>
    </div>
  );
}

// Petite carte réutilisable pour afficher un chiffre clé avec son étiquette, dans le résumé des modules.
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="text-lg font-semibold text-emerald-400">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
