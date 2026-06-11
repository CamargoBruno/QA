import Site from "./Site.js";
import Webhook from "./Webhook.js";
import User from "./User.js";

const site = new Site().getSite();
const webhook = new Webhook().getWebhook();
const user = new User();
const email = user.getEmail();
const password = user.getPassword();
const emailFree = user.getEmailFree();
const passwordFree = user.getPasswordFree();
const emailModal = user.getEmailModal();
const passwordModal = user.getPasswordModal();

class AppConfig {
    constructor() {
        this.site = site;
        this.webhook = webhook;
        this.email = email;
        this.password = password;
        this.emailFree = emailFree;
        this.passwordFree = passwordFree;
        this.emailModal = emailModal;
        this.passwordModal = passwordModal;
    }

    getSite() {
        return this.site;
    }

    getWebhook() {
        return this.webhook;
    }

    getEmail() {
        return this.email;
    }

    getPassword() {
        return this.password;
    }   
    getEmailFree() {
        return this.emailFree;
    }
    getPasswordFree() {
        return this.passwordFree;
    }
    getEmailModal() {
        return this.emailModal;
    }
    getPasswordModal() {
        return this.passwordModal;
    }
}

export default AppConfig;