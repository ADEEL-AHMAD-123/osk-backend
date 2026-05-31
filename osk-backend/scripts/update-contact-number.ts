import mongoose from 'mongoose';
import { PropertyModel } from '../src/modules/properties/property.model';
import { config } from 'dotenv';

config();

const CONTACT_NUMBER = '+923175496466';

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.DB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI or DB_URI not set in environment');
  }
  await mongoose.connect(mongoUri);

  const result = await PropertyModel.updateMany(
    {},
    {
      $set: {
        'contactCapabilities.contactNumber': CONTACT_NUMBER,
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} properties with contact number.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
