/**
 * Seed Admin User Script
 * Run: node server/scripts/seedAdmin.js
 *
 * Uses the Admin model (not User) — admins live in the 'admins' collection.
 * Roles: super_admin, sub_admin, broker
 * Password is hashed by the Admin model's pre-save hook.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

const adminAccounts = [
  {
    email: 'admin@setupfx.com',
    phone: '9999999999',
    password: 'Admin@123',
    name: 'Super Admin',
    role: 'super_admin'
  },
  {
    email: 'subadmin@setupfx.com',
    phone: '9999999998',
    password: 'SubAdmin@123',
    name: 'Sub Admin',
    role: 'sub_admin'
  },
  {
    email: 'broker@setupfx.com',
    phone: '9999999997',
    password: 'Broker@123',
    name: 'Broker',
    role: 'broker'
  }
];

async function seedAdmins() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB:', process.env.MONGODB_URI);

    for (const acc of adminAccounts) {
      // Check if admin already exists
      const existing = await Admin.findOne({ email: acc.email });
      if (existing) {
        // Update password and ensure active
        existing.password = acc.password; // pre-save hook will hash
        existing.isActive = true;
        existing.name = acc.name;
        await existing.save();
        console.log(`Updated: ${acc.role} - ${acc.email} (oderId: ${existing.oderId})`);
      } else {
        // Generate proper admin ID
        const oderId = await Admin.generateAdminId(acc.role);
        const admin = new Admin({
          oderId,
          ...acc,
          isActive: true
        });
        await admin.save();
        console.log(`Created: ${acc.role} - ${acc.email} (oderId: ${oderId})`);
      }
    }

    console.log('\n========================================');
    console.log('Admin accounts seeded successfully!');
    console.log('========================================\n');
    console.log('Login Credentials:');
    console.log('------------------');
    for (const acc of adminAccounts) {
      console.log(`${acc.role}:`);
      console.log(`  Email: ${acc.email}`);
      console.log(`  Password: ${acc.password}`);
      console.log('');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admins:', error.message);
    process.exit(1);
  }
}

seedAdmins();
