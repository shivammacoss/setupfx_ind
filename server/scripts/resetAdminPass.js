require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function reset() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected:', process.env.MONGODB_URI);

  const Admin = require('../models/Admin');

  const newPassword = 'Admin@123';
  const hash = await bcrypt.hash(newPassword, 12);

  const result = await Admin.findOneAndUpdate(
    { email: 'admin@setupfx.com' },
    { $set: { password: hash, isActive: true } },
    { new: true }
  );

  if (result) {
    console.log('✅ Password reset for:', result.email);
    console.log('   Role:', result.role);
    console.log('   oderId:', result.oderId);
    console.log('   New Password: Admin@123');
  } else {
    console.log('❌ Admin not found! Creating fresh...');
    const sa = new Admin({
      oderId: 'SA10001',
      email: 'admin@setupfx.com',
      phone: '9999999999',
      password: newPassword,
      name: 'Super Admin',
      role: 'super_admin',
      isActive: true
    });
    await sa.save();
    console.log('✅ Super Admin created fresh');
  }

  // Verify by comparing
  const admin = await Admin.findOne({ email: 'admin@setupfx.com' });
  const check = await bcrypt.compare(newPassword, admin.password);
  console.log('✅ Password verify check:', check ? 'PASS' : 'FAIL');

  process.exit(0);
}

reset().catch(e => { console.error(e); process.exit(1); });
