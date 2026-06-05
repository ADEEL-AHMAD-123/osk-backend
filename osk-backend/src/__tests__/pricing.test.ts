import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PaymentSettingsModel } from '../modules/pricing/paymentSettings.model';
import { PricingPlanModel } from '../modules/pricing/pricingPlan.model';
import { pricingService } from '../modules/pricing/pricing.service';

describe('pricingService.resolve', () => {
  let mongo: MongoMemoryServer | undefined;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? '7.0.14' },
    });
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongo) {
      await mongo.stop();
    }
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    if (collections) {
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
    }
    await PaymentSettingsModel.create({
      singletonKey: 'default',
      paymentsEnabled: true,
      enabledProviders: ['stripe'],
    });
  });

  it('prefers a country-specific fallback over a global type-specific plan', async () => {
    await PricingPlanModel.create([
      {
        name: 'Global home resale',
        propertyType: 'home',
        listingKind: 'resale',
        country: '*',
        featured: false,
        price: 3,
        currency: 'USD',
        priority: 0,
        active: true,
      },
      {
        name: 'Canada default',
        propertyType: '*',
        listingKind: '*',
        country: 'CA',
        featured: false,
        price: 1.5,
        currency: 'CAD',
        priority: 0,
        active: true,
      },
    ]);

    const resolved = await pricingService.resolve({
      propertyType: 'home',
      listingKind: 'resale',
      country: 'CA',
      featured: false,
    });

    expect(resolved.base.amount).toBe(1.5);
    expect(resolved.base.currency).toBe('CAD');
    expect(resolved.total).toBe(1.5);
    expect(resolved.currency).toBe('CAD');
  });
});