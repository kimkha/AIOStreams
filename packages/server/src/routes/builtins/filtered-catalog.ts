import { Router, Request, Response, NextFunction } from 'express';
import {
  APIError,
  FilteredCatalogAccessError,
  constants,
  fromUrlSafeBase64,
  getFilteredCatalog,
  getFilteredCatalogManifest,
  getVerifiedFilteredCatalogUuid,
} from '@aiostreams/core';
import { rawExtras } from '../../utils/extras.js';

const router: Router = Router();

router.get('/:encodedConfig/manifest.json', (_req: Request, res: Response) => {
  res.json(getFilteredCatalogManifest());
});

interface FilteredCatalogParams {
  encodedConfig: string;
  type: string;
  id: string;
  extras?: string;
}

router.get(
  '/:encodedConfig/catalog/:type/:id{/:extras}.json',
  async (
    req: Request<FilteredCatalogParams>,
    res: Response,
    next: NextFunction
  ) => {
    const { encodedConfig, type, id } = req.params;
    try {
      const uuid = getVerifiedFilteredCatalogUuid(
        JSON.parse(fromUrlSafeBase64(encodedConfig))
      );
      const skip = Number(
        new URLSearchParams(rawExtras(req) ?? '').get('skip') ?? 0
      );
      res.json({ metas: await getFilteredCatalog(uuid, type, id, skip) });
    } catch (error) {
      next(
        error instanceof FilteredCatalogAccessError
          ? new APIError(
              constants.ErrorCode.FORBIDDEN,
              undefined,
              error.message
            )
          : error
      );
    }
  }
);

export default router;
