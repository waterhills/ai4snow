import paramiko

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS)

print("Checking PM2 logs...")
stdin, stdout, stderr = ssh.exec_command("pm2 logs skivision-server --lines 20 --no-color")
print(stdout.read().decode('utf-8', errors='replace'))

print("\nChecking server status...")
stdin, stdout, stderr = ssh.exec_command("curl -I http://localhost:3000/api/health")
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
