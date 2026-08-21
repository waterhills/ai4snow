import paramiko

HOST = "103.251.89.147"
SSH_PORT = 4066
USER = "root"
PASS = "@Murphymurphy123123"
REMOTE_ENV = "/opt/skivision/server/.env"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname=HOST, port=SSH_PORT, username=USER, password=PASS)

# 准备新配置
mail_config = [
    "MAIL_HOST=smtp.qq.com",
    "MAIL_PORT=465",
    "MAIL_USER=947441390@qq.com",
    "MAIL_PASS=devomdwsuudzbfhj"
]

print("Updating remote .env...")
for line in mail_config:
    key = line.split('=')[0]
    # 先删除旧的（如果存在），然后追加
    cmd = f"sed -i '/^{key}=/d' {REMOTE_ENV} && echo '{line}' >> {REMOTE_ENV}"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.read()

ssh.close()
print("Done updating remote .env")
