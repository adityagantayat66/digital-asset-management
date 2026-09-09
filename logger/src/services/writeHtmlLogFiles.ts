import fs from 'fs';
import path from 'path';
import { ErrorLogPayload } from '..';
import { env } from '../config/env';


const LOG_DIR = path.resolve(process.cwd(), env.LOG_DIR);

/**
 * @Description Formats and appends a styled HTML card for an error log payload into daily HTML log backup file.
 * @Params payload (ErrorLogPayload) - System error log entry payload
 * @Returns Promise<void>
 */
export async function writeHtmlLogToFile(payload: ErrorLogPayload): Promise<void> {
    // 1. Ensure 'Error-Logs' directory exists
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // 2. Format today's log filename: Error-Logs/error_log_2026-09-05.html
    const dateStr = new Date().toISOString().split('T')[0];
    const filePath = path.join(LOG_DIR, `error_log_${dateStr}.html`);

    // 3. If file does not exist, write the HTML Header wrapper first
    if (!fs.existsSync(filePath)) {
        const headerHtml = getHtmlLogHeader(dateStr);
        await fs.promises.appendFile(filePath, headerHtml, 'utf8');
    }

    // 4. Generate the HTML card for this error entry and append it to the file
    const cardHtml = generateErrorCardHtml(payload);
    await fs.promises.appendFile(filePath, cardHtml, 'utf8');
}

/**
 * @Description Generates HTML document head and layout header string for daily log files.
 * @Params dateStr (string) - Date string identifier
 * @Returns string - Formatted HTML header string
 */
function getHtmlLogHeader(dateStr: string): string {
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DAM System Error Logs - ${dateStr}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
                h1 { font-size: 22px; color: #f8fafc; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 24px; }
                .log-card { background: #1e293b; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ef4444; padding: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); }
                .log-card.warn { border-left-color: #f59e0b; }
                .log-card.critical { border-left-color: #dc2626; background: #2a1215; }
                .log-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
                .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
                .error-badge { background: #7f1d1d; color: #fca5a5; }
                .warn-badge { background: #78350f; color: #fde68a; }
                .critical-badge { background: #991b1b; color: #ffffff; }
                .function-tag { background: #334155; color: #38bdf8; font-family: monospace; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
                .origin-tag { background: #715212ff; color: #ffffff; font-family: monospace; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
                .code-tag { background: #1e1b4b; color: #a5b4fc; font-family: monospace; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
                .timestamp { margin-left: auto; color: #64748b; font-size: 12px; font-family: monospace; }
                .error-message { font-size: 15px; font-weight: 600; color: #f8fafc; margin-bottom: 8px; }
                .request-meta { display: flex; gap: 16px; font-size: 12px; color: #94a3b8; margin-bottom: 8px; background: #0f172a; padding: 8px 12px; border-radius: 4px; }
                .meta-box pre, pre code { color: #fca5a5; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px; }
                summary { cursor: pointer; color: #38bdf8; font-size: 13px; font-weight: 500; margin-top: 8px; }
                summary:hover { text-decoration: underline; }
            </style>
            </head>
            <body>
            <h1>🚨 Digital Asset Management - System Error Logs (${dateStr})</h1>
            <div id="log-entries">
            `;
}

// Helper to escape HTML special characters to prevent XSS in log viewer
/**
 * @Description Escapes special HTML characters in log values to prevent XSS.
 * @Params str (string) - Raw unescaped string
 * @Returns string - Escaped safe HTML string
 */
function escapeHtml(str: string = ''): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @Description Constructs styled HTML card component representation of error payload.
 * @Params payload (ErrorLogPayload) - System error log entry payload
 * @Returns string - Formatted HTML card string
 */
function generateErrorCardHtml(payload: ErrorLogPayload): string {
    const levelClass = (payload.level || 'ERROR').toLowerCase();

    const stackHtml = payload.stack
        ? `<details>
        <summary>View Stack Trace</summary>
        <pre><code>${escapeHtml(payload.stack)}</code></pre>
       </details>`
        : '';

    const detailsHtml = payload.details
        ? `<div class="meta-box">
        <strong>Details / Context:</strong>
        <pre>${escapeHtml(JSON.stringify(payload.details, null, 2))}</pre>
       </div>`
        : '';

    const requestMeta = payload.requestContext
        ? `<div class="request-meta">
        <span><strong>Method:</strong> ${escapeHtml(payload.requestContext.method)}</span>
        <span><strong>URL:</strong> ${escapeHtml(payload.requestContext.url)}</span>
        ${payload.requestContext.userId ? `<span><strong>User ID:</strong> ${escapeHtml(payload.requestContext.userId)}</span>` : ''}
       </div>`
        : '';

    return `
        <!-- ERROR ENTRY: ${payload.timestamp} -->
        <div class="log-card ${levelClass}">
            <div class="log-header">
            <span class="badge ${levelClass}-badge">${payload.level} ${payload.statusCode || ''}</span>
            <span class="function-tag">${escapeHtml(payload.functionName)}</span>
            ${payload.origin ? `<span class="origin-tag">${escapeHtml(payload.origin)}</span>` : ''}
            ${payload.code ? `<span class="code-tag">${escapeHtml(payload.code)}</span>` : ''}
            <span class="timestamp">${payload.timestamp}</span>
            </div>
            <div class="log-body">
            <div class="error-message">${escapeHtml(payload.message)}</div>
            ${requestMeta}
            ${detailsHtml}
            ${stackHtml}
            </div>
        </div>
        `;
}
