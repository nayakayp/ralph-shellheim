// Keymap types for keyboard shortcuts

export interface Keymap {
  id: string;
  account_id: string;
  action: string;
  key: string;
  modifiers: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateKeymapRequest {
  action: string;
  key: string;
  modifiers: string;
  description?: string;
}

export interface UpdateKeymapRequest {
  key?: string;
  modifiers?: string;
  enabled?: boolean;
}

export interface DefaultKeymap {
  action: string;
  key: string;
  modifiers: string;
  description: string;
}

// Available actions for keymaps
export const KEYMAP_ACTIONS = [
  "command_palette",
  "new_connection",
  "close_tab",
  "next_tab",
  "prev_tab",
  "toggle_sidebar",
  "search_servers",
  "open_sftp",
  "open_snippets",
  "disconnect",
  "copy_terminal",
  "paste_terminal",
] as const;

export type KeymapAction = (typeof KEYMAP_ACTIONS)[number];

// Human-readable action labels
export const ACTION_LABELS: Record<KeymapAction, string> = {
  command_palette: "Command Palette",
  new_connection: "New Connection",
  close_tab: "Close Tab",
  next_tab: "Next Tab",
  prev_tab: "Previous Tab",
  toggle_sidebar: "Toggle Sidebar",
  search_servers: "Search Servers",
  open_sftp: "Open SFTP",
  open_snippets: "Open Snippets",
  disconnect: "Disconnect Session",
  copy_terminal: "Copy Selection",
  paste_terminal: "Paste",
};

// Modifier key options
export const MODIFIER_OPTIONS = [
  { value: "", label: "None" },
  { value: "ctrl", label: "Ctrl" },
  { value: "shift", label: "Shift" },
  { value: "alt", label: "Alt" },
  { value: "meta", label: "⌘ / Win" },
  { value: "ctrl+shift", label: "Ctrl + Shift" },
  { value: "ctrl+alt", label: "Ctrl + Alt" },
  { value: "ctrl+shift+alt", label: "Ctrl + Shift + Alt" },
  { value: "meta+shift", label: "⌘ + Shift" },
];

// Common key options
export const KEY_OPTIONS = [
  // Letters
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  // Numbers
  ..."0123456789".split(""),
  // Function keys
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  // Special keys
  "Tab",
  "Enter",
  "Space",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
];

/**
 * Format a keymap for display (e.g., "Ctrl + P")
 */
export function formatKeyBinding(keymap: Keymap | DefaultKeymap): string {
  const parts: string[] = [];

  if (keymap.modifiers) {
    const mods = keymap.modifiers.split("+").map((m) => {
      switch (m.toLowerCase()) {
        case "ctrl":
          return "Ctrl";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        case "meta":
          return navigator.platform.includes("Mac") ? "⌘" : "Win";
        default:
          return m;
      }
    });
    parts.push(...mods);
  }

  // Format key
  let keyDisplay = keymap.key;
  if (keymap.key === " " || keymap.key === "Space") {
    keyDisplay = "Space";
  } else if (keymap.key.length === 1) {
    keyDisplay = keymap.key.toUpperCase();
  }
  parts.push(keyDisplay);

  return parts.join(" + ");
}

/**
 * Check if a keyboard event matches a keymap
 */
export function matchesKeymap(
  event: KeyboardEvent,
  keymap: Keymap | DefaultKeymap
): boolean {
  // DefaultKeymap doesn't have enabled property, treat as enabled
  const isEnabled = 'enabled' in keymap ? keymap.enabled : true;
  if (!isEnabled) return false;

  // Check key
  const eventKey = event.key.toLowerCase();
  const keymapKey = keymap.key.toLowerCase();
  if (eventKey !== keymapKey) return false;

  // Check modifiers
  const mods = keymap.modifiers.toLowerCase().split("+").filter(Boolean);
  const hasCtrl = mods.includes("ctrl");
  const hasShift = mods.includes("shift");
  const hasAlt = mods.includes("alt");
  const hasMeta = mods.includes("meta");

  // On Mac, treat ctrl as meta for common shortcuts
  const isMac = navigator.platform.includes("Mac");
  const ctrlOrMeta = isMac ? event.metaKey : event.ctrlKey;

  if (hasCtrl && !ctrlOrMeta) return false;
  if (hasShift && !event.shiftKey) return false;
  if (hasAlt && !event.altKey) return false;
  if (hasMeta && !event.metaKey) return false;

  // Ensure no extra modifiers are pressed
  if (!hasCtrl && !hasMeta && (event.ctrlKey || (isMac && event.metaKey)))
    return false;
  if (!hasShift && event.shiftKey && keymap.key.length === 1) return false;
  if (!hasAlt && event.altKey) return false;

  return true;
}
