import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, FastForward, Rewind, Stop } from "@phosphor-icons/react";
import type { Recording } from "../types/recording";
import { formatDuration } from "../types/recording";
import { getRecordingContent } from "../lib/api";
import "./RecordingPlayer.css";

interface RecordingPlayerProps {
  recording: Recording;
  onClose: () => void;
}

interface AsciicastEvent {
  time: number;
  type: "o" | "i";
  data: string;
}

interface AsciicastHeader {
  version: number;
  width: number;
  height: number;
  timestamp?: number;
}

export function RecordingPlayer({ recording, onClose }: RecordingPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<AsciicastEvent[]>([]);
  const [header, setHeader] = useState<AsciicastHeader | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [terminalContent, setTerminalContent] = useState("");
  
  const terminalRef = useRef<HTMLPreElement>(null);
  const playbackRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Parse asciinema v2 format
  const parseAsciicast = useCallback((content: string) => {
    const lines = content.trim().split("\n");
    if (lines.length < 2) throw new Error("Invalid recording format");

    // First line is header
    const headerData = JSON.parse(lines[0]) as AsciicastHeader;
    
    // Remaining lines are events
    const eventData: AsciicastEvent[] = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const [time, type, data] = JSON.parse(lines[i]) as [number, string, string];
        if (type === "o" || type === "i") {
          eventData.push({ time, type, data });
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { header: headerData, events: eventData };
  }, []);

  useEffect(() => {
    const loadContent = async () => {
      try {
        setIsLoading(true);
        setError("");
        const content = await getRecordingContent(recording.id);
        const { header, events } = parseAsciicast(content);
        setHeader(header);
        setEvents(events);
        setIsPlaying(true); // Auto-play
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recording");
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [recording.id, parseAsciicast]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || events.length === 0) return;

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const delta = (timestamp - lastFrameTimeRef.current) / 1000 * speed;
      lastFrameTimeRef.current = timestamp;

      setCurrentTime((prev) => {
        const newTime = prev + delta;
        
        // Find and apply all events up to newTime
        let newContent = terminalContent;
        let updated = false;
        
        for (const event of events) {
          if (event.time > prev && event.time <= newTime && event.type === "o") {
            newContent += event.data;
            updated = true;
          }
        }

        if (updated) {
          setTerminalContent(newContent);
        }

        // Check if playback is complete
        const lastEvent = events[events.length - 1];
        if (lastEvent && newTime >= lastEvent.time) {
          setIsPlaying(false);
          return lastEvent.time;
        }

        return newTime;
      });

      playbackRef.current = requestAnimationFrame(animate);
    };

    playbackRef.current = requestAnimationFrame(animate);

    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
      }
    };
  }, [isPlaying, events, speed, terminalContent]);

  // Reset lastFrameTimeRef when starting/stopping
  useEffect(() => {
    if (!isPlaying) {
      lastFrameTimeRef.current = 0;
    }
  }, [isPlaying]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalContent]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setTerminalContent("");
    lastFrameTimeRef.current = 0;
  };

  const handleSeek = (time: number) => {
    setIsPlaying(false);
    setCurrentTime(time);
    
    // Rebuild terminal content up to this time
    let content = "";
    for (const event of events) {
      if (event.time <= time && event.type === "o") {
        content += event.data;
      }
    }
    setTerminalContent(content);
    lastFrameTimeRef.current = 0;
  };

  const handleRewind = () => {
    handleSeek(Math.max(0, currentTime - 5));
  };

  const handleFastForward = () => {
    const maxTime = events.length > 0 ? events[events.length - 1].time : 0;
    handleSeek(Math.min(maxTime, currentTime + 5));
  };

  const duration = recording.duration_secs || (events.length > 0 ? events[events.length - 1].time : 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="recording-player-overlay" onClick={onClose}>
      <div className="recording-player" onClick={(e) => e.stopPropagation()}>
        <div className="player-header">
          <h3>{recording.name}</h3>
          <button className="player-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="player-loading">
            <div className="spinner" />
            <p>Loading recording...</p>
          </div>
        ) : error ? (
          <div className="player-error">{error}</div>
        ) : (
          <>
            <div 
              className="player-terminal"
              style={{
                width: header?.width ? `${header.width}ch` : "100%",
                minHeight: header?.height ? `${header.height * 1.2}em` : "300px"
              }}
            >
              <pre ref={terminalRef}>{terminalContent || " "}</pre>
            </div>

            <div className="player-controls">
              <div className="player-progress">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek(parseFloat(e.target.value))}
                  style={{ "--progress": `${progress}%` } as React.CSSProperties}
                />
                <div className="player-time">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>

              <div className="player-buttons">
                <button onClick={handleRewind} title="Rewind 5s">
                  <Rewind size={18} />
                </button>
                <button className="play-btn" onClick={handlePlayPause}>
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <button onClick={handleFastForward} title="Forward 5s">
                  <FastForward size={18} />
                </button>
                <button onClick={handleStop} title="Stop">
                  <Stop size={18} />
                </button>
                
                <select
                  className="speed-select"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                >
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                  <option value="4">4x</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
