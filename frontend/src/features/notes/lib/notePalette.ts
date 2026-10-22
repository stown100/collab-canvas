import { NoteColor } from '@/shared/store/notesStore';

interface NoteSwatch {
  label: string;
  /** Card background. */
  bg: string;
  border: string;
  /** Saturated tone: color picker ring, border of the focused card. */
  accent: string;
}

// Sticky-note pastels, from the same Tailwind-like scale as the board colors.
export const NOTE_PALETTE: Record<NoteColor, NoteSwatch> = {
  [NoteColor.YELLOW]: { label: 'Yellow', bg: '#FEF9C3', border: '#FDE68A', accent: '#EAB308' },
  [NoteColor.GREEN]: { label: 'Green', bg: '#DCFCE7', border: '#BBF7D0', accent: '#22C55E' },
  [NoteColor.BLUE]: { label: 'Blue', bg: '#DBEAFE', border: '#BFDBFE', accent: '#3B82F6' },
  [NoteColor.PURPLE]: { label: 'Purple', bg: '#EDE9FE', border: '#DDD6FE', accent: '#8B5CF6' },
  [NoteColor.PINK]: { label: 'Pink', bg: '#FCE7F3', border: '#FBCFE8', accent: '#EC4899' },
  [NoteColor.ORANGE]: { label: 'Orange', bg: '#FFEDD5', border: '#FED7AA', accent: '#F97316' },
};

export const NOTE_COLORS = Object.values(NoteColor);
