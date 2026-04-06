require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB:', process.env.MONGODB_URI);

  // Remove old wrong entries
  await Admin.deleteMany({ email: { $in: ['admin@setupfx.com', 'subadmin@setupfx.com', 'broker@setupfx.com'] } });
  console.log('Cleared old admin entries');

  // Super Admin
  const sa = new Admin({
    oderId: 'SA10001',
    email: 'admin@setupfx.com',
    phone: '9999999999',
    password: 'Admin@123',
    name: 'Super Admin',
    role: 'super_admin',
    isActive: true
  });
  await sa.save();
  console.log('✅ Super Admin created: admin@setupfx.com / Admin@123');

  // Sub Admin
  const adId = await Admin.generateAdminId('sub_admin');
  const sub = new Admin({
    oderId: adId,
    email: 'subadmin@setupfx.com',
    phone: '9999999998',
    password: 'SubAdmin@123',
    name: 'Sub Admin',
    role: 'sub_admin',
    isActive: true
  });
  await sub.save();
  console.log('✅ Sub Admin created: subadmin@setupfx.com / SubAdmin@123');

  // Broker
  const brId = await Admin.generateAdminId('broker');
  const br = new Admin({
    oderId: brId,
    email: 'broker@setupfx.com',
    phone: '9999999997',
    password: 'Broker@123',
    name: 'Broker',
    role: 'broker',
    isActive: true
  });
  await br.save();
  console.log('✅ Broker created: broker@setupfx.com / Broker@123');

  console.log('\n========================================');
  console.log('All admin accounts seeded successfully!');
  console.log('========================================');
  process.exit(0);
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
