import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import Webhook from '../config/Webhook.js';

const SLACK_WEBHOOK = new Webhook().getWebhook();

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const HEARTBEAT_FILE = path.join(process.cwd(), '.last-slack-heartbeat');

export async function sendMessage(message) {
    const payload = {
        text: message,
    };

    const response = await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error('Failed to send message');
    }
}

export async function sendMetrics(message) {

    const metrics = message.metrics;
    const payload = {
        text: `
        📊 *${message.flow}*
        
        ⏱  *Total Journey*: ${message.totalTime}ms
        🌐 *TTFB*: ${metrics.ttfb}ms
        🎨 *FCP*: ${metrics.fcp ?? "N/A"}ms
        📄 *DOM Loaded*: ${metrics.domContentLoaded}ms
        📦 *Load Complete*: ${metrics.loadComplete}ms
        🔎 *DNS*: ${metrics.dns}ms
        🔌 TCP: ${metrics.tcp}ms
        `
    };

    const response = await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error('Failed to send message');
    }
}

/**
 * Envia log de execução ao Slack assim que o runner é iniciado (toda execução).
 */
export async function sendExecutionLog() {
    const now = new Date();
    const text = `🟢 *Runner executado*
Execução iniciada em: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    await sendMessage(text);
}

/**
 * Envia um heartbeat ao Slack (confirmação de que o runner está ativo).
 * Usado internamente por sendHeartbeatIfDue.
 */
export async function sendHeartbeat() {
    const now = new Date();
    const text = `✅ *Synthetic tests – runner ativo*
Última verificação: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    await sendMessage(text);
}

/**
 * Envia heartbeat ao Slack apenas se já passaram 6h desde o último.
 * Deve ser chamado a cada execução do runner (ex.: no início ou fim do run).
 */
export async function sendHeartbeatIfDue() {
    try {
        let lastMs = 0;
        try {
            const data = await fs.readFile(HEARTBEAT_FILE, 'utf8');
            lastMs = parseInt(data.trim(), 10) || 0;
        } catch {
            // Arquivo não existe ou inválido → envia heartbeat
        }
        const nowMs = Date.now();
        if (nowMs - lastMs >= HEARTBEAT_INTERVAL_MS) {
            await sendHeartbeat();
            await fs.writeFile(HEARTBEAT_FILE, String(nowMs), 'utf8');
        }
    } catch (err) {
        console.warn('Aviso: falha ao enviar heartbeat para o Slack:', err?.message || err);
    }
}