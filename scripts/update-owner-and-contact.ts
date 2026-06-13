import mongoose from 'mongoose';
import { PropertyModel } from '../src/modules/properties/property.model';
import { UserModel } from '../src/modules/auth/user.model';
import { config } from 'dotenv';

config();

const OWNER_EMAIL = 'adeeel5598@gmail.com';
const CONTACT_NUMBER = '+923175496466';

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.DB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI or DB_URI not set in environment');
  }
  await mongoose.connect(mongoUri);

  // Find or create the user with the specified email
  let user = await UserModel.findOne({ email: OWNER_EMAIL });
  if (!user) {
    user = await UserModel.create({
      name: 'Default Owner',
      email: OWNER_EMAIL,
      passwordHash: '$2b$10$dummyhashfordefaultowner', // Set a dummy hash, should be updated
      role: 'seller',
      status: 'active',
      emailVerified: true,
    });
    console.log('Created new user for owner:', OWNER_EMAIL);
  } else {
    console.log('Found existing user for owner:', OWNER_EMAIL);
  }

  // Update all properties to set owner and contact number
  const result = await PropertyModel.updateMany(
    {},
    {
      $set: {
        owner: user._id,
        'contactCapabilities.contactNumber': CONTACT_NUMBER,
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} properties with owner and contact number.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
