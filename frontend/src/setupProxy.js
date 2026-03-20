const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target = 'http://127.0.0.1:5000';
  const opts = { target, changeOrigin: true };
  app.use('/api', createProxyMiddleware(opts));
  app.use('/uploads', createProxyMiddleware(opts));
};
