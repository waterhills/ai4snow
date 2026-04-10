import { useState, useEffect } from 'react';
import {
  Table, Input, Button, Space, Tag, Modal, InputNumber, message, Typography,
} from 'antd';
import { SearchOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { adminApi } from '../services/api';
import dayjs from 'dayjs';

const { Text } = Typography;

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  createdAt: string;
  _count: { tasks: number };
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // 充值弹窗
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState<number>(10);
  const [remark, setRemark] = useState('');
  const [rechargeLoading, setRechargeLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [page, search]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({ page, limit: 20, search: search || undefined });
      setUsers(res.data.users);
      setTotal(res.data.total);
    } catch (err) {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = (user: User) => {
    setSelectedUser(user);
    setRechargeAmount(10);
    setRemark('');
    setRechargeOpen(true);
  };

  const doRecharge = async () => {
    if (!selectedUser || !rechargeAmount) return;
    setRechargeLoading(true);
    try {
      await adminApi.manualRecharge(selectedUser.id, rechargeAmount, remark || undefined);
      message.success(`已为 ${selectedUser.email} 充值 ${rechargeAmount} 积分`);
      setRechargeOpen(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '充值失败');
    } finally {
      setRechargeLoading(false);
    }
  };

  const handleDeduct = async (user: User) => {
    Modal.confirm({
      title: '扣减积分',
      content: `确定要扣减 ${user.email} 的 1 积分吗？`,
      onOk: async () => {
        try {
          await adminApi.updateCredits(user.id, -1, '管理员手动扣减');
          message.success('扣减成功');
          loadUsers();
        } catch (err: any) {
          message.error(err.response?.data?.error || '操作失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '昵称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string | null) => name || <Text type="secondary">未设置</Text>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>
          {role === 'ADMIN' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '积分',
      dataIndex: 'credits',
      key: 'credits',
      render: (credits: number) => (
        <Text strong style={{ color: credits > 0 ? '#10b981' : '#ef4444' }}>
          {credits}
        </Text>
      ),
    },
    {
      title: '任务数',
      dataIndex: '_count',
      key: 'tasks',
      render: (count: { tasks: number }) => count.tasks,
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleRecharge(record)}
          >
            充值
          </Button>
          <Button
            size="small"
            danger
            icon={<MinusOutlined />}
            onClick={() => handleDeduct(record)}
            disabled={record.credits <= 0}
          >
            扣减
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>👥 用户管理</h2>
        <Input.Search
          placeholder="搜索邮箱或昵称"
          style={{ width: 300 }}
          prefix={<SearchOutlined />}
          onSearch={(value) => { setSearch(value); setPage(1); }}
          allowClear
        />
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 个用户`,
        }}
      />

      {/* 充值弹窗 */}
      <Modal
        title={`为 ${selectedUser?.email} 充值积分`}
        open={rechargeOpen}
        onOk={doRecharge}
        onCancel={() => setRechargeOpen(false)}
        confirmLoading={rechargeLoading}
        okText="确认充值"
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">当前积分：{selectedUser?.credits}</Text>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text>充值数量：</Text>
          <InputNumber
            min={1}
            max={99999}
            value={rechargeAmount}
            onChange={(v) => setRechargeAmount(v || 1)}
            style={{ width: '100%', marginTop: 8 }}
            size="large"
          />
        </div>
        <div>
          <Text>备注 (可选)：</Text>
          <Input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="充值原因"
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
}
