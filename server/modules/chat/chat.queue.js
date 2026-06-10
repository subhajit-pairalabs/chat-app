const { publish, QUEUES } = require('../../config/rabbitmq');

class Queue {
  static async publish(data) {
    await publish(QUEUES.CHAT, data);
  }
}

module.exports = Queue;
