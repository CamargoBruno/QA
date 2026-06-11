import dotenv from 'dotenv';

dotenv.config();

class Site {
    constructor() {
        if (!process.env.SITE_URL) {
            throw new Error('SITE_URL environment variable is not set');
        }
    }

    getSiteUrl() {
        return process.env.SITE_URL;
    }

    getSite() {
        return process.env.SITE_URL;
    }
}

export default Site;