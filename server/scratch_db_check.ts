import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  try {
    const userCount = await prisma.user.count();
    const taskCount = await prisma.task.count();
    const users = await prisma.user.findMany({
      select: { email: true, name: true, createdAt: true },
      take: 5
    });

    console.log('--- 数据库统计 ---');
    console.log(`总用户数: ${userCount}`);
    console.log(`总任务数: ${taskCount}`);
    
    if (users.length > 0) {
      console.log('\n--- 最近注册的用户 (最多5个) ---');
      users.forEach(u => {
        console.log(`- ${u.email} (${u.name || '未设置姓名'}) - 注册于: ${u.createdAt}`);
      });
    } else {
      console.log('\n目前没有任何注册用户。');
    }
  } catch (error) {
    console.error('查询数据库失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

check();
