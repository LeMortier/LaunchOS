// Composant réutilisable : un bouton pour importer un CSV + un bouton pour télécharger le modèle CSV.
// Tous les modules (Budget Allocator, KPI Tracker, etc.) utilisent ce même composant, en lui passant
// juste leurs propres colonnes et leur propre façon de lire une ligne.
import { useRef, useState } from 'react';
import { downloadCsvTemplate, parseCsvFile } from '../store/csvImport';

// Les "props" (les réglages qu'on donne au composant quand on l'utilise, un peu comme des arguments de fonction).
interface CsvImportButtonProps<T> {
  /** Texte affiché sur le bouton d'import, ex: "Importer le budget". */
  label?: string;
  /** Nom du fichier téléchargé pour le modèle, ex: "budget-template.csv". */
  templateFilename: string;
  /** Les colonnes écrites dans le fichier modèle. */
  templateHeaders: string[];
  /** Des lignes d'exemple optionnelles, écrites sous les colonnes dans le modèle. */
  templateSampleRows?: string[][];
  /** Transforme une ligne brute du CSV (texte) en donnée typée. Si ça plante, la ligne est ignorée. */
  mapRow: (row: Record<string, string>) => T;
  /** Appelée avec toutes les lignes importées avec succès, pour que le module les mette dans le store. */
  onImport: (rows: T[]) => void;
}

export function CsvImportButton<T>({
  label = 'Importer un CSV',
  templateFilename,
  templateHeaders,
  templateSampleRows,
  mapRow,
  onImport,
}: CsvImportButtonProps<T>) {
  // Référence vers l'input fichier caché, pour pouvoir "cliquer" dessus depuis notre propre bouton stylé.
  const inputRef = useRef<HTMLInputElement>(null);
  // "state" = une donnée qui, quand elle change, fait automatiquement redessiner le composant à l'écran.
  const [error, setError] = useState<string | null>(null);
  const [lastImportedCount, setLastImportedCount] = useState<number | null>(null);

  // Appelée quand l'utilisateur choisit un fichier dans la fenêtre de sélection.
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permet de réimporter le même fichier deux fois de suite si besoin
    if (!file) return;

    setError(null);
    try {
      const rows = await parseCsvFile(file, mapRow);
      onImport(rows); // le module appelant se charge de pousser ces lignes dans le store partagé
      setLastImportedCount(rows.length);
    } catch {
      setError("Échec de l'import du CSV. Vérifiez le format du fichier.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-neutral-100 hover:bg-neutral-700 transition-colors"
      >
        {label}
      </button>
      {/* L'input fichier réel est caché : on préfère afficher notre propre bouton stylé au-dessus. */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => downloadCsvTemplate(templateFilename, templateHeaders, templateSampleRows)}
        className="rounded-md px-3 py-1.5 text-neutral-400 underline decoration-dotted hover:text-neutral-200 transition-colors"
      >
        Télécharger le template CSV
      </button>
      {lastImportedCount !== null && !error && (
        <span className="text-emerald-400">{lastImportedCount} ligne(s) importée(s)</span>
      )}
      {error && <span className="text-red-400">{error}</span>}
    </div>
  );
}
