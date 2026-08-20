import { useState, useEffect, useRef } from 'react';
import { Card, Statistic, Row, Col, Spin, Tag, Progress, Typography, Tooltip, Badge } from 'antd';
import {
  UserOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  RiseOutlined,
  CloudServerOutlined,
  HddOutlined,
  ApiOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Line, Column } from '@ant-design/plots';
import { adminApi } from '../services/api';

const { Text, Title } = Typography;

interface Stats {
  totalUsers: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  failedTasks: number;
  todayUsers: number;
  todayTasks: number;
}

interface SystemStats {
  cpu: { percent: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; percent: number };
  disk: Array<{ fs: string; size: number; used: number; available: number; percent: number; mount: string }>;
  system: { platform: string; distro: string; release: string; hostname: string; uptime: number; nodeVersion: string };
  queue: { pending: number };
  workers: Array<{ ip: string; lastSeen: string; userAgent?: string; online: boolean }>;
  history: Array<{ timestamp: string; cpuPercent: number; memPercent: number }>;
}

interface TrendItem {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

/** 字节数转人类可读格式 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/** 秒数转运行时间描述 */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

// 卡片通用样式
const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #111827 0%, #1a2332 100%)',
  borderRadius: 12,
  border: '1px solid #2a3441',
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAll();
    // 每 8 秒自动刷新系统监控数据
    pollingRef.current = setInterval(() => {
      loadSystemStats();
    }, 8000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadSystemStats(), loadTrends()]);
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await adminApi.getStats();
      setStats(res.data);
    } catch (err) {
      console.error('加载统计数据失败:', err);
    }
  };

  const loadSystemStats = async () => {
    try {
      const res = await adminApi.getSystemStats();
      setSysStats(res.data);
    } catch (err) {
      console.error('加载系统状态失败:', err);
    }
  };

  const loadTrends = async () => {
    try {
      const res = await adminApi.getTrends();
      setTrends(res.data.trends || []);
    } catch (err) {
      console.error('加载趋势数据失败:', err);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!stats) return null;

  const completionRate = stats.totalTasks > 0
    ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1)
    : '0';

  // 在线 Worker 数量
  const onlineWorkers = sysStats?.workers.filter(w => w.online).length ?? 0;

  // CPU/内存趋势图数据（双折线）
  const historyData = (sysStats?.history || []).flatMap(item => {
    const time = new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [
      { time, value: item.cpuPercent, type: 'CPU' },
      { time, value: item.memPercent, type: '内存' },
    ];
  });

  // 任务趋势图数据
  const trendData = trends.flatMap(item => [
    { date: item.date.slice(5), value: item.completed, type: '完成' },
    { date: item.date.slice(5), value: item.failed, type: '失败' },
  ]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>📊 数据概览</Title>
        <Tooltip title="刷新数据">
          <ReloadOutlined
            onClick={loadAll}
            style={{ fontSize: 18, color: '#60a5fa', cursor: 'pointer', transition: 'transform 0.3s' }}
          />
        </Tooltip>
      </div>

      {/* ======= 第一行：核心业务指标 ======= */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="总用户数"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#60a5fa' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              今日 +{stats.todayUsers}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="总任务数"
              value={stats.totalTasks}
              prefix={<FileSearchOutlined />}
              valueStyle={{ color: '#a78bfa' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              今日 +{stats.todayTasks}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="已完成"
              value={stats.completedTasks}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#34d399' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="等待处理"
              value={stats.pendingTasks}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#fbbf24' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="失败"
              value={stats.failedTasks}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#f87171' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card style={cardStyle} hoverable>
            <Statistic
              title="完成率"
              value={completionRate}
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#34d399' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ======= 第二行：系统资源监控 ======= */}
      {sysStats && (
        <>
          <Title level={4} style={{ margin: '28px 0 16px' }}>
            <CloudServerOutlined style={{ marginRight: 8, color: '#60a5fa' }} />
            服务器状态
            <Badge
              status="processing"
              text={<Text style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>实时监控中 · 每 8 秒刷新</Text>}
              style={{ marginLeft: 8 }}
            />
          </Title>

          <Row gutter={[16, 16]}>
            {/* CPU */}
            <Col xs={24} sm={12} lg={6}>
              <Card style={cardStyle} hoverable>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>CPU 使用率</Text>
                  <Progress
                    type="dashboard"
                    percent={sysStats.cpu.percent}
                    strokeColor={{
                      '0%': '#60a5fa',
                      '100%': sysStats.cpu.percent > 80 ? '#ef4444' : '#34d399',
                    }}
                    format={(p) => <span style={{ color: '#e2e8f0', fontSize: 20 }}>{p}%</span>}
                    size={120}
                    style={{ margin: '12px 0' }}
                  />
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    {sysStats.cpu.cores} 核 · {sysStats.cpu.model.split(' ').slice(0, 3).join(' ')}
                  </div>
                </div>
              </Card>
            </Col>

            {/* 内存 */}
            <Col xs={24} sm={12} lg={6}>
              <Card style={cardStyle} hoverable>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>内存使用率</Text>
                  <Progress
                    type="dashboard"
                    percent={sysStats.memory.percent}
                    strokeColor={{
                      '0%': '#a78bfa',
                      '100%': sysStats.memory.percent > 85 ? '#ef4444' : '#34d399',
                    }}
                    format={(p) => <span style={{ color: '#e2e8f0', fontSize: 20 }}>{p}%</span>}
                    size={120}
                    style={{ margin: '12px 0' }}
                  />
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    {formatBytes(sysStats.memory.used)} / {formatBytes(sysStats.memory.total)}
                  </div>
                </div>
              </Card>
            </Col>

            {/* 磁盘 */}
            <Col xs={24} sm={12} lg={6}>
              <Card style={cardStyle} hoverable>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                    <HddOutlined style={{ marginRight: 4 }} />磁盘使用
                  </Text>
                  {sysStats.disk.slice(0, 2).map((d, i) => (
                    <div key={i} style={{ margin: '12px 0 4px' }}>
                      <Text style={{ color: '#cbd5e1', fontSize: 12 }}>{d.mount}</Text>
                      <Progress
                        percent={Math.round(d.percent)}
                        strokeColor={d.percent > 90 ? '#ef4444' : d.percent > 70 ? '#fbbf24' : '#34d399'}
                        size="small"
                        style={{ marginTop: 4 }}
                      />
                      <Text style={{ color: '#64748b', fontSize: 11 }}>
                        可用 {formatBytes(d.available)}
                      </Text>
                    </div>
                  ))}
                </div>
              </Card>
            </Col>

            {/* Worker 状态 */}
            <Col xs={24} sm={12} lg={6}>
              <Card style={cardStyle} hoverable>
                <div style={{ textAlign: 'center' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                    <ApiOutlined style={{ marginRight: 4 }} />Worker 状态
                  </Text>
                  <div style={{ margin: '16px 0' }}>
                    <Statistic
                      value={onlineWorkers}
                      suffix={<span style={{ fontSize: 14, color: '#64748b' }}>在线</span>}
                      valueStyle={{ color: onlineWorkers > 0 ? '#34d399' : '#f87171', fontSize: 36 }}
                    />
                  </div>
                  {sysStats.workers.length === 0 ? (
                    <Tag color="default">暂无 Worker 连接</Tag>
                  ) : (
                    sysStats.workers.map((w, i) => (
                      <Tag key={i} color={w.online ? 'green' : 'default'} style={{ marginTop: 4 }}>
                        {w.ip.replace('::ffff:', '')} {w.online ? '● 在线' : '○ 离线'}
                      </Tag>
                    ))
                  )}
                  <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
                    队列等待: {sysStats.queue.pending >= 0 ? sysStats.queue.pending : 'N/A'}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 系统信息条 */}
          <Card size="small" style={{ ...cardStyle, marginTop: 16, padding: '4px 8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 12, color: '#94a3b8' }}>
              <span>🖥 主机: {sysStats.system.hostname}</span>
              <span>📦 系统: {sysStats.system.distro} {sysStats.system.release}</span>
              <span>⏱ 运行: {formatUptime(sysStats.system.uptime)}</span>
              <span>🟢 Node: {sysStats.system.nodeVersion}</span>
            </div>
          </Card>
        </>
      )}

      {/* ======= 第三行：趋势图 ======= */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {/* CPU/内存实时趋势 */}
        <Col xs={24} lg={12}>
          <Card
            title={<Text style={{ color: '#e2e8f0' }}>📈 资源使用趋势</Text>}
            style={cardStyle}
            styles={{ body: { padding: '12px 16px' } }}
          >
            {historyData.length > 0 ? (
              <Line
                data={historyData}
                xField="time"
                yField="value"
                colorField="type"
                height={240}
                smooth
                axis={{
                  y: { title: '使用率 (%)', labelFormatter: (v: number) => `${v}%` },
                  x: { label: { autoRotate: true, style: { fontSize: 10 } } },
                }}
                scale={{ color: { range: ['#60a5fa', '#a78bfa'] } }}
                style={{ lineWidth: 2 }}
                animate={{ enter: { type: 'fadeIn' } }}
                legend={{ position: 'top-right' }}
              />
            ) : (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                数据采集中，等待几次刷新后显示趋势...
              </div>
            )}
          </Card>
        </Col>

        {/* 任务处理趋势 */}
        <Col xs={24} lg={12}>
          <Card
            title={<Text style={{ color: '#e2e8f0' }}>📊 近 7 天任务趋势</Text>}
            style={cardStyle}
            styles={{ body: { padding: '12px 16px' } }}
          >
            {trendData.length > 0 ? (
              <Column
                data={trendData}
                xField="date"
                yField="value"
                colorField="type"
                height={240}
                group
                scale={{ color: { range: ['#34d399', '#f87171'] } }}
                style={{ radiusTopLeft: 4, radiusTopRight: 4 }}
                animate={{ enter: { type: 'fadeIn' } }}
                legend={{ position: 'top-right' }}
              />
            ) : (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                暂无任务数据
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
