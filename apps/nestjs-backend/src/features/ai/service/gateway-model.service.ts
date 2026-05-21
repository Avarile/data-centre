import { Injectable, Logger } from '@nestjs/common';
import { SettingKey, convertGatewayApiModel, normalizeGatewayPricing } from '@teable/openapi';
import type { IGatewayApiModel, IGatewayApiModelRaw } from '@teable/openapi';
import axios from 'axios';
import { SettingService } from '../../setting/setting.service';

const gatewayModelsCacheTtl = 10 * 60 * 1000;

interface IGatewayModelsCache {
  data: IGatewayApiModel[];
  expiresAt: number;
}

@Injectable()
export class GatewayModelService {
  private readonly logger = new Logger(GatewayModelService.name);

  // In-memory cache for Gateway models API - faster than Redis for static data
  private gatewayModelsCache: IGatewayModelsCache | null = null;

  constructor(private readonly settingService: SettingService) {}

  /**
   * Fetch all models from AI Gateway API with in-memory caching.
   * Cache TTL: 10 minutes (static data, doesn't change frequently).
   */
  async fetchGatewayModelsFromApi(): Promise<IGatewayApiModel[]> {
    if (this.gatewayModelsCache && Date.now() < this.gatewayModelsCache.expiresAt) {
      return this.gatewayModelsCache.data;
    }

    try {
      const response = await axios.get<{ data: IGatewayApiModelRaw[] }>(
        'https://ai-gateway.vercel.sh/v1/models',
        { timeout: 10000 }
      );

      const models = (response.data?.data || []).map(convertGatewayApiModel);

      this.gatewayModelsCache = {
        data: models,
        expiresAt: Date.now() + gatewayModelsCacheTtl,
      };

      return models;
    } catch (error) {
      if (this.gatewayModelsCache) {
        this.logger.warn(
          `[fetchGatewayModelsFromApi] Failed to refresh, using stale cache: ${error}`
        );
        return this.gatewayModelsCache.data;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch AI Gateway models: ${errorMessage}`);
    }
  }

  /**
   * Get a specific model from Gateway API (uses cached data when available).
   */
  async getGatewayApiModel(modelId: string): Promise<IGatewayApiModel | undefined> {
    const models = await this.fetchGatewayModelsFromApi();
    const normalize = (s: string) =>
      s.split('/').pop()!.replaceAll('.', '').replaceAll('-', '').toLowerCase();
    const stripDateSuffix = (s: string) => s.replace(/\d{8,}$/, '');
    return models.find((m) => {
      const a = normalize(modelId);
      const b = normalize(m.id);
      if (a === b) return true;
      return stripDateSuffix(a) === stripDateSuffix(b);
    });
  }

  /**
   * Get gateway model configuration by modelId.
   * First checks local gatewayModels config, then falls back to the API.
   */
  async getGatewayModelConfig(modelId: string) {
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    const gatewayModels = aiConfig?.gatewayModels ?? [];
    const localModel = gatewayModels.find((m) => m.id === modelId);
    if (localModel) {
      return localModel;
    }

    const apiModel = await this.getGatewayApiModel(modelId);
    if (apiModel) {
      return {
        ...apiModel,
        label: apiModel.name || apiModel.id,
        enabled: true,
      };
    }

    return undefined;
  }

  /**
   * Get gateway model pricing for billing calculation.
   * First checks local gatewayModels config, then falls back to the API.
   */
  async getGatewayModelPricing(modelId: string) {
    const { aiConfig } = await this.settingService.getSetting([SettingKey.AI_CONFIG]);
    const gatewayModels = aiConfig?.gatewayModels ?? [];
    const localModel = gatewayModels.find((m) => m.id === modelId);
    if (localModel?.pricing) {
      const pricing = normalizeGatewayPricing(localModel.pricing);
      this.logger.debug(
        `[getGatewayModelPricing] Found local pricing for ${modelId}: ${JSON.stringify(pricing)}`
      );
      return pricing;
    }

    try {
      const apiModel = await this.getGatewayApiModel(modelId);
      if (apiModel?.pricing) {
        this.logger.debug(
          `[getGatewayModelPricing] Found API pricing for ${modelId}: ${JSON.stringify(apiModel.pricing)}`
        );
        return apiModel.pricing;
      }
    } catch (error) {
      this.logger.warn(`[getGatewayModelPricing] Failed to fetch API pricing for ${modelId}`);
    }

    this.logger.debug(
      `[getGatewayModelPricing] No pricing found for ${modelId}, will use default rates`
    );
    return undefined;
  }
}
