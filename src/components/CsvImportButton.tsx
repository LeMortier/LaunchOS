// Composant réutilisable : un bouton pour importer un CSV + un bouton pour télécharger le modèle CSV.
// Tous les modules (Budget Allocator, KPI Tracker, etc.) utilisent ce même composant, en lui passant
// juste leurs propres colonnes et leur propre façon de lire une ligne.
import { useRef, useState } from 'react';
import { downloadCsvTemplate, parseCsvFile, parseCsvFileStrict } from '../store/csvImport';

// Les "props" (les réglages qu'on donne au composant quand on l'utilise, un peu comme des arguments de fonction).
interface CsvImportButtonProps<T> {
  /** Texte affiché sur le bouton d'import, ex: "Importer le budget". */
  label?: string;
  /** Nom du fichier téléchargé pour le modèle, ex: "budget-template.csv". */
  templateFilename: string;
  /** Les colonnes écrites dans le fichier modèle. En mode strict, ce sont aussi les colonnes obligatoires. */
  templateHeaders: string[];
  /** Des lignes d'exemple optionnelles, écrites sous les colonnes dans le modèle. */
  templateSampleRows?: string[][];
  /** Transforme une ligne brute du CSV (texte) en donnée typée. Si ça plante, la ligne est ignorée
   * (mode normal) ou annule tout l'import (mode strict, voir plus bas). */
  mapRow: (row: Record<string, string>) => T;
  /** Appelée avec toutes les lignes importées avec succès, pour que le module les mette dans le store. */
  onImport: (rows: T[]) => void;
  /**
   * Active le mode strict : une seule ligne invalide annule tout l'import (au lieu de l'ignorer
   * silencieusement), avec un message d'erreur qui cite la ligne en cause. Utilisé par les modules
   * où une ligne mal formée fausserait un calcul sans que personne ne le remarque (ex: Risk Scorer).
   */
  strict?: boolean;
  /**
   * Vérification sur l'ensemble du fichier, une fois que chaque ligne a été validée individuellement
   * (ex: unicité des identifiants, au moins une ligne). Seulement utilisé en mode strict. Si elle
   * renvoie ok:false, rien n'est importé.
   */
  validateBatch?: (rows: { line: number; data: T }[]) => { ok: true } | { ok: false; error: string };
}

export function CsvImportButton<T>({
  label = 'Importer un CSV',
  templateFilename,
  templateHeaders,
  templateSampleRows,
  mapRow,
  onImport,
  strict = false,
  validateBatch,
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
      if (strict) {
        const annotatedRows = await parseCsvFileStrict(file, mapRow, templateHeaders);
        if (validateBatch) {
          const result = validateBatch(annotatedRows);
          if (!result.ok) {
            setError(result.error);
            return; // rien n'est importé
          }
        }
        const rows = annotatedRows.map((row) => row.data);
        onImport(rows);
        setLastImportedCount(rows.length);
      } else {
        const rows = await parseCsvFile(file, mapRow);
        onImport(rows); // le module appelant se charge de pousser ces lignes dans le store partagé
        setLastImportedCount(rows.length);
      }
    } catch (err) {
      // Si l'erreur vient de nos propres vérifications (mode strict), elle a déjà un message précis
      // (quelle ligne, quel problème) : on l'affiche tel quel plutôt qu'un message générique.
      setError(err instanceof Error ? err.message : "Échec de l'import du CSV. Vérifiez le format du fichier.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {/* Bouton d'import : une action secondaire (chaque module a son propre bouton d'action
          principal ailleurs), donc style neutre, sans ambre. Juste un survol qui le fait
          ressortir un peu. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded border border-border bg-surface px-3 py-1.5 text-ink transition-colors hover:border-accent"
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
      {/* Lien vers le modèle CSV : reste discret, c'est une aide, pas une action importante. */}
      <button
        type="button"
        onClick={() => downloadCsvTemplate(templateFilename, templateHeaders, templateSampleRows)}
        className="rounded px-3 py-1.5 text-muted underline decoration-dotted transition-colors hover:text-ink"
      >
        Télécharger le template CSV
      </button>
      {/* Message de succès : en ambre, parce qu'une confirmation d'import réussi, ça compte. */}
      {lastImportedCount !== null && !error && (
        <span className="text-accent">{lastImportedCount} ligne(s) importée(s)</span>
      )}
      {/* Message d'erreur : en rose/rouge pour bien signaler que quelque chose a raté. */}
      {error && <span className="text-alert">{error}</span>}
    </div>
  );
}
