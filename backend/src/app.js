const express = require('express');
const { createOrderRouter } = require('./routes/orders');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api', createOrderRouter(db));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = {
  createApp
};
