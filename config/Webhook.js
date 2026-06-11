import dotenv from 'dotenv';

dotenv.config();

class Webhook {
    constructor() {
        if (!process.env.SLACK_WEBHOOK) {
            throw new Error('SLACK_WEBHOOK environment variable is not set');
        }
    }

    getWebhook() {
        return process.env.SLACK_WEBHOOK;
    }
}

export default Webhook;