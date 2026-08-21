import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.251.89.147', 4066, 'root', '@Murphymurphy123123', timeout=10)
_, out, _ = ssh.exec_command('sqlite3 /opt/skivision/server/prod.db "SELECT email, role, name FROM User;"')
print('=== USERS ===')
print(out.read().decode('utf-8'))
ssh.close()
