import { useState, useEffect } from 'react';
import { Card, Row, Col, Spin, Tag, Typography, Descriptions, Table, Badge, Space, Button, message } from 'antd';
import {
  CloudServerOutlined,
  DatabaseOutlined,
  ApiOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { adminApi } from '../services/api';

const { Title, Text } = Typography;

interface SystemStats {
  cpu: { percent: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; percent: number };
  disk: Array<{ fs: string; size: number; used: number; available: number; percent: number; mount: string }>;
  system: { platform: string; distro: string; release: string; hostname: string; uptime: number; nodeVersion: string };
  queue: { pending: number };
  workers: Array<{ ip: string; lastSeen: string; userAgent?: string; online: boolean }>;
  history: Array<{ timestamp: string; cpuPercent: number; memPercent: number }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} 天`);
  if (h > 0) parts.push(`${h} 小时`);
  if (m > 0) parts.push(`${m} 分钟`);
  if (parts.length === 0) parts.push(`${s} 秒`);
  return parts.join(' ');
}

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #111827 0%, #1a2332 100%)',
  borderRadius: 12,
  border: '1px solid #2a3441',
};

export default function SystemStatus() {
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await adminApi.getSystemStats();
      setSysStats(res.data);
    } catch (err) {
      console.error('加载系统状态失败:', err);
      message.error('加载系统状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    message.success('数据已刷新');
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!sysStats) return null;

  // 磁盘列表数据
  const diskColumns = [
    { title: '挂载点', dataIndex: 'mount', key: 'mount' },
    { title: '文件系统', dataIndex: 'fs', key: 'fs' },
    {
      title: '总容量', dataIndex: 'size', key: 'size',
      render: (v: number) => formatBytes(v),
    },
    {
      title: '已使用', dataIndex: 'used', key: 'used',
      render: (v: number) => formatBytes(v),
    },
    {
      title: '可用', dataIndex: 'available', key: 'available',
      render: (v: number) => formatBytes(v),
    },
    {
      title: '使用率', dataIndex: 'percent', key: 'percent',
      render: (v: number) => (
        <Tag color={v > 90 ? 'red' : v > 70 ? 'orange' : 'green'}>
          {Math.round(v)}%
        </Tag>
      ),
    },
  ];

  // Worker 列表数据
  const workerColumns = [
    {
      title: '状态', dataIndex: 'online', key: 'online',
      render: (online: boolean) => online
        ? <Badge status="success" text={<Text style={{ color: '#34d399' }}>在线</Text>} />
        : <Badge status="default" text={<Text style={{ color: '#94a3b8' }}>离线</Text>} />,
    },
    {
      title: 'IP 地址', dataIndex: 'ip', key: 'ip',
      render: (ip: string) => <Text copyable style={{ color: '#e2e8f0' }}>{ip.replace('::ffff:', '')}</Text>,
    },
    {
      title: '最后心跳', dataIndex: 'lastSeen', key: 'lastSeen',
      render: (t: string) => new Date(t).toLocaleString('zh-CN'),
    },
    { title: 'User-Agent', dataIndex: 'userAgent', key: 'userAgent',
      render: (ua?: string) => <Text ellipsis style={{ maxWidth: 300, color: '#94a3b8' }}>{ua || '-'}</Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <CloudServerOutlined style={{ marginRight: 8, color: '#60a5fa' }} />
          系统状态
        </Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          刷新
        </Button>
      </div>

      {/* 系统环境信息 */}
      <Card title={<Text style={{ color: '#e2e8f0' }}>🖥 系统环境</Text>} style={{ ...cardStyle, marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label="主机名">{sysStats.system.hostname}</Descriptions.Item>
          <Descriptions.Item label="操作系统">{sysStats.system.distro} {sysStats.system.release}</Descriptions.Item>
          <Descriptions.Item label="平台">{sysStats.system.platform}</Descriptions.Item>
          <Descriptions.Item label="CPU 型号">{sysStats.cpu.model}</Descriptions.Item>
          <Descriptions.Item label="CPU 核心数">{sysStats.cpu.cores}</Descriptions.Item>
          <Descriptions.Item label="Node.js 版本">{sysStats.system.nodeVersion}</Descriptions.Item>
          <Descriptions.Item label="运行时间">{formatUptime(sysStats.system.uptime)}</Descriptions.Item>
          <Descriptions.Item label="内存总量">{formatBytes(sysStats.memory.total)}</Descriptions.Item>
          <Descriptions.Item label="可用内存">{formatBytes(sysStats.memory.free)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        {/* 服务健康检查 */}
        <Col xs={24} lg={12}>
          <Card title={<Text style={{ color: '#e2e8f0' }}>🩺 服务健康检查</Text>} style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <DatabaseOutlined style={{ color: '#60a5fa' }} />
                  <Text style={{ color: '#e2e8f0' }}>数据库 (SQLite/Prisma)</Text>
                </Space>
                <Tag icon={<CheckCircleOutlined />} color="success">正常</Tag>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <DatabaseOutlined style={{ color: '#ef4444' }} />
                  <Text style={{ color: '#e2e8f0' }}>Redis 队列</Text>
                </Space>
                <Tag
                  icon={sysStats.queue.pending >= 0 ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  color={sysStats.queue.pending >= 0 ? 'success' : 'error'}
                >
                  {sysStats.queue.pending >= 0 ? `正常 (${sysStats.queue.pending} 待处理)` : '未连接'}
                </Tag>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <ApiOutlined style={{ color: '#a78bfa' }} />
                  <Text style={{ color: '#e2e8f0' }}>Worker 服务</Text>
                </Space>
                {(() => {
                  const online = sysStats.workers.filter(w => w.online).length;
                  return (
                    <Tag
                      icon={online > 0 ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      color={online > 0 ? 'success' : 'warning'}
                    >
                      {online > 0 ? `${online} 个在线` : '无在线 Worker'}
                    </Tag>
                  );
                })()}
              </div>
            </Space>
          </Card>
        </Col>

        {/* 实时资源摘要 */}
        <Col xs={24} lg={12}>
          <Card title={<Text style={{ color: '#e2e8f0' }}>📊 实时资源</Text>} style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="CPU 使用率">
                <Tag color={sysStats.cpu.percent > 80 ? 'red' : sysStats.cpu.percent > 50 ? 'orange' : 'green'}>
                  {sysStats.cpu.percent}%
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="内存使用率">
                <Tag color={sysStats.memory.percent > 85 ? 'red' : sysStats.memory.percent > 60 ? 'orange' : 'green'}>
                  {sysStats.memory.percent}% ({formatBytes(sysStats.memory.used)} / {formatBytes(sysStats.memory.total)})
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="队列等待数">
                <Tag>{sysStats.queue.pending >= 0 ? sysStats.queue.pending : 'N/A'}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* 磁盘详情 */}
      <Card
        title={<Text style={{ color: '#e2e8f0' }}>💾 磁盘详情</Text>}
        style={{ ...cardStyle, marginTop: 16 }}
      >
        <Table
          dataSource={sysStats.disk}
          columns={diskColumns}
          rowKey="mount"
          pagination={false}
          size="small"
        />
      </Card>

      {/* Worker 连接详情 */}
      <Card
        title={<Text style={{ color: '#e2e8f0' }}>🤖 Worker 连接记录</Text>}
        style={{ ...cardStyle, marginTop: 16 }}
      >
        {sysStats.workers.length > 0 ? (
          <Table
            dataSource={sysStats.workers}
            columns={workerColumns}
            rowKey="ip"
            pagination={false}
            size="small"
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            暂无 Worker 连接记录。Worker 首次轮询任务后将自动出现在此列表中。
          </div>
        )}
      </Card>
    </div>
  );
}
