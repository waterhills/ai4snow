# 香港 VPS 完整信息手册

## 🔑 登录凭证

**SSH 连接信息**
- IP 地址：`103.251.89.147`
- SSH 端口：`4066`（非标准端口，防暴破）
- 用户名：`root`
- 密码：`@Murphymurphy123123`

**快速登录命令**
```bash
ssh -p 4066 root@103.251.89.147
```

**从 Mac 自动登录脚本**（已创建在桌面）
```bash
/Users/murphy/Desktop/vps_login.sh
```

---

## 💻 系统信息

**操作系统**
- 发行版：Debian GNU/Linux 12 (bookworm)
- 内核：6.1.0-10-amd64
- 架构：x86_64
- 主机名：C20260325106908

**硬件资源**
- 总内存：1967 MB (~2GB)
- 可用内存：~1676 MB
- Swap：0 MB（未配置）
- 存储：未详细检测

**网络**
- 公网 IP：103.251.89.147
- 延迟：~86ms（从 Mac mini）
- 地理位置：香港

---

## 🚀 已部署服务

### frps（内网穿透服务端）

**版本信息**
- 版本：v0.61.0
- 安装路径：`/usr/local/bin/frps`
- 配置文件：`/etc/frp/frps.toml`

**配置内容**
```toml
bindPort = 7000
auth.token = "MurphySki2026!"
```

**服务管理**
- systemd 服务：`frps.service`
- 服务文件：`/etc/systemd/system/frps.service`
- 当前状态：active (running)
- 开机自启：已启用
- 进程 PID：42331
- 内存占用：8.8 MB

**监听端口**
- `7000/tcp`：frps 控制端口（客户端连接）
- `8503/tcp`：预留给 Web 服务映射（客户端连接后开放）

---

## 🔒 安全配置

**防火墙状态**
- UFW：未安装
- iptables：未安装
- **当前状态**：所有端口默认开放（无防火墙）

**SSH 安全**
- ✅ 非标准端口 4066
- ⚠️ root 直接登录
- ⚠️ 密码认证（未配置密钥）

---

## 📋 常用管理命令

### SSH 连接
```bash
# 标准连接
ssh -p 4066 root@103.251.89.147

# 使用自动登录脚本
/Users/murphy/Desktop/vps_login.sh
```

### frps 服务管理
```bash
# 查看服务状态
systemctl status frps

# 启动服务
systemctl start frps

# 停止服务
systemctl stop frps

# 重启服务
systemctl restart frps

# 查看实时日志
journalctl -u frps -f

# 查看最近 100 行日志
journalctl -u frps -n 100
```

### 系统监控
```bash
# 查看内存使用
free -m

# 查看磁盘使用
df -h

# 查看监听端口
ss -tuln | grep LISTEN

# 查看进程
ps aux | grep frps

# 查看系统负载
top
```

### 网络检查
```bash
# 测试端口连通性（从本地 Mac）
nc -zv -G 3 103.251.89.147 7000

# 查看服务器监听端口
ss -tuln | grep -E ':(7000|8503)'
```

---

## 🎯 业务架构角色

**在滑雪项目中的定位**
```
用户（微信/浏览器）
    ↓
香港 VPS (103.251.89.147:8503)  ← 公网入口，规避备案
    ↓ frp 隧道（端口 7000）
Mac mini (本地 8503)  ← 算力节点，AI 推理
```

**工作流程**
1. 用户访问 `http://103.251.89.147:8503`
2. 香港 VPS 的 frps 通过隧道转发到 Mac mini
3. Mac mini 的 Streamlit 处理请求
4. 结果原路返回给用户

---

## ⚙️ frp 客户端配置（Mac mini 端）

**需要在 Mac mini 上配置的 frpc.toml**
```toml
serverAddr = "103.251.89.147"
serverPort = 7000
auth.token = "MurphySki2026!"

[[proxies]]
name = "ski_web"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8503
remotePort = 8503
```

---

## ⚠️ 当前限制

1. **无 HTTPS**：只支持 HTTP
2. **无域名**：直接用 IP 访问
3. **无防火墙**：所有端口暴露
4. **无 Swap**：内存不足时可能崩溃
5. **无监控**：没有告警机制

---

## 📝 部署日期

- 初始化：2026-03-25
- frps 部署：2026-03-25
- 最后更新：2026-03-31

---

## 🔧 故障排查

### frps 服务无法启动
```bash
# 查看详细错误日志
journalctl -u frps -n 50

# 检查配置文件语法
/usr/local/bin/frps -c /etc/frp/frps.toml verify

# 手动启动测试
/usr/local/bin/frps -c /etc/frp/frps.toml
```

### 端口无法访问
```bash
# 检查端口是否监听
ss -tuln | grep 7000

# 检查进程是否运行
ps aux | grep frps

# 从外部测试端口（在 Mac 上运行）
nc -zv -G 3 103.251.89.147 7000
```

### 内存不足
```bash
# 查看内存使用
free -m

# 查看占用内存最多的进程
ps aux --sort=-%mem | head -10

# 临时清理缓存
sync && echo 3 > /proc/sys/vm/drop_caches
```

---

## 📞 紧急联系

如果服务器完全无法访问：
1. 检查 VPS 供应商控制面板
2. 使用 Web 终端登录
3. 检查是否欠费或被封禁
4. 联系 VPS 供应商技术支持
