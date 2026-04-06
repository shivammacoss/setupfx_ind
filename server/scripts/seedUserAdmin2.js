require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected:', process.env.MONGODB_URI);

  const User = require('../models/User');

  const email = 'admin@setupfx.com';
  const password = 'Admin@123';
  const hash = await bcrypt.hash(password, 12);

  // Delete any existing admin@setupfx.com user first
  await User.deleteMany({ email });
  console.log('Cleared old entries');

  // Insert directly via mongoose to bypass pre-save hooks
  const oderId = await User.generateUserId();

  await mongoose.connection.collection('users').insertOne({
    oderId,
    name: 'Super Admin',
    email: email,
    phone: '+919999999999',
    password: hash,
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    loginAttempts: 0,
    lockUntil: null,
    wallet: { balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0 },
    createdAt: new Date(),
    updatedAt: new Date()
  });
  console.log('✅ Admin inserted directly to users collection');

  // Verify
  const doc = await mongoose.connection.collection('users').findOne({ email });
  const check = await bcrypt.compare(password, doc.password);
  console.log('✅ Password verify:', check ? 'PASS ✅' : 'FAIL ❌');
  console.log('\nLogin credentials:');
  console.log('  Email:', email);
  console.log('  Password:', password);
  console.log('  Role:', doc.role);
  console.log('  oderId:', doc.oderId);

  process.exit(0);
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
