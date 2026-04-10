import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始初始化种子数据...');

  // 创建管理员账户
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@skate.com' },
    update: {},
    create: {
      email: 'admin@skate.com',
      password: hashedPassword,
      name: '管理员',
      role: 'ADMIN',
      credits: 9999,
    },
  });

  // 创建一个测试用户
  const testPassword = await bcrypt.hash('test123', 10);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@skate.com' },
    update: {},
    create: {
      email: 'test@skate.com',
      password: testPassword,
      name: '测试用户',
      role: 'USER',
      credits: 10,
    },
  });

  console.log('✅ 管理员账户:', admin.email, '(密码: admin123)');
  console.log('✅ 测试用户:', testUser.email, '(密码: test123)');
  console.log('🌱 种子数据初始化完成!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
