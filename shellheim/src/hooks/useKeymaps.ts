import { useState, useEffect, useCallback, useRef } from "react";
import { Keymap, matchesKeymap, KeymapAction } from "../types/keymap";
import { listKeymaps } from "../lib/api";

interface UseKeymapsOptions {
  enabled?: boolean;
}

interface KeymapHandler {
  (action: KeymapAction, event: KeyboardEvent): void;
}

/**
 * Hook for loading and using customizable keyboard shortcuts
 */
export function useKeymaps(
  onAction: KeymapHandler,
  options: UseKeymapsOptions = {}
) {
  const { enabled = true } = options;
  const [keymaps, setKeymaps] = useState<Keymap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const onActionRef = useRef(onAction);

  // Update ref when handler changes
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  // Load keymaps on mount
  useEffect(() => {
    let mounted = true;

    const loadKeymaps = async () => {
      try {
        const data = await listKeymaps();
        if (mounted) {
          setKeymaps(data);
          setError(null);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Failed to load keymaps");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadKeymaps();

    return () => {
      mounted = false;
    };
  }, []);

  // Set up global keyboard listener
  useEffect(() => {
    if (!enabled || loading || keymaps.length === 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if focus is on input/textarea (except for specific overrides)
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Allow some shortcuts even in inputs
      const allowInInput = ["command_palette", "toggle_sidebar"];

      for (const keymap of keymaps) {
        if (!keymap.enabled) continue;

        // Skip input-blocking shortcuts when in input
        if (isInput && !allowInInput.includes(keymap.action)) {
          continue;
        }

        if (matchesKeymap(event, keymap)) {
          event.preventDefault();
          event.stopPropagation();
          onActionRef.current(keymap.action as KeymapAction, event);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [enabled, loading, keymaps]);

  // Function to refresh keymaps
  const refresh = useCallback(async () => {
    try {
      const data = await listKeymaps();
      setKeymaps(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh keymaps");
    }
  }, []);

  // Get a specific keymap by action
  const getKeymap = useCallback(
    (action: KeymapAction): Keymap | undefined => {
      return keymaps.find((k) => k.action === action);
    },
    [keymaps]
  );

  return {
    keymaps,
    loading,
    error,
    refresh,
    getKeymap,
  };
}
