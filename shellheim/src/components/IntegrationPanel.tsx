import React, { useState, useEffect } from 'react';
import { 
  listIntegrations, 
  createIntegration, 
  deleteIntegration, 
  syncIntegration,
  getProxmoxClusterInfo
} from '../lib/api';
import type { 
  Integration, 
  CreateIntegrationRequest, 
  ProxmoxClusterInfo 
} from '../types/integration';
import { formatBytes, formatUptime } from '../types/integration';
import './IntegrationPanel.css';

interface IntegrationPanelProps {
  onClose: () => void;
  onSync?: () => void;
}

export function IntegrationPanel({ onClose, onSync }: IntegrationPanelProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ProxmoxClusterInfo | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  
  // Add form state
  const [formData, setFormData] = useState<CreateIntegrationRequest>({
    integration_type: 'proxmox',
    name: '',
    host: '',
    port: 8006,
    username: '',
    password: '',
    verify_ssl: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    try {
      setLoading(true);
      const data = await listIntegrations();
      setIntegrations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddIntegration(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await createIntegration(formData);
      setShowAddForm(false);
      setFormData({
        integration_type: 'proxmox',
        name: '',
        host: '',
        port: 8006,
        username: '',
        password: '',
        verify_ssl: false,
      });
      await loadIntegrations();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add integration');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(integration: Integration) {
    if (!confirm(`Delete integration "${integration.name}"? This will also remove all synced resources.`)) {
      return;
    }

    try {
      await deleteIntegration(integration.id);
      await loadIntegrations();
      if (selectedIntegration?.id === integration.id) {
        setSelectedIntegration(null);
        setClusterInfo(null);
      }
      onSync?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete integration');
    }
  }

  async function handleSync(integration: Integration) {
    setSyncing(integration.id);
    try {
      const result = await syncIntegration(integration.id);
      await loadIntegrations();
      onSync?.();
      alert(`Synced ${result.nodes_found} nodes, created ${result.folders_created} folders and ${result.entries_created} entries.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync integration');
    } finally {
      setSyncing(null);
    }
  }

  async function handleViewCluster(integration: Integration) {
    setSelectedIntegration(integration);
    try {
      const info = await getProxmoxClusterInfo(integration.id);
      setClusterInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cluster info');
    }
  }

  return (
    <div className="integration-panel-overlay" onClick={onClose}>
      <div className="integration-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>🔗 Integrations</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="panel-content">
          {/* Add Integration Form */}
          {showAddForm ? (
            <form className="add-form" onSubmit={handleAddIntegration}>
              <h3>Add Proxmox VE Integration</h3>
              
              {formError && <div className="form-error">{formError}</div>}
              
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Proxmox Cluster"
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Host</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={e => setFormData({ ...formData, host: e.target.value })}
                    placeholder="192.168.1.100"
                    required
                  />
                </div>
                <div className="form-group port-field">
                  <label>Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) || 8006 })}
                    min={1}
                    max={65535}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  placeholder="root@pam"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
              
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.verify_ssl}
                    onChange={e => setFormData({ ...formData, verify_ssl: e.target.checked })}
                  />
                  Verify SSL Certificate
                </label>
              </div>
              
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Connecting...' : 'Add Integration'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Integration List */}
              <div className="integrations-list">
                {loading ? (
                  <div className="loading">Loading integrations...</div>
                ) : integrations.length === 0 ? (
                  <div className="empty-state">
                    <span className="icon">🔗</span>
                    <p>No integrations configured</p>
                    <p className="hint">Add a Proxmox VE cluster to import VMs and containers</p>
                  </div>
                ) : (
                  integrations.map(integration => (
                    <div 
                      key={integration.id} 
                      className={`integration-item ${selectedIntegration?.id === integration.id ? 'selected' : ''}`}
                    >
                      <div className="integration-info" onClick={() => handleViewCluster(integration)}>
                        <div className="integration-icon">
                          {integration.integration_type === 'proxmox' ? '🖥️' : '🔗'}
                        </div>
                        <div className="integration-details">
                          <div className="integration-name">{integration.name}</div>
                          <div className="integration-meta">
                            {integration.host}:{integration.port} • 
                            <span className={`status ${integration.status}`}>
                              {integration.status}
                            </span>
                          </div>
                          {integration.last_sync_at && (
                            <div className="integration-sync">
                              Last synced: {new Date(integration.last_sync_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="integration-actions">
                        <button 
                          className="btn-icon" 
                          title="Sync Resources"
                          onClick={() => handleSync(integration)}
                          disabled={syncing === integration.id}
                        >
                          {syncing === integration.id ? '⏳' : '🔄'}
                        </button>
                        <button 
                          className="btn-icon delete" 
                          title="Delete"
                          onClick={() => handleDelete(integration)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cluster Info Panel */}
              {selectedIntegration && clusterInfo && (
                <div className="cluster-info">
                  <h3>Cluster: {selectedIntegration.name}</h3>
                  
                  <div className="cluster-stats">
                    <div className="stat">
                      <span className="stat-value">{clusterInfo.nodes.length}</span>
                      <span className="stat-label">Nodes</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{clusterInfo.running_vms}/{clusterInfo.total_vms}</span>
                      <span className="stat-label">VMs Running</span>
                    </div>
                    <div className="stat">
                      <span className="stat-value">{clusterInfo.running_containers}/{clusterInfo.total_containers}</span>
                      <span className="stat-label">CTs Running</span>
                    </div>
                  </div>

                  <div className="nodes-list">
                    <h4>Nodes</h4>
                    {clusterInfo.nodes.map(node => (
                      <div key={node.node} className="node-item">
                        <div className="node-name">
                          <span className={`node-status ${node.status}`}>●</span>
                          {node.node}
                        </div>
                        <div className="node-stats">
                          <span>CPU: {node.cpu !== null ? `${(node.cpu * 100).toFixed(1)}%` : '-'}</span>
                          <span>RAM: {formatBytes(node.mem)} / {formatBytes(node.maxmem)}</span>
                          <span>Uptime: {formatUptime(node.uptime)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="resources-summary">
                    <h4>Resources ({clusterInfo.resources.length})</h4>
                    <div className="resources-grid">
                      {clusterInfo.resources.slice(0, 10).map(resource => (
                        <div key={resource.id} className="resource-item">
                          <span className={`resource-status ${resource.status}`}>●</span>
                          <span className="resource-type">
                            {resource.resource_type === 'qemu' ? '🖥️' : '📦'}
                          </span>
                          <span className="resource-name">{resource.name}</span>
                          <span className="resource-id">ID: {resource.vmid}</span>
                        </div>
                      ))}
                      {clusterInfo.resources.length > 10 && (
                        <div className="more-resources">
                          +{clusterInfo.resources.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button className="btn-add" onClick={() => setShowAddForm(true)}>
                ➕ Add Proxmox Integration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
