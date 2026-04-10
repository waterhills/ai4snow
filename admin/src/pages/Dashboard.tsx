import { useState, useEffect } from 'react';
import { Card, Statistic, Row, Col, Spin } from 'antd';
import {
  UserOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { adminApi } from '../services/api';

interface Stats {
  totalUsers: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  failedTasks: number;
  todayUsers: number;
  todayTasks: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await adminApi.getStats();
      setStats(res.data);
    } catch (err) {
      console.error('加载统计数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!stats) return null;

  const completionRate = stats.totalTasks > 0
    ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1)
    : '0';

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>📊 数据概览</h2>

      {/* 核心指标 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3b82f6' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="总任务数"
              value={stats.totalTasks}
              prefix={<FileSearchOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completedTasks}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#10b981' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="等待处理"
              value={stats.pendingTasks}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="失败"
              value={stats.failedTasks}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ef4444' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card>
            <Statistic
              title="完成率"
              value={completionRate}
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#10b981' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 今日数据 */}
      <h3 style={{ margin: '24px 0 16px' }}>📅 今日数据</h3>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Card>
            <Statistic title="新增用户" value={stats.todayUsers} valueStyle={{ color: '#3b82f6' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card>
            <Statistic title="新增任务" value={stats.todayTasks} valueStyle={{ color: '#8b5cf6' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
