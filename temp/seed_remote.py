import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')

js_code = """
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
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
  console.log('Admin created:', admin.email);
}

main().finally(() => prisma.$disconnect());
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.251.89.147', 4066, 'root', '@Murphymurphy123123', timeout=10)

# Write JS to remote
sftp = ssh.open_sftp()
with sftp.file('/opt/skivision/server/create_admin.js', 'w') as f:
    f.write(js_code)
sftp.close()

# Run JS
_, out, err = ssh.exec_command('cd /opt/skivision/server && node create_admin.js')
print(out.read().decode('utf-8'))
print(err.read().decode('utf-8'))

ssh.close()
