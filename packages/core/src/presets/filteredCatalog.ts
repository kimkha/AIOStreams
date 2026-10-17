import { Addon, Option, UserData } from '../db/index.js';
import { createFilteredCatalogConfig } from '../builtins/filtered-catalog/index.js';
import { appConfig, constants } from '../utils/index.js';
import { Preset } from './preset.js';

export class FilteredCatalogPreset extends Preset {
  static override get METADATA() {
    const options: Option[] = [
      {
        id: 'name',
        name: 'Name',
        description: 'What to call this addon',
        type: 'string',
        required: true,
        default: 'Filtered Catalog',
      },
      {
        id: 'timeout',
        name: 'Timeout (ms)',
        description: 'The timeout for this addon',
        type: 'number',
        default: appConfig.presets.defaultTimeout,
        constraints: {
          min: appConfig.userLimits.timeouts.minTimeout,
          max: appConfig.userLimits.timeouts.maxTimeout,
          forceInUi: false,
        },
      },
    ];

    return {
      ID: 'filtered-catalog',
      NAME: 'Filtered Catalog',
      LOGO: '',
      URL: [`${appConfig.bootstrap.internalUrl}/builtins/filtered-catalog`],
      TIMEOUT: appConfig.presets.defaultTimeout,
      USER_AGENT: appConfig.http.defaultUserAgent,
      SUPPORTED_SERVICES: [],
      DESCRIPTION:
        'Movie and series catalogs of the titles in your custom ratings (Filters → Rating Filter). The rating filter decides which titles show.',
      OPTIONS: options,
      SUPPORTED_STREAM_TYPES: [],
      SUPPORTED_RESOURCES: [constants.CATALOG_RESOURCE],
      BUILTIN: true,
      CATEGORY: constants.PresetCategory.META_CATALOGS,
    };
  }

  static override async generateAddons(
    userData: UserData,
    options: Record<string, any>
  ): Promise<Addon[]> {
    const config = createFilteredCatalogConfig(userData.uuid);
    return [
      {
        name: options.name || this.METADATA.NAME,
        manifestUrl: `${appConfig.bootstrap.internalUrl}/builtins/filtered-catalog/${this.base64EncodeJSON(config, 'urlSafe')}/manifest.json`,
        enabled: true,
        resources: [constants.CATALOG_RESOURCE],
        timeout: options.timeout || this.METADATA.TIMEOUT,
        preset: {
          id: '',
          type: this.METADATA.ID,
          options: options,
        },
        headers: {
          'User-Agent': this.METADATA.USER_AGENT,
        },
      },
    ];
  }
}
