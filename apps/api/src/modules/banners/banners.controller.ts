import { Request, Response } from 'express';
import * as bannersService from './banners.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { BannerModule } from './banners.types';

// ─── PUBLIC ───────────────────────────────────────────────────

export async function listPublicBanners(
  req: Request,
  res: Response,
): Promise<void> {
  const module = req.query.module as BannerModule | undefined;
  const banners = await bannersService.listPublicBanners(module);
  sendSuccess(res, banners, 'Banners retrieved');
}

// ─── ADMIN ────────────────────────────────────────────────────

export async function listAllBanners(
  req: Request,
  res: Response,
): Promise<void> {
  const module = req.query.module as BannerModule | undefined;
  const banners = await bannersService.listAllBanners(module);
  sendSuccess(res, banners, 'Banners retrieved');
}

export async function createBanner(
  req: Request,
  res: Response,
): Promise<void> {
  const banner = await bannersService.createBanner(req.body);
  sendCreated(res, banner, 'Banner created');
}

export async function updateBanner(
  req: Request,
  res: Response,
): Promise<void> {
  const banner = await bannersService.updateBanner(
    req.params.bannerId,
    req.body,
  );
  sendSuccess(res, banner, 'Banner updated');
}

export async function deleteBanner(
  req: Request,
  res: Response,
): Promise<void> {
  await bannersService.deleteBanner(req.params.bannerId);
  sendSuccess(res, null, 'Banner deleted');
}

export async function reorderBanners(
  req: Request,
  res: Response,
): Promise<void> {
  await bannersService.reorderBanners(req.body);
  sendSuccess(res, null, 'Banners reordered');
}
