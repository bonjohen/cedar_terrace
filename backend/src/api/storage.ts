import { Router, Request, Response } from 'express';
import { StorageService } from '../services';
import { GetUploadUrlRequest } from '@cedar-terrace/shared';

export function createStorageRoutes(): Router {
  const router = Router();
  const service = new StorageService();

  // Get pre-signed URL for uploading evidence
  router.post('/upload-url', async (req: Request, res: Response) => {
    try {
      const { fileName, contentType } = req.body as GetUploadUrlRequest;
      const result = await service.getUploadUrl(fileName, contentType);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  // Get pre-signed URL for downloading evidence
  router.get('/download-url/:s3Key', async (req: Request, res: Response) => {
    try {
      const s3Key = decodeURIComponent(req.params.s3Key);
      const url = await service.getDownloadUrl(s3Key);
      res.json({ url });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  return router;
}
