export const LIBRARY_ACTION_COMMANDS = {
  draw: 'ManualLibraryDraw',
  shuffle: 'ManualLibraryShuffle',
  look: 'ManualLibraryLook',
  stopLooking: 'ManualLibraryStopLooking',
} as const;
export type LibraryAction = keyof typeof LIBRARY_ACTION_COMMANDS;

export interface LibrarySearchRequest {
  count: number;
  destination: 'Hand' | 'Battlefield' | 'Graveyard' | 'Exile' | 'Library';
  filter?: { types?: string; subtypes?: string[]; supertypes?: string };
  reveal: boolean;
  shuffleAfter: boolean;
  tapped: boolean;
  where: 'Default' | 'Top' | 'Bottom';
}
