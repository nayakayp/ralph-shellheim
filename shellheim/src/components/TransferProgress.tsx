import { useEffect, useState } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { TransferProgress as TransferProgressType, ActiveTransfer } from '../types/sftp';
import { formatFileSize } from '../types/sftp';
import './TransferProgress.css';

interface TransferProgressProps {
  transfers: ActiveTransfer[];
  onClear: (id: string) => void;
  onClearAll: () => void;
}

export function TransferProgress({ transfers, onClear, onClearAll }: TransferProgressProps) {
  if (transfers.length === 0) return null;

  const activeCount = transfers.filter(t => t.status === 'transferring').length;
  const completedCount = transfers.filter(t => t.status === 'completed').length;
  const errorCount = transfers.filter(t => t.status === 'error').length;

  return (
    <div className="transfer-progress-panel">
      <div className="tp-header">
        <div className="tp-title">
          <span className="tp-icon">📤</span>
          <span>Transfers</span>
          {activeCount > 0 && (
            <span className="tp-badge active">{activeCount}</span>
          )}
          {completedCount > 0 && (
            <span className="tp-badge completed">{completedCount}</span>
          )}
          {errorCount > 0 && (
            <span className="tp-badge error">{errorCount}</span>
          )}
        </div>
        {transfers.length > 0 && (
          <button 
            className="tp-clear-all" 
            onClick={onClearAll}
            title="Clear all"
          >
            Clear
          </button>
        )}
      </div>

      <div className="tp-list">
        {transfers.map(transfer => (
          <div 
            key={transfer.id} 
            className={`tp-item ${transfer.status}`}
          >
            <div className="tp-item-header">
              <span className="tp-direction">
                {transfer.direction === 'upload' ? '↑' : '↓'}
              </span>
              <span className="tp-filename" title={transfer.fileName}>
                {transfer.fileName}
              </span>
              {transfer.status !== 'transferring' && (
                <button 
                  className="tp-dismiss"
                  onClick={() => onClear(transfer.id)}
                  title="Dismiss"
                >
                  ×
                </button>
              )}
            </div>

            {transfer.status === 'transferring' && (
              <div className="tp-progress-bar">
                <div 
                  className="tp-progress-fill"
                  style={{ width: `${transfer.percent}%` }}
                />
              </div>
            )}

            <div className="tp-item-footer">
              {transfer.status === 'transferring' ? (
                <>
                  <span className="tp-size">
                    {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.totalBytes)}
                  </span>
                  <span className="tp-percent">{transfer.percent.toFixed(0)}%</span>
                </>
              ) : transfer.status === 'completed' ? (
                <span className="tp-status-text completed">
                  ✓ Completed ({formatFileSize(transfer.totalBytes)})
                </span>
              ) : (
                <span className="tp-status-text error" title={transfer.error || ''}>
                  ✗ {transfer.error || 'Failed'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hook to listen for transfer progress events
export function useTransferProgress() {
  const [transfers, setTransfers] = useState<Map<string, ActiveTransfer>>(new Map());

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<TransferProgressType>('sftp_transfer_progress', (event) => {
        const progress = event.payload;
        
        setTransfers(prev => {
          const next = new Map(prev);
          
          const existing = next.get(progress.transfer_id);
          next.set(progress.transfer_id, {
            id: progress.transfer_id,
            fileName: progress.file_name,
            direction: existing?.direction || 'upload', // Preserve direction
            bytesTransferred: progress.bytes_transferred,
            totalBytes: progress.total_bytes,
            percent: progress.percent,
            status: progress.status as ActiveTransfer['status'],
            error: progress.error,
            startedAt: existing?.startedAt || new Date(),
          });
          
          return next;
        });
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const addTransfer = (id: string, fileName: string, direction: 'upload' | 'download') => {
    setTransfers(prev => {
      const next = new Map(prev);
      next.set(id, {
        id,
        fileName,
        direction,
        bytesTransferred: 0,
        totalBytes: 0,
        percent: 0,
        status: 'transferring',
        error: null,
        startedAt: new Date(),
      });
      return next;
    });
  };

  const clearTransfer = (id: string) => {
    setTransfers(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const clearCompleted = () => {
    setTransfers(prev => {
      const next = new Map(prev);
      for (const [id, transfer] of next) {
        if (transfer.status !== 'transferring') {
          next.delete(id);
        }
      }
      return next;
    });
  };

  return {
    transfers: Array.from(transfers.values()).sort((a, b) => 
      b.startedAt.getTime() - a.startedAt.getTime()
    ),
    addTransfer,
    clearTransfer,
    clearCompleted,
  };
}
