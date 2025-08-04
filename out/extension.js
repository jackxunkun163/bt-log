"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
let patterns = [];
function activate(context) {
    const config = vscode.workspace.getConfiguration('logTranslator');
    const remoteUrl = config.get('keywordUrl') || '';
    loadPatternsFromRemote(remoteUrl, context);
    context.subscriptions.push(vscode.commands.registerCommand('logTranslator.translateLogToFile', async () => {
        if (!vscode.window.activeTextEditor)
            return;
        const editor = vscode.window.activeTextEditor;
        const lines = editor.document.getText().split(/\r?\n/);
        const matches = [];
        //for (const line of lines) {
        //for (const entry of patterns) {
        //if (entry.regex.test(line)) {
        //matches.push(`[翻译说明] ${entry.description}`);
        //matches.push(`[原始日志] ${line}`);
        //matches.push('');
        //break;
        //}
        //}
        //}
        for (const line of lines) {
            for (const entry of patterns) {
                const match = entry.regex.exec(line);
                if (match) {
                    // 替换 $1、$2... 为正则分组值
                    const descriptionWithParams = entry.description.replace(/\$(\d+)/g, (_, index) => {
                        return match[parseInt(index)] ?? '';
                    });
                    matches.push(`[翻译说明] ${descriptionWithParams}`);
                    matches.push(`[原始日志] ${line}`);
                    matches.push('');
                    break;
                }
            }
        }
        if (matches.length === 0) {
            vscode.window.showInformationMessage('未找到匹配的日志行');
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const outputDir = workspaceFolders?.[0]?.uri.fsPath || context.extensionPath;
        const outputPath = path.join(outputDir, 'translated_log.txt');
        fs.writeFileSync(outputPath, matches.join('\n'), 'utf-8');
        const uri = vscode.Uri.file(outputPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }), vscode.commands.registerCommand('logTranslator.updateKeywords', async () => {
        await loadPatternsFromRemote(remoteUrl, context);
    }));
}
exports.activate = activate;
function fetchKeywordsFromURL(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                }
                catch (e) {
                    reject(new Error('解析 JSON 失败: ' + e.message));
                }
            });
        }).on('error', err => {
            reject(new Error('请求失败: ' + err.message));
        });
    });
}
async function loadPatternsFromRemote(remoteUrl, context) {
    try {
        const raw = await fetchKeywordsFromURL(remoteUrl);
        // 写入本地文件（覆盖 keywords.json）
        const localPath = path.join(context.extensionPath, 'keywords.json');
        fs.writeFileSync(localPath, JSON.stringify(raw, null, 2), 'utf-8');
        // 编译正则表达式
        patterns = raw.map(entry => ({
            ...entry,
            regex: new RegExp(entry.pattern, 'i')
        }));
        vscode.window.showInformationMessage('关键词已从远程加载并保存到本地');
    }
    catch (err) {
        vscode.window.showWarningMessage('远程关键词加载失败，将使用本地默认配置');
        loadPatternsFromLocal(context);
    }
}
function loadPatternsFromLocal(context) {
    const localPath = path.join(context.extensionPath, 'keywords.json');
    if (!fs.existsSync(localPath)) {
        vscode.window.showErrorMessage('本地默认关键词文件缺失');
        return;
    }
    const raw = fs.readFileSync(localPath, 'utf-8');
    const parsed = JSON.parse(raw);
    patterns = parsed.map((entry) => ({
        ...entry,
        regex: new RegExp(entry.pattern, 'i')
    }));
}
