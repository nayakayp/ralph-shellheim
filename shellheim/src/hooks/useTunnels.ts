import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Tunnel, TunnelStatusEvent, CreateTunnelRequest } from "../types/tunnel";
import { listTunnels, createTunnel as apiCreateTunnel, stopTunnel as apiStopTunnel } from "../lib/api";

export function useTunnels() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial tunnels
  const loadTunnels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await listTunnels();
      setTunnels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tunnels");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for tunnel status events
  useEffect(() => {
    const unsubscribe = listen<TunnelStatusEvent>("tunnel-status", (event) => {
      const { tunnelId, status, errorMessage } = event.payload;
      
      setTunnels((prev) => {
        // If tunnel stopped or errored and was removed from backend
        if (status === "stopped") {
          return prev.filter((t) => t.id !== tunnelId);
        }
        
        // Update tunnel status
        return prev.map((t) =>
          t.id === tunnelId
            ? { ...t, status, errorMessage }
            : t
        );
      });
    });

    return () => {
      unsubscribe.then((fn) => fn());
    };
  }, []);

  // Load tunnels on mount
  useEffect(() => {
    loadTunnels();
  }, [loadTunnels]);

  // Create a new tunnel
  const createTunnel = useCallback(async (request: CreateTunnelRequest): Promise<Tunnel> => {
    const tunnel = await apiCreateTunnel(request);
    setTunnels((prev) => [...prev, tunnel]);
    return tunnel;
  }, []);

  // Stop a tunnel
  const stopTunnel = useCallback(async (tunnelId: string): Promise<void> => {
    await apiStopTunnel(tunnelId);
    // The tunnel-status event will handle removing it from state
    // But we can also optimistically remove it
    setTunnels((prev) => prev.filter((t) => t.id !== tunnelId));
  }, []);

  return {
    tunnels,
    isLoading,
    error,
    createTunnel,
    stopTunnel,
    refreshTunnels: loadTunnels,
  };
}
