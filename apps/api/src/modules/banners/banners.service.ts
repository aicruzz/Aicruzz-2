import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { featuredBanners } from '../../db/schema';
import { AppError } from '../../middleware/error.middleware';
import type {
  BannerModule,
  CreateBannerInput,
  UpdateBannerInput,
  ReorderBannersInput,
} from './banners.types';

// Public surface: active banners, in display order. Omit `module` to get
// the centralized cross-module dashboard showcase set.
export async function listPublicBanners(module?: BannerModule) {
  const conditions = [eq(featuredBanners.isActive, true)];
  if (module) conditions.push(eq(featuredBanners.module, module));
  return db
    .select()
    .from(featuredBanners)
    .where(and(...conditions))
    .orderBy(asc(featuredBanners.sortOrder), desc(featuredBanners.createdAt));
}

// Admin surface: all banners (optionally filtered by module).
export async function listAllBanners(module?: BannerModule) {
  const conditions = module ? [eq(featuredBanners.module, module)] : [];
  return db
    .select()
    .from(featuredBanners)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(featuredBanners.sortOrder), desc(featuredBanners.createdAt));
}

export async function createBanner(input: CreateBannerInput) {
  const [banner] = await db
    .insert(featuredBanners)
    .values({
      module: input.module,
      title: input.title,
      prompt: input.prompt,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.isNew !== undefined && { isNew: input.isNew }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.rotationInterval !== undefined && {
        rotationInterval: input.rotationInterval,
      }),
    })
    .returning();
  return banner;
}

export async function updateBanner(bannerId: string, input: UpdateBannerInput) {
  const existing = await db.query.featuredBanners.findFirst({
    where: eq(featuredBanners.id, bannerId),
    columns: { id: true },
  });
  if (!existing) throw new AppError('Banner not found', 404);

  const [updated] = await db
    .update(featuredBanners)
    .set({
      ...(input.module !== undefined && { module: input.module }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.prompt !== undefined && { prompt: input.prompt }),
      ...(input.videoUrl !== undefined && { videoUrl: input.videoUrl }),
      ...(input.thumbnailUrl !== undefined && {
        thumbnailUrl: input.thumbnailUrl,
      }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.metadata !== undefined && { metadata: input.metadata }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.isNew !== undefined && { isNew: input.isNew }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.rotationInterval !== undefined && {
        rotationInterval: input.rotationInterval,
      }),
      updatedAt: new Date(),
    })
    .where(eq(featuredBanners.id, bannerId))
    .returning();
  return updated;
}

export async function deleteBanner(bannerId: string) {
  const existing = await db.query.featuredBanners.findFirst({
    where: eq(featuredBanners.id, bannerId),
    columns: { id: true },
  });
  if (!existing) throw new AppError('Banner not found', 404);
  await db.delete(featuredBanners).where(eq(featuredBanners.id, bannerId));
}

export async function reorderBanners(input: ReorderBannersInput) {
  await Promise.all(
    input.items.map((item) =>
      db
        .update(featuredBanners)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(featuredBanners.id, item.id)),
    ),
  );
}
