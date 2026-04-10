import { useState, useEffect } from 'react';
import { Table, Tag, Button, Select, Space, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../services/api';
import dayjs from 'dayjs';

interface Task {
  id: string;
  userId: string;
  status: string;
  inputFileKey: string;
  resultFileKey: string | null;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { email: string; name: string | null };
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [page, statusFilter]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getTasks({
        page,
        limit: 20,
        status: statusFilter || undefined,
      });
      setTasks(res.data.tasks);
      setTotal(res.data.total);
    } catch (err) {
      message.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await adminApi.retryTask(taskId);
      message.success('任务已重新提交');
      loadTasks();
    } catch (err: any) {
      message.error(err.response?.data?.error || '重试失败');
    }
  };

  const statusTagMap: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'orange', text: '等待处理' },
    PROCESSING: { color: 'blue', text: '处理中' },
    COMPLETED: { color: 'green', text: '已完成' },
    FAILED: { color: 'red', text: '失败' },
  };

  const columns = [
    {
      title: '任务 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => id.slice(0, 8) + '...',
      width: 120,
    },
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: Task) =>
        record.user?.email || record.userId.slice(0, 8),
    },
    {
      title: '输入文件',
      dataIndex: 'inputFileKey',
      key: 'inputFileKey',
      render: (key: string) => key.split('.').pop()?.toUpperCase(),
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusTagMap[status] || { color: 'default', text: status };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
      width: 100,
    },
    {
      title: '错误信息',
      dataIndex: 'errorMsg',
      key: 'errorMsg',
      render: (msg: string | null) =>
        msg ? <span style={{ color: '#ef4444', fontSize: 12 }}>{msg}</span> : '-',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('MM-DD HH:mm'),
      width: 120,
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: (date: string | null) =>
        date ? dayjs(date).format('MM-DD HH:mm') : '-',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: Task) =>
        record.status === 'FAILED' ? (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => handleRetry(record.id)}
          >
            重试
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>📋 任务管理</h2>
        <Space>
          <Select
            placeholder="筛选状态"
            style={{ width: 150 }}
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => { setStatusFilter(v || ''); setPage(1); }}
            options={[
              { label: '等待处理', value: 'PENDING' },
              { label: '处理中', value: 'PROCESSING' },
              { label: '已完成', value: 'COMPLETED' },
              { label: '失败', value: 'FAILED' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadTasks}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 个任务`,
        }}
        scroll={{ x: 900 }}
      />
    </div>
  );
}
