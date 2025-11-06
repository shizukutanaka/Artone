/**
 * Cloud Storage Integration System for Artone Video Editor
 * Seamless cloud backup, version history, and multi-device sync
 */

import { backupSystem } from '../backup/backup-system.js';

export class CloudStorageManager {
  constructor() {
    this.providers = new Map();
    this.currentProvider = null;
    this.syncInterval = 30000; // 30 seconds
    this.maxVersions = 50;
    this.autoBackup = true;

    // Supported providers
    this.registerProvider('dropbox', new DropboxProvider());
    this.registerProvider('google-drive', new GoogleDriveProvider());
    this.registerProvider('onedrive', new OneDriveProvider());
    this.registerProvider('aws-s3', new S3Provider());

    this.initialize();
  }

  initialize() {
    this.setupEventListeners();
    this.loadSettings();

    if (this.autoBackup) {
      this.startAutoSync();
    }
  }

  registerProvider(name, provider) {
    this.providers.set(name, provider);
  }

  async connectProvider(providerName, credentials) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    try {
      await provider.authenticate(credentials);
      this.currentProvider = provider;
      this.emit('provider-connected', { providerName });

      // Load existing projects from cloud
      await this.loadProjectsFromCloud();
    } catch (error) {
      this.emit('provider-connection-error', { providerName, error: error.message });
      throw error;
    }
  }

  async disconnectProvider() {
    if (this.currentProvider) {
      await this.currentProvider.disconnect();
      this.currentProvider = null;
      this.emit('provider-disconnected');
    }
  }

  async uploadProject(projectId, projectData) {
    if (!this.currentProvider) {
      throw new Error('No cloud provider connected');
    }

    try {
      const versionId = await this.currentProvider.uploadProject(projectId, projectData);
      await this.saveVersionHistory(projectId, versionId);

      this.emit('project-uploaded', { projectId, versionId });
      return versionId;
    } catch (error) {
      this.emit('upload-error', { projectId, error: error.message });
      throw error;
    }
  }

  async downloadProject(projectId, versionId = null) {
    if (!this.currentProvider) {
      throw new Error('No cloud provider connected');
    }

    try {
      const projectData = await this.currentProvider.downloadProject(projectId, versionId);
      this.emit('project-downloaded', { projectId, versionId });

      return projectData;
    } catch (error) {
      this.emit('download-error', { projectId, error: error.message });
      throw error;
    }
  }

  async listProjects() {
    if (!this.currentProvider) {
      return [];
    }

    try {
      return await this.currentProvider.listProjects();
    } catch (error) {
      this.emit('list-error', { error: error.message });
      return [];
    }
  }

  async getVersionHistory(projectId) {
    if (!this.currentProvider) {
      return [];
    }

    try {
      return await this.currentProvider.getVersionHistory(projectId);
    } catch (error) {
      this.emit('version-history-error', { projectId, error: error.message });
      return [];
    }
  }

  async deleteProject(projectId) {
    if (!this.currentProvider) {
      throw new Error('No cloud provider connected');
    }

    try {
      await this.currentProvider.deleteProject(projectId);
      await this.removeVersionHistory(projectId);

      this.emit('project-deleted', { projectId });
    } catch (error) {
      this.emit('delete-error', { projectId, error: error.message });
      throw error;
    }
  }

  async saveVersionHistory(projectId, versionId) {
    const history = this.getLocalVersionHistory(projectId) || [];
    history.unshift({
      versionId,
      timestamp: Date.now(),
      size: this.estimateProjectSize()
    });

    // Keep only recent versions
    if (history.length > this.maxVersions) {
      history.splice(this.maxVersions);
    }

    localStorage.setItem(`artone-version-history-${projectId}`, JSON.stringify(history));
  }

  getLocalVersionHistory(projectId) {
    try {
      const history = localStorage.getItem(`artone-version-history-${projectId}`);
      return history ? JSON.parse(history) : [];
    } catch {
      return [];
    }
  }

  async removeVersionHistory(projectId) {
    localStorage.removeItem(`artone-version-history-${projectId}`);
  }

  async loadProjectsFromCloud() {
    const projects = await this.listProjects();
    this.emit('cloud-projects-loaded', { projects });
  }

  startAutoSync() {
    this.syncTimer = setInterval(async () => {
      if (this.currentProvider && this.autoBackup) {
        try {
          // Get current project data
          const projectData = this.getCurrentProjectData();
          if (projectData) {
            await this.uploadProject(projectData.id, projectData);
          }
        } catch (error) {
          console.warn('Auto-sync failed:', error);
        }
      }
    }, this.syncInterval);
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  getCurrentProjectData() {
    // Get current project data from the editor state
    // This would integrate with the main editor
    const event = new CustomEvent('get-current-project-data');
    window.dispatchEvent(event);

    return event.detail || null;
  }

  estimateProjectSize() {
    // Estimate project size for version history
    return 1024 * 1024; // 1MB placeholder
  }

  setupEventListeners() {
    window.addEventListener('project-saved', async (event) => {
      if (this.autoBackup) {
        try {
          await this.uploadProject(event.detail.projectId, event.detail.projectData);
        } catch (error) {
          console.warn('Failed to backup project:', error);
        }
      }
    });

    window.addEventListener('cloud-sync-requested', async (event) => {
      await this.loadProjectsFromCloud();
    });
  }

  emit(event, data) {
    window.dispatchEvent(new CustomEvent(`cloud-storage-${event}`, { detail: data }));
  }

  loadSettings() {
    try {
      const settings = localStorage.getItem('artone-cloud-settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        this.autoBackup = parsed.autoBackup ?? true;
        this.syncInterval = parsed.syncInterval ?? 30000;
        this.maxVersions = parsed.maxVersions ?? 50;
      }
    } catch {
      // Use defaults
    }
  }

  saveSettings() {
    const settings = {
      autoBackup: this.autoBackup,
      syncInterval: this.syncInterval,
      maxVersions: this.maxVersions
    };

    localStorage.setItem('artone-cloud-settings', JSON.stringify(settings));
  }

  getConnectedProviders() {
    return Array.from(this.providers.keys());
  }

  isConnected() {
    return this.currentProvider !== null;
  }

  destroy() {
    this.stopAutoSync();
    this.disconnectProvider();
  }
}

// Provider base class
class CloudProvider {
  constructor(name) {
    this.name = name;
    this.isAuthenticated = false;
  }

  async authenticate(credentials) {
    throw new Error('authenticate method must be implemented');
  }

  async disconnect() {
    this.isAuthenticated = false;
  }

  async uploadProject(projectId, projectData) {
    throw new Error('uploadProject method must be implemented');
  }

  async downloadProject(projectId, versionId) {
    throw new Error('downloadProject method must be implemented');
  }

  async listProjects() {
    throw new Error('listProjects method must be implemented');
  }

  async deleteProject(projectId) {
    throw new Error('deleteProject method must be implemented');
  }

  async getVersionHistory(projectId) {
    return [];
  }
}

// Dropbox Provider
class DropboxProvider extends CloudProvider {
  constructor() {
    super('dropbox');
    this.client = null;
  }

  async authenticate(credentials) {
    // Dropbox OAuth integration
    this.client = new Dropbox.Dropbox({
      accessToken: credentials.accessToken
    });
    this.isAuthenticated = true;
  }

  async uploadProject(projectId, projectData) {
    const path = `/artone-projects/${projectId}.json`;
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });

    const response = await this.client.filesUpload({
      path,
      contents: blob,
      mode: { '.tag': 'overwrite' }
    });

    return response.result.rev;
  }

  async downloadProject(projectId, versionId) {
    const path = `/artone-projects/${projectId}.json`;

    try {
      const response = await this.client.filesDownload({ path });
      const blob = response.result.fileBlob;
      const text = await blob.text();
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Failed to download project: ${error.message}`);
    }
  }

  async listProjects() {
    const response = await this.client.filesListFolder({
      path: '/artone-projects'
    });

    return response.result.entries.map(entry => ({
      id: entry.name.replace('.json', ''),
      name: entry.name,
      modified: entry.server_modified,
      size: entry.size
    }));
  }

  async deleteProject(projectId) {
    const path = `/artone-projects/${projectId}.json`;
    await this.client.filesDeleteV2({ path });
  }
}

// Google Drive Provider
class GoogleDriveProvider extends CloudProvider {
  constructor() {
    super('google-drive');
    this.accessToken = null;
  }

  async authenticate(credentials) {
    this.accessToken = credentials.accessToken;
    this.isAuthenticated = true;
  }

  async uploadProject(projectId, projectData) {
    // Google Drive API integration
    const metadata = {
      name: `${projectId}.json`,
      parents: [credentials.folderId || 'root']
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(projectData)], { type: 'application/json' }));

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.id;
  }

  async downloadProject(projectId, versionId) {
    const fileId = versionId || await this.findFileId(projectId);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const text = await response.text();
    return JSON.parse(text);
  }

  async listProjects() {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name%20contains%20'.json'%20and%20trashed%20%3D%20false&fields=files(id,name,modifiedTime,size)`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const result = await response.json();
    return result.files.map(file => ({
      id: file.name.replace('.json', ''),
      name: file.name,
      modified: file.modifiedTime,
      size: parseInt(file.size || 0)
    }));
  }

  async deleteProject(projectId) {
    const fileId = await this.findFileId(projectId);
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
  }

  async findFileId(projectId) {
    // Find file ID for project
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=name%20%3D%20'${projectId}.json'`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const result = await response.json();
    return result.files[0]?.id;
  }
}

// OneDrive Provider
class OneDriveProvider extends CloudProvider {
  constructor() {
    super('onedrive');
    this.accessToken = null;
  }

  async authenticate(credentials) {
    this.accessToken = credentials.accessToken;
    this.isAuthenticated = true;
  }

  async uploadProject(projectId, projectData) {
    // OneDrive API integration
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Artone/Projects/${projectId}.json:/content`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(projectData)
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.id;
  }

  async downloadProject(projectId, versionId) {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Artone/Projects/${projectId}.json:/content`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const text = await response.text();
    return JSON.parse(text);
  }

  async listProjects() {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Artone/Projects:/children`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    const result = await response.json();
    return result.value.map(file => ({
      id: file.name.replace('.json', ''),
      name: file.name,
      modified: file.lastModifiedDateTime,
      size: file.size
    }));
  }

  async deleteProject(projectId) {
    await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/Artone/Projects/${projectId}.json:`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
  }
}

// AWS S3 Provider
class S3Provider extends CloudProvider {
  constructor() {
    super('aws-s3');
    this.s3Client = null;
  }

  async authenticate(credentials) {
    // AWS S3 integration
    this.s3Client = new AWS.S3({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region
    });
    this.isAuthenticated = true;
  }

  async uploadProject(projectId, projectData) {
    const params = {
      Bucket: credentials.bucket,
      Key: `projects/${projectId}.json`,
      Body: JSON.stringify(projectData),
      ContentType: 'application/json'
    };

    const response = await this.s3Client.putObject(params).promise();
    return response.VersionId;
  }

  async downloadProject(projectId, versionId) {
    const params = {
      Bucket: credentials.bucket,
      Key: `projects/${projectId}.json`,
      VersionId: versionId
    };

    const response = await this.s3Client.getObject(params).promise();
    return JSON.parse(response.Body.toString());
  }

  async listProjects() {
    const params = {
      Bucket: credentials.bucket,
      Prefix: 'projects/'
    };

    const response = await this.s3Client.listObjectVersions(params).promise();
    return response.Versions.map(version => ({
      id: version.Key.replace('projects/', '').replace('.json', ''),
      name: version.Key,
      modified: version.LastModified,
      size: version.Size
    }));
  }

  async deleteProject(projectId) {
    const params = {
      Bucket: credentials.bucket,
      Key: `projects/${projectId}.json`
    };

    await this.s3Client.deleteObject(params).promise();
  }
}

// Export singleton instance
export const cloudStorageManager = new CloudStorageManager();

export default CloudStorageManager;
