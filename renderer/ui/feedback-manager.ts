import { log } from '@/utils/production-logger';

interface FeedbackItem {
  id: string;
  type: 'bug' | 'feature' | 'improvement' | 'question' | 'praise';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  userId?: string;
  userEmail?: string;
  userAgent: string;
  url: string;
  timestamp: number;
  status: 'new' | 'in-review' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  attachments?: string[];
  metadata: Record<string, any>;
}

interface FeedbackConfig {
  enableCollection: boolean;
  enableScreenshots: boolean;
  enableUserContact: boolean;
  requireContactInfo: boolean;
  maxDescriptionLength: number;
  allowedFileTypes: string[];
  maxFileSize: number;
  categories: string[];
  autoSubmit: boolean;
}

interface FeedbackStats {
  totalFeedback: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  averageResolutionTime: number;
  satisfactionScore: number;
}

class FeedbackManager {
  private config: FeedbackConfig;
  private feedbackItems: FeedbackItem[] = [];

  private readonly defaultConfig: FeedbackConfig = {
    enableCollection: true,
    enableScreenshots: true,
    enableUserContact: true,
    requireContactInfo: false,
    maxDescriptionLength: 2000,
    allowedFileTypes: ['image/png', 'image/jpeg', 'image/gif', 'text/plain'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    categories: ['bug', 'feature', 'ui', 'performance', 'usability', 'other'],
    autoSubmit: false
  };

  constructor() {
    this.config = { ...this.defaultConfig };
    this.initializeFeedbackSystem();
  }

  private initializeFeedbackSystem(): void {
    if (!this.config.enableCollection) return;

    this.loadFeedbackItems();
    this.setupFeedbackWidget();
    this.setupKeyboardShortcuts();
  }

  private setupFeedbackWidget(): void {
    // Create feedback button
    const feedbackButton = document.createElement('button');
    feedbackButton.id = 'feedback-button';
    feedbackButton.className = 'fixed bottom-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-indigo-700 transition-colors z-50 flex items-center';

    // Create SVG icon programmatically
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
    svg.appendChild(path);

    const span = document.createElement('span');
    span.className = 'ml-2';
    span.textContent = 'Feedback';

    feedbackButton.appendChild(svg);
    feedbackButton.appendChild(span);

    feedbackButton.addEventListener('click', () => {
      this.showFeedbackDialog();
    });

    document.body.appendChild(feedbackButton);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Ctrl/Cmd + F to open feedback
      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && event.shiftKey) {
        event.preventDefault();
        this.showFeedbackDialog();
      }
    });
  }

  public showFeedbackDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'feedback-dialog';
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

    // Create dialog content programmatically
    const dialogContent = document.createElement('div');
    dialogContent.className = 'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto';

    const dialogInner = document.createElement('div');
    dialogInner.className = 'p-6';

    // Header
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-4';

    const title = document.createElement('h2');
    title.className = 'text-xl font-semibold text-gray-900';
    title.textContent = 'Send Feedback';

    const closeButton = document.createElement('button');
    closeButton.id = 'close-feedback';
    closeButton.className = 'text-gray-400 hover:text-gray-600';

    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('class', 'w-6 h-6');
    closeSvg.setAttribute('fill', 'none');
    closeSvg.setAttribute('stroke', 'currentColor');
    closeSvg.setAttribute('viewBox', '0 0 24 24');

    const closePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closePath.setAttribute('stroke-linecap', 'round');
    closePath.setAttribute('stroke-linejoin', 'round');
    closePath.setAttribute('stroke-width', '2');
    closePath.setAttribute('d', 'M6 18L18 6M6 6l12 12');

    closeSvg.appendChild(closePath);
    closeButton.appendChild(closeSvg);
    header.appendChild(title);
    header.appendChild(closeButton);
    dialogInner.appendChild(header);

    // Form
    const form = document.createElement('form');
    form.id = 'feedback-form';
    form.className = 'space-y-4';

    // Type select
    const typeDiv = document.createElement('div');
    const typeLabel = document.createElement('label');
    typeLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    typeLabel.textContent = 'Type';

    const typeSelect = document.createElement('select');
    typeSelect.id = 'feedback-type';
    typeSelect.className = 'w-full border border-gray-300 rounded-md px-3 py-2';

    const typeOptions = ['bug', 'feature', 'improvement', 'question', 'praise'];
    typeOptions.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option.charAt(0).toUpperCase() + option.slice(1);
      typeSelect.appendChild(optionElement);
    });

    typeDiv.appendChild(typeLabel);
    typeDiv.appendChild(typeSelect);
    form.appendChild(typeDiv);

    // Category select
    const categoryDiv = document.createElement('div');
    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    categoryLabel.textContent = 'Category';

    const categorySelect = document.createElement('select');
    categorySelect.id = 'feedback-category';
    categorySelect.className = 'w-full border border-gray-300 rounded-md px-3 py-2';

    this.config.categories.forEach(cat => {
      const optionElement = document.createElement('option');
      optionElement.value = cat;
      optionElement.textContent = cat;
      categorySelect.appendChild(optionElement);
    });

    categoryDiv.appendChild(categoryLabel);
    categoryDiv.appendChild(categorySelect);
    form.appendChild(categoryDiv);

    // Title input
    const titleDiv = document.createElement('div');
    const titleLabel = document.createElement('label');
    titleLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    titleLabel.textContent = 'Title';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'feedback-title';
    titleInput.className = 'w-full border border-gray-300 rounded-md px-3 py-2';
    titleInput.maxLength = 100;
    titleInput.required = true;

    titleDiv.appendChild(titleLabel);
    titleDiv.appendChild(titleInput);
    form.appendChild(titleDiv);

    // Description textarea
    const descDiv = document.createElement('div');
    const descLabel = document.createElement('label');
    descLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    descLabel.textContent = 'Description';

    const descTextarea = document.createElement('textarea');
    descTextarea.id = 'feedback-description';
    descTextarea.className = 'w-full border border-gray-300 rounded-md px-3 py-2 h-32 resize-none';
    descTextarea.maxLength = this.config.maxDescriptionLength;
    descTextarea.required = true;

    const descHint = document.createElement('div');
    descHint.className = 'text-xs text-gray-500 mt-1';
    const charCount = document.createElement('span');
    charCount.id = 'char-count';
    charCount.textContent = '0';
    descHint.appendChild(charCount);
    descHint.appendChild(document.createTextNode(`/${this.config.maxDescriptionLength} characters`));

    descDiv.appendChild(descLabel);
    descDiv.appendChild(descTextarea);
    descDiv.appendChild(descHint);
    form.appendChild(descDiv);

    // Contact info (if enabled)
    if (this.config.enableUserContact) {
      const contactDiv = document.createElement('div');
      contactDiv.className = 'grid grid-cols-2 gap-4';

      const nameDiv = document.createElement('div');
      const nameLabel = document.createElement('label');
      nameLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
      nameLabel.textContent = 'Name (optional)';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'feedback-name';
      nameInput.className = 'w-full border border-gray-300 rounded-md px-3 py-2';

      nameDiv.appendChild(nameLabel);
      nameDiv.appendChild(nameInput);
      contactDiv.appendChild(nameDiv);

      const emailDiv = document.createElement('div');
      const emailLabel = document.createElement('label');
      emailLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
      emailLabel.textContent = 'Email (optional)';

      const emailInput = document.createElement('input');
      emailInput.type = 'email';
      emailInput.id = 'feedback-email';
      emailInput.className = 'w-full border border-gray-300 rounded-md px-3 py-2';

      emailDiv.appendChild(emailLabel);
      emailDiv.appendChild(emailInput);
      contactDiv.appendChild(emailDiv);

      form.appendChild(contactDiv);
    }

    // Screenshot preview
    const screenshotDiv = document.createElement('div');
    screenshotDiv.id = 'screenshot-preview';
    screenshotDiv.className = 'hidden';

    const screenshotLabel = document.createElement('label');
    screenshotLabel.className = 'block text-sm font-medium text-gray-700 mb-1';
    screenshotLabel.textContent = 'Screenshot';

    const screenshotContainer = document.createElement('div');
    screenshotContainer.className = 'border border-gray-300 rounded-md p-2 bg-gray-50';

    const screenshotCanvas = document.createElement('canvas');
    screenshotCanvas.id = 'screenshot-canvas';
    screenshotCanvas.className = 'max-w-full h-auto';

    screenshotContainer.appendChild(screenshotCanvas);
    screenshotDiv.appendChild(screenshotLabel);
    screenshotDiv.appendChild(screenshotContainer);
    form.appendChild(screenshotDiv);

    // Buttons
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'flex justify-between items-center pt-4';

    const leftButtons = document.createElement('div');
    leftButtons.className = 'flex space-x-2';

    const screenshotBtn = document.createElement('button');
    screenshotBtn.type = 'button';
    screenshotBtn.id = 'take-screenshot';
    screenshotBtn.className = 'px-3 py-1 text-sm text-indigo-600 hover:text-indigo-800';
    screenshotBtn.textContent = this.config.enableScreenshots ? 'Take Screenshot' : 'Screenshot Disabled';

    const attachBtn = document.createElement('button');
    attachBtn.type = 'button';
    attachBtn.id = 'attach-file';
    attachBtn.className = 'px-3 py-1 text-sm text-indigo-600 hover:text-indigo-800';
    attachBtn.textContent = 'Attach File';

    leftButtons.appendChild(screenshotBtn);
    leftButtons.appendChild(attachBtn);
    buttonDiv.appendChild(leftButtons);

    const rightButtons = document.createElement('div');
    rightButtons.className = 'flex space-x-2';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancel-feedback';
    cancelBtn.className = 'px-4 py-2 text-sm text-gray-600 hover:text-gray-800';
    cancelBtn.textContent = 'Cancel';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700';
    submitBtn.textContent = 'Send Feedback';

    rightButtons.appendChild(cancelBtn);
    rightButtons.appendChild(submitBtn);
    buttonDiv.appendChild(rightButtons);

    form.appendChild(buttonDiv);
    dialogInner.appendChild(form);
    dialogContent.appendChild(dialogInner);
    dialog.appendChild(dialogContent);

    // Set up event listeners
    this.setupDialogEventListeners(dialog);
  }

  private setupDialogEventListeners(dialog: HTMLElement): void {
    const form = dialog.querySelector('#feedback-form') as HTMLFormElement;
    const closeBtn = dialog.querySelector('#close-feedback') as HTMLButtonElement;
    const cancelBtn = dialog.querySelector('#cancel-feedback') as HTMLButtonElement;
    const takeScreenshotBtn = dialog.querySelector('#take-screenshot') as HTMLButtonElement;
    const attachFileBtn = dialog.querySelector('#attach-file') as HTMLButtonElement;
    const descriptionInput = dialog.querySelector('#feedback-description') as HTMLTextAreaElement;
    const charCount = dialog.querySelector('#char-count') as HTMLSpanElement;

    // Character count
    descriptionInput.addEventListener('input', () => {
      charCount.textContent = descriptionInput.value.length.toString();
    });

    // Close dialog
    const closeDialog = () => {
      document.body.removeChild(dialog);
    };

    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);

    // Screenshot
    if (this.config.enableScreenshots) {
      takeScreenshotBtn.addEventListener('click', () => {
        this.takeScreenshot();
      });
    } else {
      takeScreenshotBtn.disabled = true;
    }

    // File attachment
    attachFileBtn.addEventListener('click', () => {
      this.attachFile();
    });

    // Form submission
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const feedbackData = this.collectFeedbackData(form);
      await this.submitFeedback(feedbackData);

      closeDialog();
    });

    // Click outside to close
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeDialog();
      }
    });
  }

  private collectFeedbackData(form: HTMLFormElement): Partial<FeedbackItem> {
    const formData = new FormData(form);

    return {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: formData.get('type') as FeedbackItem['type'],
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      severity: this.determineSeverity(formData.get('type') as string),
      category: formData.get('category') as string,
      userEmail: formData.get('email') as string,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: Date.now(),
      status: 'new',
      priority: this.determinePriority(formData.get('type') as string),
      tags: [],
      metadata: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
      }
    };
  }

  private determineSeverity(type: string): FeedbackItem['severity'] {
    switch (type) {
      case 'bug': return 'high';
      case 'feature': return 'medium';
      case 'improvement': return 'medium';
      case 'question': return 'low';
      case 'praise': return 'low';
      default: return 'medium';
    }
  }

  private determinePriority(type: string): FeedbackItem['priority'] {
    switch (type) {
      case 'bug': return 'high';
      case 'feature': return 'medium';
      case 'improvement': return 'low';
      case 'question': return 'low';
      case 'praise': return 'low';
      default: return 'medium';
    }
  }

  private async takeScreenshot(): Promise<void> {
    try {
      // Request screen capture permissions
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);

          // Show screenshot preview
          const preview = document.getElementById('screenshot-preview') as HTMLElement;
          const previewCanvas = document.getElementById('screenshot-canvas') as HTMLCanvasElement;

          if (preview && previewCanvas) {
            previewCanvas.width = Math.min(canvas.width, 800);
            previewCanvas.height = (canvas.height * previewCanvas.width) / canvas.width;

            const previewCtx = previewCanvas.getContext('2d');
            if (previewCtx) {
              previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
              preview.classList.remove('hidden');
            }
          }
        }

        stream.getTracks().forEach(track => track.stop());
      };
    } catch (error) {
      console.error('Screenshot failed:', error);
      alert('Screenshot failed. Please try again or attach a file manually.');
    }
  }

  private attachFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.config.allowedFileTypes.join(',');
    input.multiple = true;

    input.addEventListener('change', (event) => {
      const files = (event.target as HTMLInputElement).files;
      if (files) {
        Array.from(files).forEach(file => {
          if (file.size > this.config.maxFileSize) {
            alert(`File ${file.name} is too large. Maximum size is ${this.config.maxFileSize / 1024 / 1024}MB.`);
            return;
          }
        });
      }
    });

    input.click();
  }

  private async submitFeedback(feedbackData: Partial<FeedbackItem>): Promise<void> {
    try {
      const completeFeedback: FeedbackItem = {
        ...feedbackData,
        tags: this.extractTags(feedbackData.description || ''),
        metadata: {
          ...feedbackData.metadata,
          screenshot: this.getScreenshotData()
        }
      } as FeedbackItem;

      // Store locally
      await this.storeFeedbackItem(completeFeedback);

      // Send to server if auto-submit is enabled
      if (this.config.autoSubmit) {
        await this.sendToServer(completeFeedback);
      }

      // Show success message
      this.showSuccessMessage();

      // Log to analytics
      if (window.analyticsManager) {
        window.analyticsManager.trackUserInteraction('feedback_submitted', {
          type: completeFeedback.type,
          category: completeFeedback.category
        });
      }

    } catch (error) {
      console.error('Failed to submit feedback:', error);
      this.showErrorMessage();
    }
  }

  private extractTags(description: string): string[] {
    const tags: string[] = [];

    // Extract common keywords
    const keywords = ['performance', 'ui', 'ux', 'bug', 'crash', 'feature', 'mobile', 'desktop'];
    keywords.forEach(keyword => {
      if (description.toLowerCase().includes(keyword)) {
        tags.push(keyword);
      }
    });

    return [...new Set(tags)];
  }

  private getScreenshotData(): string | null {
    const canvas = document.getElementById('screenshot-canvas') as HTMLCanvasElement;
    return canvas ? canvas.toDataURL('image/png') : null;
  }

  private async storeFeedbackItem(feedback: FeedbackItem): Promise<void> {
    try {
      const existingFeedback = JSON.parse(localStorage.getItem('artone_feedback') || '[]');
      existingFeedback.push(feedback);

      localStorage.setItem('artone_feedback', JSON.stringify(existingFeedback));
    } catch (error) {
      console.error('Failed to store feedback:', error);
    }
  }

  private async sendToServer(feedback: FeedbackItem): Promise<void> {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(feedback)
      });

      if (!response.ok) {
        throw new Error('Failed to send feedback');
      }
    } catch (error) {
      console.error('Failed to send feedback to server:', error);
      // Store for later retry
      const pendingFeedback = JSON.parse(localStorage.getItem('artone_pending_feedback') || '[]');
      pendingFeedback.push(feedback);
      localStorage.setItem('artone_pending_feedback', JSON.stringify(pendingFeedback));
    }
  }

  private showSuccessMessage(): void {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.textContent = 'Thank you for your feedback!';

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  private showErrorMessage(): void {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.textContent = 'Failed to send feedback. Please try again.';

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  private loadFeedbackItems(): void {
    try {
      this.feedbackItems = JSON.parse(localStorage.getItem('artone_feedback') || '[]');
    } catch (error) {
      console.error('Failed to load feedback items:', error);
      this.feedbackItems = [];
    }
  }

  public getFeedbackItems(): FeedbackItem[] {
    return [...this.feedbackItems];
  }

  public getFeedbackStats(): FeedbackStats {
    const stats: FeedbackStats = {
      totalFeedback: this.feedbackItems.length,
      byType: {},
      byStatus: {},
      byCategory: {},
      averageResolutionTime: 0,
      satisfactionScore: 0
    };

    this.feedbackItems.forEach(item => {
      // Count by type
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;

      // Count by status
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;

      // Count by category
      stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
    });

    return stats;
  }

  public updateConfig(newConfig: Partial<FeedbackConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): FeedbackConfig {
    return { ...this.config };
  }

  public generateReport(): string {
    const report = {
      config: this.config,
      stats: this.getFeedbackStats(),
      recentFeedback: this.feedbackItems.slice(-5),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  public destroy(): void {
    const feedbackButton = document.getElementById('feedback-button');
    if (feedbackButton) {
      feedbackButton.remove();
    }

    const feedbackDialog = document.getElementById('feedback-dialog');
    if (feedbackDialog) {
      feedbackDialog.remove();
    }
  }
}

// Global instance
let feedbackManager: FeedbackManager | null = null;

export function initializeFeedbackManager(): void {
  if (typeof window === 'undefined') return;

  feedbackManager = new FeedbackManager();
}

export function getFeedbackManager(): FeedbackManager | null {
  return feedbackManager;
}

// Auto-initialize
if (typeof window !== 'undefined') {
  initializeFeedbackManager();
}
