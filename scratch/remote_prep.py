import paramiko
import sys

# 设置 stdout 编码
sys.stdout.reconfigure(encoding='utf-8')

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"
REMOTE_DIR = "/opt/skivision"

def run_remote_cmd(ssh, cmd):
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && {cmd}", timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out: print(f"STDOUT: {out}")
    if err: print(f"STDERR: {err}")
    return out, err

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS, timeout=15)
    print("Connected to VPS")

    # 1. 同步数据库结构
    print("\n--- Syncing Database Schema ---")
    run_remote_cmd(ssh, "cd server && npx prisma db push --accept-data-loss")

    # 2. 检查结果
    print("\n--- Verifying Schema ---")
    run_remote_cmd(ssh, "ls -l server/prisma/schema.prisma")

    ssh.close()
    print("\nRemote Prep Done!")

if __name__ == "__main__":
    main()
