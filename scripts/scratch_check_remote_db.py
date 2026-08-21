import paramiko

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"
REMOTE_DB = "/opt/skivision/server/prod.db"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS)

print(f"Listing tables in {REMOTE_DB}:")
stdin, stdout, stderr = ssh.exec_command(f"sqlite3 {REMOTE_DB} '.tables'")
print(stdout.read().decode('utf-8'))

print("User count:")
stdin, stdout, stderr = ssh.exec_command(f"sqlite3 {REMOTE_DB} 'SELECT COUNT(*) FROM User;'")
print(stdout.read().decode('utf-8'))

ssh.close()
