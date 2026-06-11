import dotenv from 'dotenv';

dotenv.config();

class User {
    constructor() {
        if (!process.env.TEST_USER || !process.env.TEST_PASS) {
            throw new Error('TEST_USER or TEST_PASS environment variable is not set');
        }

        if (!process.env.TEST_USER_FREE || !process.env.TEST_PASS_FREE) {
            throw new Error('TEST_USER_FREE or TEST_PASS_FREE environment variable is not set');
        }
    }
    getEmail() {
        return process.env.TEST_USER;
    }
    getPassword() {
        return process.env.TEST_PASS;
    }
    getEmailFree() {
        return process.env.TEST_USER_FREE;
    }
    getPasswordFree() {
        return process.env.TEST_PASS_FREE;
    }
    getEmailModal() {
        return process.env.TESTE_USER_MODAL;
    }
    getPasswordModal() {
        return process.env.TEST_PASS_MODAL;
    }
}

export default User;
