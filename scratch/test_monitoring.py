import requests
import json
import time

# 配置
BASE_URL = "http://localhost:3000"
ADMIN_EMAIL = "admin@skate.com"
ADMIN_PASSWORD = "admin123"

def test_monitoring():
    print("🚀 开始监控系统接口测试...")
    
    # 1. 登录获取 Token
    print("\n[1/4] 正在登录管理员账户...")
    try:
        login_resp = requests.post(f"{BASE_URL}/api/v1/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if login_resp.status_code != 200:
            print(f"❌ 登录失败: {login_resp.text}")
            return
        
        token = login_resp.json().get("token")
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ 登录成功，已获取 Token")
    except Exception as e:
        print(f"❌ 无法连接服务器: {e}")
        return

    # 2. 测试系统监控数据接口
    print("\n[2/4] 测试系统监控接口 (/api/admin/system/stats)...")
    stats_resp = requests.get(f"{BASE_URL}/api/admin/system/stats", headers=headers)
    if stats_resp.status_code == 200:
        data = stats_resp.json()
        print(f"✅ 成功获取数据!")
        print(f"   - CPU: {data['cpu']['percent']}% ({data['cpu']['model']})")
        print(f"   - 内存: {data['memory']['percent']}%")
        print(f"   - 在线 Worker: {len([w for w in data['workers'] if w['online']])} 个")
    else:
        print(f"❌ 获取监控数据失败: {stats_resp.status_code}")

    # 3. 测试趋势数据接口
    print("\n[3/4] 测试趋势数据接口 (/api/admin/dashboard/trends)...")
    trend_resp = requests.get(f"{BASE_URL}/api/admin/dashboard/trends", headers=headers)
    if trend_resp.status_code == 200:
        print(f"✅ 成功获取趋势数据，共 {len(trend_resp.json()['trends'])} 天数据")
    else:
        print(f"❌ 获取趋势数据失败: {trend_resp.status_code}")

    # 4. 模拟 Worker 心跳
    print("\n[4/4] 模拟 Worker 心跳...")
    # 这里模拟一个 Worker 请求待处理任务，触发心跳记录
    internal_headers = {"x-api-key": "dev-internal-key"} # 对应开发环境配置
    requests.get(f"{BASE_URL}/api/internal/callback/pending-tasks", headers=internal_headers)
    
    # 再次查看状态，验证 Worker 是否出现
    stats_resp = requests.get(f"{BASE_URL}/api/admin/system/stats", headers=headers)
    workers = stats_resp.json().get("workers", [])
    if any(w['online'] for w in workers):
        print("✅ Worker 心跳记录成功，Worker 已标记为在线")
    else:
        print("⚠️ Worker 未能标记为在线，请检查回调接口逻辑")

if __name__ == "__main__":
    test_monitoring()
