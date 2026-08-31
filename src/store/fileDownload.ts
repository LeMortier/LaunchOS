// Les deux petites briques partagées par tout ce qui produit un fichier téléchargeable dans LaunchOS :
// le rapport PDF, les templates CSV, et l'export du projet complet en JSON. Elles sont ici pour que
// ces trois-là nomment et téléchargent leurs fichiers exactement de la même façon, au lieu de
// réécrire le même bout de code dans leur coin.

// Fabrique un nom de fichier propre (sans accents ni caractères spéciaux, sinon certains systèmes
// d'exploitation ou navigateurs peuvent mal le gérer) à partir du titre du rapport, suivi de la date
// du jour. Si le titre est vide, on retombe sur un nom générique plutôt que de produire un nom bizarre.
// L'extension est passée en paramètre : le PDF et l'export du projet partagent ainsi le même nom, à
// l'extension près, ce qui aide à retrouver les deux fichiers d'un même lancement côte à côte.
export function buildTimestampedFilename(title: string, extension: string): string {
  const dateStr = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ : se trie bien, pas d'ambiguïté
  const slug = title
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // enlève les accents (é -> e, è -> e...)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || 'rapport-de-lancement'}-${dateStr}.${extension}`;
}

// Déclenche le téléchargement d'un contenu texte fabriqué dans le navigateur (un CSV, un JSON...).
// Astuce classique : on crée un lien invisible qui pointe vers le contenu, on simule un clic dessus,
// puis on le supprime. revokeObjectURL libère la mémoire prise par le contenu une fois le clic parti.
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
