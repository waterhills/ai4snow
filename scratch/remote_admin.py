import paramiko
import sys

# 设置 stdout 编码
sys.stdout.reconfigure(encoding='utf-8')

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"
REMOTE_DIR = "/opt/skivision/server"

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS, timeout=15)
    print("Connected to VPS")

    # 在远程创建一个临时的 admin 创建脚本
    admin_script = """
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@skate.com';
  const password = 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email,
      name: '超级管理员',
      password: hashedPassword,
      role: 'ADMIN',
      credits: 9999,
      status: 'ACTIVE'
    },
  });
  console.log('Admin account created/updated on REMOTE server');
}
main().finally(() => prisma.$disconnect());
"""
    
    # 写入远程文件
    print("Writing admin script to remote...")
    sftp = ssh.open_sftp()
    with sftp.file(f"{REMOTE_DIR}/prisma/remote-create-admin.ts", "w") as f:
        f.write(admin_script)
    sftp.close()

    # 执行脚本
    print("Executing admin script on remote...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && npx tsx prisma/remote-create-admin.ts")
    print(f"STDOUT: {stdout.read().decode('utf-8')}")
    print(f"STDERR: {stderr.read().decode('utf-8')}")

    ssh.close()
    print("Remote Admin Creation Done!")

if __name__ == "__main__":
    main()
