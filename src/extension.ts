import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface PatternEntry {
  pattern: string;
  description: string;
  regex: RegExp;
}

let patterns: PatternEntry[] = [];

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('logTranslator');
  const remoteUrl = config.get<string>('keywordUrl') || '';

  loadPatterns(remoteUrl, context);

  context.subscriptions.push(
    vscode.commands.registerCommand('logTranslator.translateLogToFile', async () => {
      if (!vscode.window.activeTextEditor) return;

      const editor = vscode.window.activeTextEditor;
      const lines = editor.document.getText().split(/\r?\n/);
      const matches: string[] = [];

      for (const line of lines) {
        for (const entry of patterns) {
          if (entry.regex.test(line)) {
            matches.push(`[翻译说明] ${entry.description}`);
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
    }),

    vscode.commands.registerCommand('logTranslator.updateKeywords', async () => {
      await loadPatterns(remoteUrl, context);
    })
  );
}

function fetchKeywordsFromURL(url: string): Promise<{ pattern: string; description: string }[]> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('解析 JSON 失败: ' + (e as Error).message));
        }
      });
    }).on('error', err => {
      reject(new Error('请求失败: ' + err.message));
    });
  });
}

async function loadPatterns(remoteUrl: string, context: vscode.ExtensionContext) {
  try {
    const raw = await fetchKeywordsFromURL(remoteUrl);
    patterns = raw.map(entry => ({
      ...entry,
      regex: new RegExp(entry.pattern, 'i')
    }));
    vscode.window.showInformationMessage('关键词已从远程加载');
  } catch (err: any) {
    vscode.window.showWarningMessage('远程关键词加载失败，使用本地默认配置');
    loadPatternsFromLocal(context);
  }
}

function loadPatternsFromLocal(context: vscode.ExtensionContext) {
  const localPath = path.join(context.extensionPath, 'keywords.json');
  if (!fs.existsSync(localPath)) {
    vscode.window.showErrorMessage('本地默认关键词文件缺失');
    return;
  }
  const raw = fs.readFileSync(localPath, 'utf-8');
  const parsed = JSON.parse(raw);
  patterns = parsed.map((entry: any) => ({
    ...entry,
    regex: new RegExp(entry.pattern, 'i')
  }));

}