# 🚀 SkiVision / Glacial Lab 部署指南

这是一份为你准备的，将在香港 VPS (103.251.89.147) 上部署整个前后端架构的傻瓜式执行清单。

## 阶段一：在你的本地电脑上进行“生产环境编译”

在上传文件前，你需要将编写好的 React 代码无损压缩和编译为静态文件。

**1. 编译客户端 (Client)**
打开一个新终端并执行：
```bash
cd g:\myproject\skating\skate_web\client
npm run build
```
执行完毕后，`client` 目录下会出现一个 `dist` 文件夹。

**2. 编译服务端 (Server) (TypeScript 转换为 JavaScript)**
```bash
cd g:\myproject\skating\skate_web\server
npm run build
```
执行完毕后，`server` 目录下会出现一个 `dist` 文件夹。

---

## 阶段二：上传核心文件到香港 VPS

无需上传巨大的 `node_modules` 文件夹。你需要将以下三个部分上传至 VPS 的某个目录（例如 `/opt/skate_web/`）：

1. `server/` 文件夹（**请排除 `node_modules` 文件夹**）：
   - 必须包含 `package.json`
   - 必须包含 `dist/`
   - 必须包含 `prisma/` 和 `.env`
2. `client/dist/` 文件夹（将其重命名为 `client_dist`）
3. `admin/dist/` 文件夹（将其重命名为 `admin_dist`，如果后台你也打了包的话）

你可以使用 `scp` 或 `WinSCP` 工具进行上传。例如：
```bash
scp -P 4066 -r ./server root@103.251.89.147:/opt/skate_web/
```

---

## 阶段三：VPS 上的环境初始化

SSH 登录到你的香港 VPS：
```bash
ssh -p 4066 root@103.251.89.147
```

**1. 安装基础环境 (Node.js 20 & PM2)**
```bash
# 获取 Node.js 源
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# 安装 Node.js, Nginx
apt-get install -y nodejs nginx

# 安装 PM2 进程守护工具
npm install pm2 -g
```

**2. 安装后端系统依赖与挂载数据库**
```bash
cd /opt/skate_web/server

# 只安装生产环境相关的依赖
npm install --omit=dev

# 构建数据库 (SQLite)
npx prisma generate
npx prisma db push
```

**3. 用 PM2 启动 API 服务**
```bash
# 使用 PM2 启动 Node.js 服务端，确保断开终端也不会停止运行
pm2 start dist/index.js --name "skate_api"

# 设置开机自启
pm2 save
pm2 startup
```

---

## 阶段四：配置 Nginx 网关反向代理

在 VPS 上修改 Nginx 的配置，让用户可以通过 80 端口直接访问前端界面和后台 API。

用 nano 创建一个新的配置文件：
```bash
nano /etc/nginx/sites-available/skate_web
```
将以下内容粘贴进去并保存 (Ctrl+O, 按回车, 然后 Ctrl+X)：

```nginx
server {
    listen 80;
    server_name _;

    # 1. 前端客户端代理 (如果你的 client_dist 放在了 /opt/skate_web/client_dist)
    location / {
        root /opt/skate_web/client_dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. NodeJS 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 允许上传大文件，匹配你在后端的 500MB
        client_max_body_size 500M;
    }

    # 3. 媒体文件本地代理：交由 Node 或是直接让 Nginx 读盘
    location /uploads/ {
        proxy_pass http://127.0.0.1:3000/uploads/;
        client_max_body_size 500M;
    }
}
```

启用新配置并重启 Nginx：
```bash
# 删除默认页
rm /etc/nginx/sites-enabled/default
# 创建链接
ln -s /etc/nginx/sites-available/skate_web /etc/nginx/sites-enabled/
# 重启
systemctl restart nginx
```

🎉 **至此，部署完毕！你在随便什么地方输入 `http://103.251.89.147` 就能看到你华丽的新改版网站了！**
