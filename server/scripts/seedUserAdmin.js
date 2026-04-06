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

  const existing = await User.findOne({ email });
  if (existing) {
    // Update role and password
    existing.role = 'admin';
    existing.password = hash;
    existing.isActive = true;
    existing.loginAttempts = 0;
    existing.lockUntil = null;
    await existing.save({ validateBeforeSave: false });
    console.log('✅ Existing user updated to admin role');
    console.log('   Email:', existing.email);
    console.log('   Role:', existing.role);
    console.log('   oderId:', existing.oderId);
  } else {
    // Generate userId
    const oderId = await User.generateUserId();
    const user = await User.create({
      oderId,
      name: 'Super Admin',
      email,
      phone: '+919999999999',
      password: hash,
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
      loginAttempts: 0,
      wallet: { balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0 }
    });
    console.log('✅ Admin user created in User collection');
    console.log('   Email:', user.email);
    console.log('   oderId:', user.oderId);
  }

  // Verify password works
  const admin = await User.findOne({ email });
  const check = await bcrypt.compare(password, admin.password);
  console.log('✅ Password verify:', check ? 'PASS' : 'FAIL');
  console.log('\nLogin with:');
  console.log('  Email:', email);
  console.log('  Password:', password);

  process.exit(0);
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
