"""上传更新的 client dist + admin dist + server dist 并重启"""
import os
import time
import paramiko
from scp import SCPClient

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"
REMOTE_DIR = "/opt/skivision"
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))


def safe(s):
    return s.encode("ascii", errors="replace").decode("ascii")


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS, timeout=15)
    print("Connected")

    # 初始化 SCP
    scp = SCPClient(ssh.get_transport())

    # 上传 client/dist
    print("\n=== Upload client/dist ===")
    client_dist = os.path.join(LOCAL_DIR, "client", "dist")
    
    # 先清空远程 client/dist
    stdin, stdout, stderr = ssh.exec_command(f"rm -rf {REMOTE_DIR}/client/dist/*", timeout=10)
    stdout.read()

    for root, dirs, files in os.walk(client_dist):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            full_local = os.path.join(root, f)
            rel = os.path.relpath(full_local, client_dist)
            full_remote = f"{REMOTE_DIR}/client/dist/{rel.replace(os.sep, '/')}"
            remote_parent = os.path.dirname(full_remote)
            stdin, stdout, stderr = ssh.exec_command(f"mkdir -p '{remote_parent}'", timeout=5)
            stdout.read()
            print(f"  {rel}")
            scp.put(full_local, full_remote)

    # 上传 admin/dist
    print("\n=== Upload admin/dist ===")
    admin_dist = os.path.join(LOCAL_DIR, "admin", "dist")

    # 先清空远程 admin/dist
    stdin, stdout, stderr = ssh.exec_command(f"rm -rf {REMOTE_DIR}/admin/dist/*", timeout=10)
    stdout.read()

    # 预创建目录
    for root, dirs, files in os.walk(admin_dist):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            full_local = os.path.join(root, f)
            rel = os.path.relpath(full_local, admin_dist)
            full_remote = f"{REMOTE_DIR}/admin/dist/{rel.replace(os.sep, '/')}"
            remote_parent = os.path.dirname(full_remote)
            stdin, stdout, stderr = ssh.exec_command(f"mkdir -p '{remote_parent}'", timeout=5)
            stdout.read()
            print(f"  {rel}")
            scp.put(full_local, full_remote)

    # 上传 server/dist (只更新变化文件)
    print("\n=== Upload server/dist ===")
    server_dist = os.path.join(LOCAL_DIR, "server", "dist")
    for root, dirs, files in os.walk(server_dist):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "node_modules"]
        for f in files:
            full_local = os.path.join(root, f)
            rel = os.path.relpath(full_local, server_dist)
            full_remote = f"{REMOTE_DIR}/server/dist/{rel.replace(os.sep, '/')}"
            print(f"  {rel}")
            scp.put(full_local, full_remote)

    scp.close()
    print("\nUpload done!")

    # 重启服务
    print("\n=== Restart service ===")
    stdin, stdout, stderr = ssh.exec_command("pm2 restart skivision-server", timeout=10)
    out = stdout.read().decode("utf-8", errors="replace")
    print(safe(out))

    time.sleep(4)

    # 验证
    print("\n=== Verify ===")
    for cmd in [
        "pm2 status",
        "curl -s --max-time 5 http://103.251.89.147/api/health",
        "curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://103.251.89.147/",
        "curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://103.251.89.147/admin",
        "curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://103.251.89.147/admin/login",
    ]:
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
        out = stdout.read().decode("utf-8", errors="replace").strip()
        print(f"  {safe(cmd)} => {safe(out[:200])}")

    ssh.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
