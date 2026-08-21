import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@skate.com';
  const password = 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log(`正在创建管理员用户: ${email}...`);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'ADMIN',
      password: hashedPassword,
    },
    create: {
      email,
      name: '超级管理员',
      password: hashedPassword,
      role: 'ADMIN',
      credits: 9999,
    },
  });

  console.log('✅ 管理员账户创建/更新成功！');
  console.log(`邮箱: ${user.email}`);
  console.log('密码: admin123');
}

main()
  .catch((e) => {
    console.error('❌ 创建失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
