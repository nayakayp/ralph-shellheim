/**
 * Tag types for organizing servers/entries
 */

export interface Tag {
  id: string;
  account_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

/**
 * Tag with usage count
 */
export interface TagWithCount extends Tag {
  count: number;
}

/**
 * Predefined tag colors for selection
 */
export const TAG_COLORS = [
  '#7aa2f7', // Blue
  '#9ece6a', // Green
  '#e0af68', // Yellow/Orange
  '#f7768e', // Red/Pink
  '#bb9af7', // Purple
  '#7dcfff', // Cyan
  '#ff9e64', // Orange
  '#73daca', // Teal
  '#c0caf5', // Light gray
  '#a9b1d6', // Gray
];

/**
 * Get a contrasting text color for a background
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#1a1b26' : '#ffffff';
}

/**
 * Get default color for new tag (cycles through palette)
 */
export function getDefaultTagColor(existingTags: Tag[]): string {
  const usedColors = new Set(existingTags.map(t => t.color).filter(Boolean));
  const availableColor = TAG_COLORS.find(c => !usedColors.has(c));
  return availableColor || TAG_COLORS[existingTags.length % TAG_COLORS.length];
}
