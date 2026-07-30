// Ce fichier contient les 2 fonctions réutilisables pour l'import/export CSV,
// utilisées par tous les modules via le composant CsvImportButton.
import Papa from 'papaparse';

/**
 * Lit un fichier CSV (avec une ligne d'en-têtes) et transforme chaque ligne en objet grâce à mapRow.
 * Si une ligne est mal formée et fait planter mapRow, on l'ignore au lieu de faire échouer tout l'import.
 */
export function parseCsvFile<T>(
  file: File,
  mapRow: (row: Record<string, string>) => T,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: T[] = [];
        for (const raw of results.data) {
          try {
            rows.push(mapRow(raw));
          } catch {
            // On ignore juste cette ligne plutôt que de bloquer tout l'import à cause d'une seule ligne cassée.
          }
        }
        resolve(rows);
      },
      error: (error: Error) => reject(error),
    });
  });
}

// Génère un fichier CSV "modèle" (avec les bonnes colonnes) et déclenche son téléchargement dans le navigateur.
// Sert pour le bouton "Télécharger le template CSV" de chaque module.
export function downloadCsvTemplate(
  filename: string,
  headers: string[],
  sampleRows: string[][] = [],
): void {
  const csv = Papa.unparse({ fields: headers, data: sampleRows });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  // Astuce classique pour télécharger un fichier depuis le navigateur : on crée un lien invisible,
  // on simule un clic dessus, puis on le supprime.
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
