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

/**
 * Version stricte de parseCsvFile, réservée aux imports où une seule ligne invalide doit annuler
 * tout l'import (ex: Risk Scorer, où un score hors limites fausserait le calcul sans que personne
 * ne le remarque). Contrairement à parseCsvFile :
 * - vérifie d'abord que toutes les colonnes attendues (requiredColumns) sont bien dans l'en-tête,
 * - si mapRow plante sur une ligne, rejette TOUT l'import avec un message qui cite le numéro de
 *   ligne exact, tel qu'on le verrait en ouvrant le fichier dans un tableur (la ligne 1 est l'en-tête),
 * - renvoie aussi ce numéro de ligne pour chaque ligne importée avec succès, pour que l'appelant
 *   puisse lui-même citer des numéros de ligne dans ses propres vérifications (ex: doublon d'id).
 *
 * "skipEmptyLines" n'est volontairement PAS activé ici : Papaparse garde alors toutes les lignes du
 * fichier dans results.data, dans l'ordre, donc l'index correspond exactement au numéro de ligne
 * réel. Une ligne entièrement vide (souvent juste la dernière ligne du fichier) est repérée et
 * ignorée nous-mêmes, sans décaler la numérotation des lignes suivantes.
 */
export function parseCsvFileStrict<T>(
  file: File,
  mapRow: (row: Record<string, string>) => T,
  requiredColumns: string[],
): Promise<{ line: number; data: T }[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: false,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const missingColumns = requiredColumns.filter((column) => !fields.includes(column));
        if (missingColumns.length > 0) {
          const label = missingColumns.length > 1 ? 'Colonnes manquantes' : 'Colonne manquante';
          reject(new Error(`${label} dans le fichier : ${missingColumns.join(', ')}.`));
          return;
        }

        // Une ligne entièrement vide (souvent juste la dernière ligne du fichier, à cause d'un
        // retour à la ligne final) n'est pas une erreur. "row" est undefined quand on ne connaît
        // pas la ligne concernée : dans ce cas on ne la considère PAS comme vide, pour ne jamais
        // avaler une vraie erreur par excès de prudence.
        const isBlankRow = (row: Record<string, string> | undefined): boolean =>
          row !== undefined && Object.values(row).every((value) => !value || value.trim() === '');

        // Une erreur de structure détectée par Papaparse elle-même (ex: guillemet non fermé) : on
        // la remonte avec un numéro de ligne, SAUF si elle porte sur une ligne vide. Papaparse
        // signale "trop peu de champs" sur la ligne vide finale d'un fichier normal, ce qui ferait
        // rejeter à tort la quasi-totalité des fichiers CSV (ils se terminent presque tous par un
        // retour à la ligne).
        const structuralErrors = results.errors.filter((err) => !isBlankRow(results.data[err.row ?? -1]));
        if (structuralErrors.length > 0) {
          const firstError = structuralErrors[0];
          const line = typeof firstError.row === 'number' ? firstError.row + 2 : undefined;
          reject(
            new Error(
              line !== undefined
                ? `Ligne ${line} : fichier CSV mal formé (${firstError.message}).`
                : `Fichier CSV mal formé (${firstError.message}).`,
            ),
          );
          return;
        }

        const rows: { line: number; data: T }[] = [];
        for (let i = 0; i < results.data.length; i++) {
          const raw = results.data[i];
          const line = i + 2; // la ligne 1 est l'en-tête, la 1re ligne de données est la ligne 2

          if (isBlankRow(raw)) continue;

          try {
            rows.push({ line, data: mapRow(raw) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            reject(new Error(`Ligne ${line} : ${message}`));
            return;
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
