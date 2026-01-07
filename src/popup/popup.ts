import { StorageService } from '../services/storage.service';
import { AIService } from '../services/ai.service';
import { Settings, Provider } from '../types';
import './popup.css';

class PopupUI {
  private storageService: StorageService;
  private aiService: AIService;
  private apiKeyInput: HTMLInputElement;
  private providerSelect: HTMLSelectElement;
  private modelInput: HTMLInputElement;
  private modelDataList: HTMLDataListElement;
  private modelStatusElement: HTMLDivElement;
  private refreshModelsButton: HTMLButtonElement;
  private saveButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private statusElement: HTMLDivElement;

  private readonly modelCacheTtlMs = 24 * 60 * 60 * 1000;

  constructor() {
    this.storageService = StorageService.getInstance();
    this.aiService = AIService.getInstance();

    this.apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
    this.providerSelect = document.getElementById('provider') as HTMLSelectElement;
    this.modelInput = document.getElementById('modelInput') as HTMLInputElement;
    this.modelDataList = document.getElementById('models-list') as HTMLDataListElement;
    this.modelStatusElement = document.getElementById('modelStatus') as HTMLDivElement;
    this.refreshModelsButton = document.getElementById('refreshModels') as HTMLButtonElement;
    this.saveButton = document.getElementById('saveBtn') as HTMLButtonElement;
    this.resetButton = document.getElementById('resetBtn') as HTMLButtonElement;
    this.statusElement = document.getElementById('status') as HTMLDivElement;

    this.initializeUI();
    this.setupEventListeners();
  }

  private async initializeUI(): Promise<void> {
    const settings = await this.storageService.getSettings();
    this.apiKeyInput.value = settings.apiKey;
    this.providerSelect.value = settings.provider || 'openrouter';
    this.modelInput.value = settings.model || '';

    if (settings.apiKey) {
      this.fetchAndPopulateModels(settings.provider, settings.apiKey);
    }
  }

  private setupEventListeners(): void {
    this.saveButton.addEventListener('click', () => this.saveSettings());
    this.resetButton.addEventListener('click', () => this.resetSettings());

    this.refreshModelsButton.addEventListener('click', async () => {
        const apiKey = this.apiKeyInput.value;
        const provider = this.providerSelect.value as Provider;
        if (apiKey) {
            await this.fetchAndPopulateModels(provider, apiKey, { forceRefresh: true });
        } else {
            this.showStatus('Please enter API Key first', 'error');
        }
    });

    // Auto-fetch models when provider changes if API key is present
    this.providerSelect.addEventListener('change', () => {
        this.providerSelect.classList.remove('field-invalid');
        this.clearModelStatus();
        const apiKey = this.apiKeyInput.value;
        const provider = this.providerSelect.value as Provider;
        if (apiKey) {
            this.fetchAndPopulateModels(provider, apiKey);
        }
    });

    // Also when API key is blurred, if it changed
    this.apiKeyInput.addEventListener('blur', () => {
        this.apiKeyInput.classList.remove('field-invalid');
        this.clearModelStatus();
        const apiKey = this.apiKeyInput.value;
        const provider = this.providerSelect.value as Provider;
        if (apiKey) {
            this.fetchAndPopulateModels(provider, apiKey);
        }
    });

    this.modelInput.addEventListener('input', () => {
        this.modelInput.classList.remove('field-invalid');
        this.clearModelStatus();
    });
  }

  private async fetchAndPopulateModels(
    provider: Provider,
    apiKey: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<void> {
    const cacheEntry = await this.storageService.getModelCache(provider);
    const isCacheFresh =
      !!cacheEntry && Date.now() - cacheEntry.fetchedAt < this.modelCacheTtlMs;

    if (!options.forceRefresh && cacheEntry && isCacheFresh) {
      this.populateModelList(cacheEntry.models);
      this.setModelStatus(
        `Using cached ${this.getProviderLabel(provider)} models (updated ${this.formatTimestamp(cacheEntry.fetchedAt)}).`,
        'info'
      );
      return;
    }

    this.refreshModelsButton.disabled = true;
    this.refreshModelsButton.textContent = '...';
    this.setModelStatus(`Fetching ${this.getProviderLabel(provider)} models...`, 'info');

    try {
        const models = await this.aiService.fetchModels(provider, apiKey);
        this.populateModelList(models);
        await this.storageService.setModelCache(provider, models);
        this.setModelStatus(
          `Models updated ${this.formatTimestamp(Date.now())}.`,
          'success'
        );
    } catch (error) {
        console.error('Failed to fetch models', error);
        if (cacheEntry?.models?.length) {
          this.populateModelList(cacheEntry.models);
          this.setModelStatus(
            `Using cached ${this.getProviderLabel(provider)} models from ${this.formatTimestamp(cacheEntry.fetchedAt)} (refresh failed).`,
            'error'
          );
        } else {
          this.setModelStatus('Failed to fetch models. Check your API key and try again.', 'error');
        }
    } finally {
        this.refreshModelsButton.disabled = false;
        this.refreshModelsButton.textContent = '↻';
    }
  }

  private async saveSettings(skipValidation = false): Promise<void> {
    if (!skipValidation && !this.validateInputs()) {
      return;
    }

    const settings: Settings = {
      apiKey: this.apiKeyInput.value,
      provider: this.providerSelect.value as Provider,
      model: this.modelInput.value
    };

    try {
      await this.storageService.saveSettings(settings);
      if (!settings.model) {
        const defaultModel = this.getDefaultModel(settings.provider);
        this.showStatus(
          `Settings saved. Using default model (${defaultModel}) for ${this.getProviderLabel(settings.provider)}.`,
          'success'
        );
      } else {
        this.showStatus('Settings saved successfully!', 'success');
      }
    } catch (error) {
      this.showStatus('Failed to save settings', 'error');
    }
  }

  private async resetSettings(): Promise<void> {
    this.apiKeyInput.value = '';
    this.providerSelect.value = 'openrouter';
    this.modelInput.value = '';
    this.modelDataList.innerHTML = '';
    this.clearValidationStates();
    await this.saveSettings(true);
  }

  private validateInputs(): boolean {
    this.clearValidationStates();

    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey) {
      this.apiKeyInput.classList.add('field-invalid');
      this.showStatus('API key is required to save settings.', 'error');
      return false;
    }

    const provider = this.providerSelect.value as Provider;
    if (!provider) {
      this.providerSelect.classList.add('field-invalid');
      this.showStatus('Please choose a provider.', 'error');
      return false;
    }

    const model = this.modelInput.value.trim();
    if (!model) {
      return true;
    }

    const modelError = this.getModelFormatError(provider, model);
    if (modelError) {
      this.modelInput.classList.add('field-invalid');
      this.showStatus(modelError, 'error');
      return false;
    }

    return true;
  }

  private getModelFormatError(provider: Provider, model: string): string | null {
    if (provider === 'openrouter' && !model.includes('/')) {
      return 'OpenRouter models should look like "provider/model".';
    }

    if (provider === 'gemini' && !/^gemini-[\w.-]+$/i.test(model)) {
      return 'Gemini models should look like "gemini-1.5-pro".';
    }

    return null;
  }

  private getDefaultModel(provider: Provider): string {
    if (provider === 'gemini') {
      return 'gemini-1.5-flash';
    }

    return 'openai/gpt-4o-mini';
  }

  private getProviderLabel(provider: Provider): string {
    if (provider === 'gemini') {
      return 'Gemini';
    }

    return 'OpenRouter';
  }

  private clearValidationStates(): void {
    this.apiKeyInput.classList.remove('field-invalid');
    this.providerSelect.classList.remove('field-invalid');
    this.modelInput.classList.remove('field-invalid');
  }

  private populateModelList(models: string[]): void {
    this.modelDataList.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      this.modelDataList.appendChild(option);
    });
  }

  private setModelStatus(message: string, type: 'info' | 'success' | 'error'): void {
    this.modelStatusElement.textContent = message;
    this.modelStatusElement.className = `model-status ${type}`;
  }

  private clearModelStatus(): void {
    this.modelStatusElement.textContent = '';
    this.modelStatusElement.className = 'model-status';
  }

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    this.statusElement.textContent = message;
    this.statusElement.className = `status ${type}`;
    setTimeout(() => {
      this.statusElement.textContent = '';
      this.statusElement.className = 'status';
    }, 3000);
  }
}

// Initialize popup UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupUI();
});
