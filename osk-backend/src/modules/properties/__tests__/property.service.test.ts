import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PropertyModel } from '../property.model';
import { propertyService } from '../property.service';
import { propertyFiltersSchema } from '../property.schema';
import { SAMPLE_PROPERTIES } from '../property.data';

/**
 * Integration test — runs against a real (in-memory) MongoDB, never a mock,
 * so indexes and queries are exercised. See ARCHITECTURE.md §13.
 */
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const ownerId = new mongoose.Types.ObjectId();
  await PropertyModel.create(
    SAMPLE_PROPERTIES.map((p) => ({ ...p, owner: ownerId })),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('propertyService', () => {
  const baseFilters = propertyFiltersSchema.parse({});

  it('lists published/sold properties with pagination metadata', async () => {
    const page = await propertyService.list(baseFilters);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.page).toBe(1);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
  });

  it('filters by property type', async () => {
    const page = await propertyService.list({ ...baseFilters, type: 'commercial' });
    expect(page.items.every((p) => p.type === 'commercial')).toBe(true);
  });

  it('sorts by price ascending', async () => {
    const { items } = await propertyService.list({ ...baseFilters, sort: 'price' });
    const prices = items.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('returns a property by slug', async () => {
    const property = await propertyService.getBySlug(
      'skyline-villa-emerald-heights',
    );
    expect(property.title).toContain('Skyline Villa');
  });

  it('throws NotFound for an unknown slug', async () => {
    await expect(
      propertyService.getBySlug('does-not-exist'),
    ).rejects.toThrow();
  });
});
