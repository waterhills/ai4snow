import { useState, useEffect } from 'react';
import {
  Table, Input, Button, Space, Tag, Modal, InputNumber, message, Typography,
  Dropdown, DatePicker, Form, Popconfirm, Tooltip, Badge,
} from 'antd';
import {
  SearchOutlined, PlusOutlined, MinusOutlined, EditOutlined,
  StopOutlined, CheckCircleOutlined, DeleteOutlined,
  CrownOutlined, MoreOutlined,
} from '@ant-design/icons';
import { adminApi } from '../services/api';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  credits: number;
  vipCredits: number;
  vipExpireAt: string | null;
  vipRefreshAt: string | null;
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

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // VIP 设置弹窗
  const [vipOpen, setVipOpen] = useState(false);
  const [vipUser, setVipUser] = useState<User | null>(null);
  const [vipMonths, setVipMonths] = useState(1);
  const [vipLoading, setVipLoading] = useState(false);

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

  // ========== 充值 ==========
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

  // ========== 扣减积分 ==========
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

  // ========== 编辑用户 ==========
  const handleEdit = (user: User) => {
    setEditUser(user);
    editForm.setFieldsValue({ name: user.name || '' });
    setEditOpen(true);
  };

  const doEdit = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const values = editForm.getFieldsValue();
      await adminApi.updateUser(editUser.id, { name: values.name });
      message.success('修改成功');
      setEditOpen(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setEditLoading(false);
    }
  };

  // ========== 设置 VIP ==========
  const handleSetVip = (user: User) => {
    setVipUser(user);
    setVipMonths(1);
    setVipOpen(true);
  };

  const doSetVip = async () => {
    if (!vipUser) return;
    setVipLoading(true);
    try {
      const expireAt = dayjs().add(vipMonths, 'month').toISOString();
      await adminApi.updateUser(vipUser.id, { vipExpireAt: expireAt });
      message.success(`已为 ${vipUser.email} 开通 ${vipMonths} 个月 VIP 会员`);
      setVipOpen(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    } finally {
      setVipLoading(false);
    }
  };

  // ========== 封禁/解封 ==========
  const handleBan = async (user: User) => {
    const action = user.status === 'BANNED' ? '解封' : '封禁';
    try {
      await adminApi.banUser(user.id);
      message.success(`${action}成功`);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || `${action}失败`);
    }
  };

  // ========== 注销 ==========
  const handleCancel = async (user: User) => {
    try {
      await adminApi.cancelUser(user.id);
      message.success('账号已注销，数据已匿名化');
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '注销失败');
    }
  };

  // 判断用户当前是否为 VIP
  const isVip = (user: User) => user.vipExpireAt && dayjs(user.vipExpireAt).isAfter(dayjs());

  // 状态标签
  const statusTag = (status: string) => {
    switch (status) {
      case 'ACTIVE': return <Tag color="green">正常</Tag>;
      case 'BANNED': return <Tag color="red">已封禁</Tag>;
      case 'CANCELLED': return <Tag color="default">已注销</Tag>;
      default: return <Tag>{status}</Tag>;
    }
  };

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      width: 200,
    },
    {
      title: '昵称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (name: string | null) => name || <Text type="secondary">未设置</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => statusTag(status),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 80,
      render: (role: string) => (
        <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>
          {role === 'ADMIN' ? '管理员' : '用户'}
        </Tag>
      ),
    },
    {
      title: '基础积分',
      dataIndex: 'credits',
      key: 'credits',
      width: 80,
      render: (credits: number) => (
        <Text strong style={{ color: credits > 0 ? '#10b981' : '#ef4444' }}>
          {credits}
        </Text>
      ),
    },
    {
      title: '会员',
      key: 'vip',
      width: 160,
      render: (_: any, record: User) => {
        if (!record.vipExpireAt) {
          return <Text type="secondary">—</Text>;
        }
        const expired = dayjs(record.vipExpireAt).isBefore(dayjs());
        return (
          <Space direction="vertical" size={0}>
            <Badge
              status={expired ? 'default' : 'processing'}
              text={
                <Text style={{ color: expired ? '#94a3b8' : '#fbbf24', fontSize: 12 }}>
                  <CrownOutlined style={{ marginRight: 4 }} />
                  {expired ? '已过期' : 'VIP'}
                </Text>
              }
            />
            <Text style={{ color: '#64748b', fontSize: 11 }}>
              {expired ? '过期' : '到期'}: {dayjs(record.vipExpireAt).format('YYYY-MM-DD')}
            </Text>
            {!expired && (
              <Text style={{ color: '#60a5fa', fontSize: 11 }}>
                本月剩余: {record.vipCredits} 次
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '任务数',
      dataIndex: '_count',
      key: 'tasks',
      width: 70,
      render: (count: { tasks: number }) => count.tasks,
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: User) => {
        // 已注销的用户不能操作
        if (record.status === 'CANCELLED') {
          return <Text type="secondary" style={{ fontSize: 12 }}>已注销</Text>;
        }

        const moreItems = [
          {
            key: 'edit',
            label: '编辑信息',
            icon: <EditOutlined />,
            onClick: () => handleEdit(record),
          },
          {
            key: 'vip',
            label: isVip(record) ? '续费会员' : '开通会员',
            icon: <CrownOutlined />,
            onClick: () => handleSetVip(record),
          },
          {
            key: 'ban',
            label: record.status === 'BANNED' ? '解封账号' : '封禁账号',
            icon: record.status === 'BANNED' ? <CheckCircleOutlined /> : <StopOutlined />,
            danger: record.status !== 'BANNED',
            onClick: () => {
              Modal.confirm({
                title: record.status === 'BANNED' ? '确认解封' : '确认封禁',
                content: `确定要${record.status === 'BANNED' ? '解封' : '封禁'} ${record.email} 吗？`,
                onOk: () => handleBan(record),
              });
            },
          },
          { type: 'divider' as const },
          {
            key: 'cancel',
            label: '注销账号',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: '⚠️ 危险操作：注销账号',
                content: (
                  <div>
                    <p>确定要注销 <strong>{record.email}</strong> 的账号吗？</p>
                    <p style={{ color: '#ef4444' }}>此操作不可逆！用户的邮箱和密码将被匿名化处理，历史任务和支付记录将保留。</p>
                  </div>
                ),
                okText: '确认注销',
                okButtonProps: { danger: true },
                onOk: () => handleCancel(record),
              });
            },
          },
        ];

        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleRecharge(record)}
            >
              充值
            </Button>
            <Tooltip title="扣减 1 积分">
              <Button
                size="small"
                danger
                icon={<MinusOutlined />}
                onClick={() => handleDeduct(record)}
                disabled={record.credits <= 0}
              />
            </Tooltip>
            <Dropdown menu={{ items: moreItems }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>👥 用户管理</Title>
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
        scroll={{ x: 1200 }}
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
          <Text type="secondary">当前基础积分：{selectedUser?.credits}</Text>
          {selectedUser?.vipCredits ? (
            <Text type="secondary" style={{ marginLeft: 16 }}>VIP 剩余：{selectedUser.vipCredits}</Text>
          ) : null}
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

      {/* 编辑用户弹窗 */}
      <Modal
        title={`编辑用户 - ${editUser?.email}`}
        open={editOpen}
        onOk={doEdit}
        onCancel={() => setEditOpen(false)}
        confirmLoading={editLoading}
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="昵称" name="name">
            <Input placeholder="用户昵称" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 设置 VIP 弹窗 */}
      <Modal
        title={
          <Space>
            <CrownOutlined style={{ color: '#fbbf24' }} />
            {vipUser && isVip(vipUser) ? '续费会员' : '开通会员'}
            <Text type="secondary" style={{ fontSize: 12 }}>- {vipUser?.email}</Text>
          </Space>
        }
        open={vipOpen}
        onOk={doSetVip}
        onCancel={() => setVipOpen(false)}
        confirmLoading={vipLoading}
        okText="确认"
      >
        {vipUser?.vipExpireAt && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: '#1a2332', borderRadius: 8 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>
              当前到期时间：{dayjs(vipUser.vipExpireAt).format('YYYY-MM-DD HH:mm')}
              {dayjs(vipUser.vipExpireAt).isBefore(dayjs())
                ? <Tag color="default" style={{ marginLeft: 8 }}>已过期</Tag>
                : <Tag color="green" style={{ marginLeft: 8 }}>生效中</Tag>
              }
            </Text>
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <Text>开通时长：</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[1, 3, 6, 12].map(m => (
              <Button
                key={m}
                type={vipMonths === m ? 'primary' : 'default'}
                onClick={() => setVipMonths(m)}
              >
                {m} 个月
              </Button>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px', background: '#111827', borderRadius: 8, border: '1px solid #2a3441' }}>
          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
            📋 操作说明：开通后将立即赠送当月 <strong style={{ color: '#fbbf24' }}>20 次</strong> 免费额度，每月 1 日自动刷新。
            到期时间将设为 <strong style={{ color: '#60a5fa' }}>{dayjs().add(vipMonths, 'month').format('YYYY-MM-DD')}</strong>。
          </Text>
        </div>
      </Modal>
    </div>
  );
}
