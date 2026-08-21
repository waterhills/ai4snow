import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Tasks from './pages/Tasks';
import SystemStatus from './pages/SystemStatus';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

// 检查是否已登录
function isAuthenticated(): boolean {
  return !!localStorage.getItem('admin_token');
}

// 路由守卫
function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="login" replace />;
  }
  return <>{children}</>;
}

// 管理后台主布局
function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('login');
  };

  // 根据路径选中菜单项
  const selectedKey = location.pathname === '/' ? 'dashboard'
    : location.pathname.replace('/', '');

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '数据概览',
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
    {
      key: 'tasks',
      icon: <FileSearchOutlined />,
      label: '任务管理',
    },
    {
      key: 'system',
      icon: <CloudServerOutlined />,
      label: '系统状态',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: '#111827' }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #2a3441',
        }}>
          <Text strong style={{ color: '#60a5fa', fontSize: collapsed ? 16 : 18 }}>
            {collapsed ? '🎿' : '🎿 SkiVision'}
          </Text>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key === 'dashboard' ? '/' : `/${key}`)}
          style={{ background: 'transparent', borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid #2a3441',
        }}>
          <Text style={{ color: '#94a3b8' }}>
            管理后台
          </Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Text style={{ color: '#94a3b8' }}>
              {adminUser.email || '管理员'}
            </Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ color: '#94a3b8' }}
            >
              退出
            </Button>
          </div>
        </Header>

        <Content style={{
          margin: 24,
          padding: 24,
          background: '#0a0e1a',
          borderRadius: 8,
          minHeight: 'calc(100vh - 64px - 48px)',
        }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/system" element={<SystemStatus />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <AdminLayout />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
