import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';

// Ant Design 暗色主题定制
const customTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    borderRadius: 8,
    colorBgContainer: '#111827',
    colorBgElevated: '#1f2937',
    colorBorder: '#2a3441',
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={customTheme} locale={zhCN}>
      <BrowserRouter basename="/admin">
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
