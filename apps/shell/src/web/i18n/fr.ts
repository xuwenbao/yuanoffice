import type { zh } from './zh'

export const fr = {
  home: 'Accueil',
  browse: 'Parcourir',
  empty: 'Ce dossier ne contient aucun fichier',
  close: 'Fermer',
  unsaved: 'Ce document a des modifications non enregistrées. Enregistrer, abandonner ou annuler.',
  dirty: 'Non enregistré',
  save: 'Enregistrer',
  discard: 'Abandonner',
  cancel: 'Annuler',
  failed: 'Impossible de lire ce dossier'
} satisfies Record<keyof typeof zh, string>